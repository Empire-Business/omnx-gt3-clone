// Cron handler — processa scheduled_messages com send_at <= now() e status='pending'.
// Para destinatário (DM): resolve/cria conversa via ensure_dm_conversation.
// Para canal: insere direto via channel_id/tenant_id/author_id (segue padrão do app).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const OMNX_BOT_USER_ID = "00000000-0000-0000-0000-0000000B0001";

serve(async (_req) => {
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const svc = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: due, error } = await svc
      .from("scheduled_messages")
      .select("*")
      .eq("status", "pending")
      .lte("send_at", new Date().toISOString())
      .limit(100);
    if (error) throw error;

    let sent = 0;
    let failed = 0;

    for (const sm of (due || []) as any[]) {
      try {
        if (sm.channel_id) {
          // Mensagem em canal — autor é quem agendou
          await svc.from("chat_messages").insert({
            channel_id: sm.channel_id,
            tenant_id: sm.tenant_id,
            author_id: sm.created_by,
            content: sm.content,
          });
        } else if (sm.recipient_user_id) {
          // DM — usa ensure_dm_conversation (mesma RPC usada por system-bot-notify)
          const { data: conv } = await svc.rpc("ensure_dm_conversation", {
            p_tenant_id: sm.tenant_id,
            p_user_a: sm.created_by,
            p_user_b: sm.recipient_user_id,
          });
          if (conv) {
            // chat_messages para DM usa employee_id/conversation_id
            const { data: emp } = await svc
              .from("employees")
              .select("id")
              .eq("tenant_id", sm.tenant_id)
              .eq("user_id", sm.created_by)
              .maybeSingle();
            if (emp?.id) {
              await svc.from("chat_messages").insert({
                conversation_id: conv,
                employee_id: emp.id,
                content: sm.content,
                type: "text",
              });
            } else {
              throw new Error("employee_id do remetente não encontrado");
            }
          } else {
            throw new Error("conversa DM não criada");
          }
        } else {
          throw new Error("scheduled_message sem channel_id nem recipient_user_id");
        }

        await svc
          .from("scheduled_messages")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", sm.id);
        sent++;

        // Notifica remetente
        await svc.from("notifications").insert({
          tenant_id: sm.tenant_id,
          user_id: sm.created_by,
          type: "scheduled_message_sent",
          title: "Mensagem agendada enviada",
          body: sm.content.slice(0, 140),
          link: sm.channel_id ? `/chat/${sm.channel_id}` : "/chat",
        }).select();
      } catch (e: any) {
        failed++;
        await svc
          .from("scheduled_messages")
          .update({ status: "failed", error_message: (e?.message || "erro").slice(0, 500) })
          .eq("id", sm.id);
        console.error("[process-scheduled-messages] falha em", sm.id, e?.message);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed: (due || []).length, sent, failed }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("[process-scheduled-messages] erro:", e);
    return new Response(JSON.stringify({ error: e?.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
