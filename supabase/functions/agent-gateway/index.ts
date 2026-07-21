/**
 * agent-gateway — Edge Function para integração com agentes externos (OpenClaw, etc.)
 *
 * Autenticação: header x-api-key com chave gerada em Configurações → aba API.
 * O token nunca é armazenado — apenas seu SHA-256 (mesmo padrão do ghl-webhook).
 *
 * Ações de dados (requerem x-api-key):
 *   whoami | list_projects | create_project | update_project
 *   list_tasks | create_task | update_task | move_task | delete_task
 *   list_columns | list_employees
 *
 * Ações de gerenciamento de chaves (requerem Bearer JWT do usuário logado):
 *   list_api_keys | create_api_key | revoke_api_key
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function sha256(message: string): Promise<string> {
  const data = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error("Missing required Supabase environment variables");
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const action = body.action as string;
  if (!action) return json({ error: "Missing 'action' field" }, 400);

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  // ── Ações de gerenciamento de chaves — requerem JWT ───────────────────────
  const KEY_MANAGEMENT_ACTIONS = ["list_api_keys", "create_api_key", "revoke_api_key"];

  if (KEY_MANAGEMENT_ACTIONS.includes(action)) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const { data: profile } = await userClient
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", user.id)
      .single();
    if (!profile?.tenant_id) return json({ error: "Tenant not found" }, 403);

    const { data: roleRow } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();
    if (roleRow?.role !== "admin") return json({ error: "Forbidden: admin only" }, 403);

    const tenantId = profile.tenant_id;

    switch (action) {
      case "list_api_keys": {
        const { data, error } = await serviceClient
          .from("agent_api_keys")
          .select("id, name, is_active, last_used_at, created_at")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false });
        if (error) return json({ error: error.message }, 500);
        return json({ action, keys: data });
      }

      case "create_api_key": {
        const { name, raw_key } = body as { name?: string; raw_key?: string };
        if (!raw_key) return json({ error: "'raw_key' is required" }, 400);
        const keyHash = await sha256(raw_key);
        const { data, error } = await serviceClient
          .from("agent_api_keys")
          .insert({
            tenant_id: tenantId,
            user_id: user.id,
            key_hash: keyHash,
            name: name || "OpenClaw",
          })
          .select("id, name, is_active, created_at")
          .single();
        if (error) {
          if (error.code === "23505") return json({ error: "This key already exists" }, 409);
          return json({ error: error.message }, 500);
        }
        return json({ action, key: data });
      }

      case "revoke_api_key": {
        const { key_id } = body as { key_id?: string };
        if (!key_id) return json({ error: "'key_id' is required" }, 400);
        const { error } = await serviceClient
          .from("agent_api_keys")
          .delete()
          .eq("id", key_id)
          .eq("tenant_id", tenantId);
        if (error) return json({ error: error.message }, 500);
        return json({ action, revoked: true, key_id });
      }
    }
  }

  // ── Ações de dados — requerem x-api-key ───────────────────────────────────
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) {
    return json({
      error: "Missing x-api-key header",
      hint: "Generate a key in Configurações → aba API and pass it as x-api-key",
    }, 401);
  }

  const keyHash = await sha256(apiKey);
  const { data: keyRecord, error: keyErr } = await serviceClient
    .from("agent_api_keys")
    .select("id, tenant_id, user_id")
    .eq("key_hash", keyHash)
    .eq("is_active", true)
    .single();

  if (keyErr || !keyRecord) return json({ error: "Invalid or revoked API key" }, 401);

  const { tenant_id: tenantId, user_id: userId } = keyRecord;

  // Atualiza last_used_at em background — não bloqueia a resposta
  serviceClient
    .from("agent_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyRecord.id)
    .then(() => {});

  // ── Dispatcher ─────────────────────────────────────────────────────────────
  try {
    switch (action) {

      // ── whoami ──────────────────────────────────────────────────────────────
      case "whoami": {
        const { data: profile } = await serviceClient
          .from("profiles")
          .select("full_name")
          .eq("user_id", userId)
          .single();
        const { data: roleRow } = await serviceClient
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .single();
        return json({
          action,
          user: {
            user_id: userId,
            full_name: profile?.full_name ?? null,
            role: roleRow?.role ?? "member",
            tenant_id: tenantId,
          },
        });
      }

      // ── PROJETOS ────────────────────────────────────────────────────────────
      case "list_projects": {
        const { data, error } = await serviceClient
          .from("projects")
          .select("id, name, description, status, priority, created_at, created_by")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false });
        if (error) return json({ error: error.message }, 500);
        return json({ action, projects: data });
      }

      case "create_project": {
        const { name, description, status } = body as {
          name?: string; description?: string; status?: string;
        };
        if (!name) return json({ error: "'name' is required" }, 400);
        const { data, error } = await serviceClient
          .from("projects")
          .insert({
            name,
            description: description ?? null,
            status: status ?? "active",
            tenant_id: tenantId,
            created_by: userId,
          })
          .select()
          .single();
        if (error) return json({ error: error.message }, 500);
        return json({ action, project: data });
      }

      case "update_project": {
        const { project_id, name, description, status } = body as {
          project_id?: string; name?: string; description?: string; status?: string;
        };
        if (!project_id) return json({ error: "'project_id' is required" }, 400);
        const updates: Record<string, unknown> = {};
        if (name !== undefined) updates.name = name;
        if (description !== undefined) updates.description = description;
        if (status !== undefined) updates.status = status;
        const { data, error } = await serviceClient
          .from("projects")
          .update(updates)
          .eq("id", project_id)
          .eq("tenant_id", tenantId)
          .select()
          .single();
        if (error) return json({ error: error.message }, 500);
        return json({ action, project: data });
      }

      // ── TAREFAS ─────────────────────────────────────────────────────────────
      case "list_tasks": {
        const { project_id, status: taskStatus } = body as {
          project_id?: string; status?: string;
        };
        let query = serviceClient
          .from("tasks")
          .select("id, title, description, status, priority, due_date, sort_order, created_at, project_id, assignee_id")
          .eq("tenant_id", tenantId)
          .order("sort_order", { ascending: true });
        if (project_id) query = query.eq("project_id", project_id);
        if (taskStatus) query = query.eq("status", taskStatus);
        const { data, error } = await query;
        if (error) return json({ error: error.message }, 500);
        return json({ action, tasks: data });
      }

      case "create_task": {
        const { title, description, project_id, status: taskStatus, priority, due_date, assignee_employee_id } = body as {
          title?: string; description?: string; project_id?: string;
          status?: string; priority?: string; due_date?: string;
          assignee_employee_id?: string;
        };
        if (!title) return json({ error: "'title' is required" }, 400);
        if (!project_id) return json({ error: "'project_id' is required" }, 400);
        // Validate project belongs to this tenant before inserting
        const { data: projectCheck, error: projectErr } = await serviceClient
          .from("projects")
          .select("id")
          .eq("id", project_id)
          .eq("tenant_id", tenantId)
          .maybeSingle();
        if (projectErr || !projectCheck) return json({ error: "Project not found or unauthorized" }, 403);
        const { data, error } = await serviceClient
          .from("tasks")
          .insert({
            title,
            description: description ?? null,
            project_id,
            status: taskStatus ?? "todo",
            priority: priority ?? "medium",
            due_date: due_date ?? null,
            assignee_id: assignee_employee_id ?? null,
            tenant_id: tenantId,
            created_by: userId,
          })
          .select()
          .single();
        if (error) return json({ error: error.message }, 500);
        return json({ action, task: data });
      }

      case "update_task": {
        const { task_id, title, description, status: taskStatus, priority, due_date, assignee_employee_id } = body as {
          task_id?: string; title?: string; description?: string;
          status?: string; priority?: string; due_date?: string;
          assignee_employee_id?: string;
        };
        if (!task_id) return json({ error: "'task_id' is required" }, 400);
        const updates: Record<string, unknown> = {};
        if (title !== undefined) updates.title = title;
        if (description !== undefined) updates.description = description;
        if (taskStatus !== undefined) updates.status = taskStatus;
        if (priority !== undefined) updates.priority = priority;
        if (due_date !== undefined) updates.due_date = due_date;
        if (assignee_employee_id !== undefined) updates.assignee_id = assignee_employee_id;
        const { data, error } = await serviceClient
          .from("tasks")
          .update(updates)
          .eq("id", task_id)
          .eq("tenant_id", tenantId)
          .select()
          .single();
        if (error) return json({ error: error.message }, 500);
        return json({ action, task: data });
      }

      case "move_task": {
        const { task_id, status: newStatus } = body as { task_id?: string; status?: string };
        if (!task_id) return json({ error: "'task_id' is required" }, 400);
        if (!newStatus) return json({ error: "'status' is required" }, 400);
        const { data, error } = await serviceClient
          .from("tasks")
          .update({ status: newStatus })
          .eq("id", task_id)
          .eq("tenant_id", tenantId)
          .select()
          .single();
        if (error) return json({ error: error.message }, 500);
        return json({ action, task: data });
      }

      case "delete_task": {
        const { task_id } = body as { task_id?: string };
        if (!task_id) return json({ error: "'task_id' is required" }, 400);
        const { error } = await serviceClient
          .from("tasks")
          .delete()
          .eq("id", task_id)
          .eq("tenant_id", tenantId);
        if (error) return json({ error: error.message }, 500);
        return json({ action, deleted: true, task_id });
      }

      // ── KANBAN ──────────────────────────────────────────────────────────────
      case "list_columns": {
        const { data, error } = await serviceClient
          .from("kanban_columns")
          .select("id, name, color, sort_order, wip_limit")
          .eq("tenant_id", tenantId)
          .order("sort_order", { ascending: true });
        if (error) return json({ error: error.message }, 500);
        return json({ action, columns: data });
      }

      // ── COLABORADORES ───────────────────────────────────────────────────────
      case "list_employees": {
        const { data, error } = await serviceClient
          .from("employees")
          .select(`
            id, status, is_ceo,
            profile:profiles!employees_user_id_fkey(full_name),
            positions:employee_positions(
              is_primary,
              position:positions(id, title)
            )
          `)
          .eq("tenant_id", tenantId)
          .eq("status", "active");
        if (error) return json({ error: error.message }, 500);
        return json({ action, employees: data });
      }

      default:
        return json({
          error: `Unknown action: '${action}'`,
          available_actions: [
            "whoami",
            "list_projects", "create_project", "update_project",
            "list_tasks", "create_task", "update_task", "move_task", "delete_task",
            "list_columns",
            "list_employees",
          ],
        }, 400);
    }
  } catch (err: unknown) {
    return json({ error: (err as Error).message || "Internal error" }, 500);
  }
});
