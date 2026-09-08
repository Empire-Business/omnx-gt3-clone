import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const ALLOWED_ORIGINS = [
  "https://gt3.omnx.pro",
  "https://t3.empirebusiness.com.br",
  "https://gt3.empirebusiness.com.br",
  "http://localhost:5173",
  "http://localhost:8080",
];

function getCorsHeaders(origin: string) {
  const allowed = origin || ALLOWED_ORIGINS[0]; // reflete o origin (auth por bearer token, nao cookie) — suporta Vercel previews e dominios de tenant
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  const corsHeaders = getCorsHeaders(origin);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { meeting_id, approved_projects, approved_tasks } = await req.json();
    if (!meeting_id) {
      return new Response(JSON.stringify({ error: "meeting_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get meeting to find tenant_id
    const { data: meeting, error: meetingErr } = await serviceClient
      .from("meetings")
      .select("tenant_id")
      .eq("id", meeting_id)
      .single();

    if (meetingErr || !meeting) {
      return new Response(JSON.stringify({ error: "Meeting not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Verifica que o user autenticado pertence ao tenant da reunião
    const { data: profile, error: profErr } = await serviceClient
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", user.id)
      .single();
    if (profErr || !profile || profile.tenant_id !== meeting.tenant_id) {
      return new Response(JSON.stringify({ error: "Forbidden: tenant mismatch" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tenant_id = meeting.tenant_id;
    const createdItems: { type: string; id: string }[] = [];
    const skippedItems: { type: string; title: string }[] = [];

    /**
     * Identidade de uma sugestao da IA. Ela nao tem id estavel, entao o que
     * define "e o mesmo item" e (reuniao, tipo, titulo normalizado). Precisa
     * casar exatamente com o backfill da migration 20260903140000.
     */
    const suggestionKey = (titulo: string | null | undefined) =>
      (titulo ?? "").trim().toLowerCase().replace(/\s+/g, " ");

    /**
     * RESERVA o item antes de cria-lo. Devolve false quando ele ja tinha sido
     * aprovado nesta reuniao — ai o chamador pula.
     *
     * Por que reservar em vez de "consultar e depois inserir": duas execucoes
     * simultaneas (retentativa do invoke, dois cliques em abas diferentes)
     * passariam juntas por uma consulta previa e criariam as duas tarefas. O
     * INSERT com ON CONFLICT DO NOTHING resolve no banco, contra o indice
     * unico meeting_approved_items_dedupe_uq. Mesmo padrao do
     * notify-upcoming-events.
     */
    async function reservarItem(
      item_type: "task" | "project",
      titulo: string | null | undefined,
      original_suggestion: unknown,
    ): Promise<string | null> {
      const { data, error } = await serviceClient
        .from("meeting_approved_items")
        .upsert(
          {
            meeting_id,
            tenant_id,
            item_type,
            suggestion_key: suggestionKey(titulo),
            item_id: null,
            original_suggestion,
          },
          { onConflict: "meeting_id,item_type,suggestion_key", ignoreDuplicates: true },
        )
        .select("id")
        .maybeSingle();

      if (error) {
        console.error(`[meeting-approve] falha ao reservar ${item_type} "${titulo}":`, error.message);
        return null;
      }
      // Sem linha de volta = ON CONFLICT DO NOTHING = ja estava aprovado.
      return data?.id ?? null;
    }

    /** Liga a reserva ao registro real, ou desfaz se a criacao falhou. */
    async function concluirReserva(reservaId: string, itemId: string | null) {
      if (itemId) {
        await serviceClient
          .from("meeting_approved_items")
          .update({ item_id: itemId })
          .eq("id", reservaId);
      } else {
        // Sem isso, um erro na criacao deixaria a reserva travando a proxima
        // tentativa legitima de aprovar aquele item.
        const { error } = await serviceClient
          .from("meeting_approved_items")
          .delete()
          .eq("id", reservaId);
        if (error) {
          console.error("[meeting-approve] ROLLBACK DA RESERVA FALHOU:", error.message);
        }
      }
    }

    // Create approved projects
    if (approved_projects?.length) {
      for (const proj of approved_projects) {
        const reservaId = await reservarItem("project", proj.name, proj);
        if (!reservaId) {
          skippedItems.push({ type: "project", title: proj.name });
          continue;
        }

        const { data: created, error: projErr } = await serviceClient
          .from("projects")
          .insert({
            name: proj.name,
            description: proj.description,
            priority: proj.priority || "medium",
            status: "planning",
            tenant_id,
            created_by: user.id,
          })
          .select("id")
          .single();

        if (projErr) {
          console.error("Error creating project:", projErr);
          await concluirReserva(reservaId, null);
          continue;
        }

        createdItems.push({ type: "project", id: created.id });
        await concluirReserva(reservaId, created.id);
      }
    }

    // Create approved tasks
    if (approved_tasks?.length) {
      for (const task of approved_tasks) {
        const reservaId = await reservarItem("task", task.title, task);
        if (!reservaId) {
          skippedItems.push({ type: "task", title: task.title });
          continue;
        }

        let projectId = task.project_id || null;

        // If project_name is provided but no project_id, look for existing project by name
        if (!projectId && task.project_name?.trim()) {
          const { data: existingProject } = await serviceClient
            .from("projects")
            .select("id")
            .eq("tenant_id", tenant_id)
            .ilike("name", task.project_name.trim())
            .maybeSingle();

          if (existingProject) {
            projectId = existingProject.id;
          }
          // If no existing project found, task is created without a project (projectId stays null)
        }

        const { data: created, error: taskErr } = await serviceClient
          .from("tasks")
          .insert({
            title: task.title,
            description: task.description,
            priority: task.priority || "medium",
            status: "todo",
            tenant_id,
            created_by: user.id,
            project_id: projectId,
            assignee_id: task.assignee_id || null,
            due_date: task.due_date || null,
            source_meeting_id: meeting_id,
          })
          .select("id")
          .single();

        if (taskErr) {
          console.error("Error creating task:", taskErr);
          await concluirReserva(reservaId, null);
          continue;
        }

        // ===== Cria subtarefas REAIS (linhas em tasks com parent_task_id) =====
        if (created && task.subtasks?.length) {
          const subtaskRows = task.subtasks.map((sub: any) => ({
            title: sub.title,
            description: sub.description || null,
            priority: sub.priority || "medium",
            status: "todo",
            tenant_id,
            created_by: user.id,
            project_id: projectId,
            parent_task_id: created.id,
            assignee_id: null, // suggested_assignee é texto livre — resolver depois
            due_date: sub.suggested_due_date || null,
            source_meeting_id: meeting_id,
          }));
          const { error: subErr } = await serviceClient.from("tasks").insert(subtaskRows);
          if (subErr) console.error("Error creating subtasks:", subErr);
        }

        // If task was created successfully and has expanded fields, update description with them
        // Steps e acceptance_criteria continuam como markdown (são micro-passos, não tasks).
        // Dependencies viram entidades reais em task_dependencies depois (resolução em 2 passes).
        if (created && (task.steps?.length || task.acceptance_criteria?.length)) {
          let enhancedDescription = task.description || "";

          if (task.steps?.length) {
            enhancedDescription += "\n\n## Passos\n";
            task.steps.forEach((step: any) => {
              enhancedDescription += `${step.order}. ${step.description}${step.estimated_time ? ` _(${step.estimated_time})_` : ''}\n`;
            });
          }

          if (task.acceptance_criteria?.length) {
            enhancedDescription += "\n\n## Critérios de Aceite\n";
            task.acceptance_criteria.forEach((criteria: string) => {
              enhancedDescription += `- ${criteria}\n`;
            });
          }

          if (task.dependencies?.length) {
            enhancedDescription += "\n\n## Dependências\n";
            task.dependencies.forEach((dep: any) => {
              const depType = dep.dependency_type === "blocks" ? "Bloqueia" :
                              dep.dependency_type === "blocked_by" ? "Bloqueada por" : "Relacionada a";
              enhancedDescription += `- ${depType}: ${dep.task_title_ref}\n`;
            });
          }

          // Update task with enhanced description
          await serviceClient
            .from("tasks")
            .update({ description: enhancedDescription.trim() })
            .eq("id", created.id);
        }

        createdItems.push({ type: "task", id: created.id });
        await concluirReserva(reservaId, created.id);
      }
    }

    // Update meeting approval status
    await serviceClient.from("meetings").update({
      approval_status: "approved",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    }).eq("id", meeting_id);

    // `skipped_items` diz o que ja tinha sido aprovado antes. Sem isso, uma
    // segunda aprovacao responderia "sucesso" com lista vazia e o usuario
    // ficaria sem entender por que nada apareceu.
    return new Response(JSON.stringify({
      success: true,
      created_items: createdItems,
      skipped_items: skippedItems,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("meeting-approve error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
