// send-push — envio genérico de Web Push (tarefa atribuída, novo post no feed).
// Chamada server-side pelos triggers do banco via pg_net, autenticada por um
// segredo interno (x-internal-secret == env INTERNAL_PUSH_SECRET). NÃO usa JWT
// (verify_jwt=false no config.toml), por isso a validação do segredo é obrigatória.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { pushToSubscriptions, type VapidConfig } from "../_shared/webpush.ts";

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const secret = Deno.env.get("INTERNAL_PUSH_SECRET") ?? "";
  if (!secret || req.headers.get("x-internal-secret") !== secret) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const vapid: VapidConfig = {
      publicKey: Deno.env.get("VAPID_PUBLIC_KEY") ?? "",
      privateKey: Deno.env.get("VAPID_PRIVATE_KEY") ?? "",
      subject: Deno.env.get("VAPID_SUBJECT") ?? "mailto:suporte@gt3.com",
    };
    if (!vapid.publicKey || !vapid.privateKey) return json({ error: "vapid keys missing" }, 500);

    const body = await req.json();
    const employeeIds: string[] = Array.isArray(body.employee_ids) ? body.employee_ids : [];
    if (!employeeIds.length) return json({ sent: 0, reason: "no targets" });

    const { data: subs, error: subsErr } = await supabase
      .from("push_subscriptions")
      .select("endpoint, keys")
      .in("employee_id", employeeIds);

    // O `error` não era desestruturado: uma consulta que falhava caía no
    // `!subs?.length` e respondia 200 {sent:0,"no subscriptions"} — falha total
    // reportada como sucesso, e o chamador (trigger/cron) nunca soube. Erro de
    // consulta é 500; "ninguém tem subscription" continua sendo 200, que é
    // resultado legítimo para os demais chamadores.
    if (subsErr) {
      console.error("[send-push] falha lendo push_subscriptions:", subsErr.message);
      return json({ error: subsErr.message }, 500);
    }

    if (!subs?.length) return json({ sent: 0, reason: "no subscriptions" });

    // Sem `icon` e com URL RELATIVA de propósito: o service worker resolve os
    // dois a partir do próprio origin. Depender de SITE_URL aqui significa que
    // um env apontando para domínio antigo quebra o ícone da notificação e
    // manda o clique para um site morto.
    const payload = {
      title: (body.title as string) ?? "GT3",
      body: (body.body as string) ?? "",
      tag: (body.tag as string) ?? "gt3",
      data: { url: (body.url as string) ?? "/" },
    };

    const { sent, failed, deadEndpoints, results } = await pushToSubscriptions(
      subs as Array<{ endpoint: string; keys: { p256dh: string; auth: string } }>,
      payload,
      vapid,
    );

    if (deadEndpoints.length) {
      await supabase.from("push_subscriptions").delete().in("endpoint", deadEndpoints);
    }
    console.log(`[send-push] sent=${sent} failed=${failed}`, JSON.stringify(results));

    return json({ sent, failed });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[send-push] erro:", message);
    return json({ error: message }, 500);
  }
});
