/**
 * email-unread-chat — notificação por email de mensagens de chat não lidas.
 *
 * Disparado pelo pg_cron (1min). Para cada conversa que ficou >= 5 min sem
 * atividade e ainda tem mensagens não lidas pelo destinatário, envia 1 email
 * (digest) ao email cadastrado da pessoa via Resend, e registra o envio em
 * `chat_email_notifications` para não repetir.
 *
 * Segurança: `verify_jwt = false`. Exige header `x-cron-secret` igual à env
 * CRON_SECRET (quando definida) OU `Authorization: Bearer <service_role>`.
 *
 * Envs necessárias:
 *   RESEND_API_KEY   — chave da API Resend
 *   EMAIL_FROM       — remetente verificado, ex: "GT3 <nao-responda@dominio>"
 *   CRON_SECRET      — segredo compartilhado com o cron
 *   SITE_URL         — base do app (default https://gt3.omnx.pro)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const QUIET_MINUTES = 5;
const MAX_PER_RUN = 100;

interface UnreadRow {
  tenant_id: string;
  channel_id: string;
  channel_name: string | null;
  is_dm: boolean;
  user_id: string;
  unread_count: number;
  latest_message_at: string;
  latest_sender_id: string | null;
  latest_sender_name: string | null;
  latest_preview: string | null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildEmailHtml(opts: {
  recipientName: string | null;
  context: string;
  senderName: string;
  preview: string;
  unreadCount: number;
  link: string;
  tenantName: string;
  brandColor: string;
}): string {
  const { context, senderName, preview, unreadCount, link, tenantName, brandColor } = opts;
  const countLabel = unreadCount > 1
    ? `${unreadCount} novas mensagens`
    : `1 nova mensagem`;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
        <tr><td style="background:${brandColor};padding:18px 24px;">
          <span style="color:#ffffff;font-size:16px;font-weight:700;">${escapeHtml(tenantName)}</span>
        </td></tr>
        <tr><td style="padding:24px;">
          <p style="margin:0 0 4px;font-size:14px;color:#71717a;">${escapeHtml(context)}</p>
          <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#18181b;">${escapeHtml(countLabel)}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;border-radius:8px;">
            <tr><td style="padding:14px 16px;">
              <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#18181b;">${escapeHtml(senderName)}</p>
              <p style="margin:0;font-size:14px;color:#3f3f46;line-height:1.4;">${escapeHtml(preview)}</p>
            </td></tr>
          </table>
          <a href="${link}" style="display:inline-block;margin-top:20px;background:${brandColor};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 22px;border-radius:8px;">Abrir conversa</a>
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #e4e4e7;">
          <p style="margin:0;font-size:11px;color:#a1a1aa;">Você recebeu este email porque tem mensagens não lidas no chat do ${escapeHtml(tenantName)}.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendResendEmail(opts: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: opts.from,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.error(`[email-unread-chat] Resend ${res.status}: ${txt}`);
    return false;
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });

  const json = (data: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  try {
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
    const auth = req.headers.get("Authorization") ?? "";
    const headerSecret = req.headers.get("x-cron-secret") ?? "";

    const authorized =
      auth === `Bearer ${serviceRole}` ||
      (cronSecret !== "" && headerSecret === cronSecret);
    if (!authorized) return json({ error: "Unauthorized" }, 401);

    const apiKey = Deno.env.get("RESEND_API_KEY") ?? "";
    const from = Deno.env.get("EMAIL_FROM") ?? "";
    const siteUrl = Deno.env.get("SITE_URL") ?? "https://gt3.omnx.pro";
    if (!apiKey || !from) {
      return json({ error: "RESEND_API_KEY/EMAIL_FROM ausentes" }, 500);
    }

    const svc = createClient(Deno.env.get("SUPABASE_URL")!, serviceRole);

    const { data: rows, error } = await svc.rpc("get_unread_chat_for_email", {
      p_quiet: `${QUIET_MINUTES} minutes`,
    });
    if (error) return json({ error: error.message }, 500);

    const candidates = (rows as UnreadRow[] | null) ?? [];
    if (!candidates.length) return json({ sent: 0 });

    // Cache de nomes/cores por tenant
    const tenantCache = new Map<string, { name: string; color: string }>();
    async function getTenant(id: string) {
      if (tenantCache.has(id)) return tenantCache.get(id)!;
      const { data: t } = await svc
        .from("tenants")
        .select("name, primary_color")
        .eq("id", id)
        .maybeSingle();
      const info = {
        name: (t as any)?.name || "Chat",
        color: (t as any)?.primary_color || "#7C3AED",
      };
      tenantCache.set(id, info);
      return info;
    }

    let sent = 0;
    for (const r of candidates.slice(0, MAX_PER_RUN)) {
      // Email cadastrado do destinatário (auth.users)
      const { data: userRes } = await svc.auth.admin.getUserById(r.user_id);
      const email = userRes?.user?.email;
      if (!email) continue;

      const tenant = await getTenant(r.tenant_id);
      const senderName = r.latest_sender_name || "Alguém";
      const context = r.is_dm
        ? `Mensagem direta de ${senderName}`
        : `No canal #${r.channel_name || "chat"}`;
      const preview = r.latest_preview?.trim() || "[mídia]";
      const link = `${siteUrl}/chat/${r.channel_id}`;
      const subject = r.is_dm
        ? `${senderName} te enviou ${r.unread_count > 1 ? `${r.unread_count} mensagens` : "uma mensagem"}`
        : `${r.unread_count > 1 ? `${r.unread_count} novas mensagens` : "Nova mensagem"} em #${r.channel_name || "chat"}`;

      const html = buildEmailHtml({
        recipientName: null,
        context,
        senderName,
        preview,
        unreadCount: r.unread_count,
        link,
        tenantName: tenant.name,
        brandColor: tenant.color,
      });

      const ok = await sendResendEmail({ apiKey, from, to: email, subject, html });
      if (!ok) continue;

      // Registra envio (dedupe)
      await svc.from("chat_email_notifications").upsert(
        {
          tenant_id: r.tenant_id,
          channel_id: r.channel_id,
          user_id: r.user_id,
          last_emailed_message_at: r.latest_message_at,
          emailed_at: new Date().toISOString(),
        },
        { onConflict: "channel_id,user_id" },
      );
      sent++;
    }

    return json({ sent, candidates: candidates.length });
  } catch (err) {
    console.error("[email-unread-chat]", err);
    return json({ error: (err as Error).message || "internal error" }, 500);
  }
});
