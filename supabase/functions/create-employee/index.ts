import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const ALLOWED_ORIGINS = [
  "https://gt3.omnx.pro",
  "https://gt3.empirebusiness.com.br",
  "https://t3.empirebusiness.com.br",
  "http://localhost:8080",
  "http://localhost:5173",
];

function getCorsHeaders(origin: string) {
  const allowed = origin || ALLOWED_ORIGINS[0]; // reflete o origin (auth por bearer token, nao cookie) — suporta Vercel previews e dominios de tenant
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildInviteEmailHtml(opts: {
  recipientName: string;
  link: string;
  tenantName: string;
  brandColor: string;
  siteUrl: string;
  email: string;
  tempPassword: string;
}): string {
  const { recipientName, link, tenantName, brandColor, siteUrl, email, tempPassword } = opts;
  const firstName = recipientName.trim().split(/\s+/)[0] || recipientName;
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
          <p style="margin:0 0 12px;font-size:18px;font-weight:700;color:#18181b;">Olá, ${escapeHtml(firstName)}!</p>
          <p style="margin:0 0 8px;font-size:14px;color:#3f3f46;line-height:1.5;">Você foi convidado para acessar a plataforma <strong>${escapeHtml(tenantName)}</strong>.</p>
          <p style="margin:0 0 16px;font-size:14px;color:#3f3f46;line-height:1.5;">Use os dados abaixo para entrar pela primeira vez:</p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;margin:0 0 16px;">
            <tr><td style="padding:14px 16px;">
              <p style="margin:0 0 4px;font-size:11px;color:#a1a1aa;text-transform:uppercase;letter-spacing:.04em;">Endereço da plataforma</p>
              <p style="margin:0 0 12px;font-size:14px;"><a href="${siteUrl}" style="color:${brandColor};text-decoration:none;font-weight:600;">${escapeHtml(siteUrl)}</a></p>
              <p style="margin:0 0 4px;font-size:11px;color:#a1a1aa;text-transform:uppercase;letter-spacing:.04em;">Seu e-mail</p>
              <p style="margin:0 0 12px;font-size:14px;color:#18181b;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${escapeHtml(email)}</p>
              <p style="margin:0 0 4px;font-size:11px;color:#a1a1aa;text-transform:uppercase;letter-spacing:.04em;">Senha temporária</p>
              <p style="margin:0;font-size:18px;font-weight:700;color:#18181b;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.02em;">${escapeHtml(tempPassword)}</p>
            </td></tr>
          </table>

          <p style="margin:0 0 16px;font-size:14px;color:#3f3f46;line-height:1.5;">Assim que entrar, <strong>troque essa senha</strong> em Configurações — ela é provisória e serve só para o primeiro acesso.</p>
          <a href="${siteUrl}" style="display:inline-block;background:${brandColor};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">Acessar a plataforma</a>
          <p style="margin:20px 0 0;font-size:13px;color:#3f3f46;line-height:1.5;">Prefere já definir a sua própria senha? <a href="${link}" style="color:${brandColor};font-weight:600;">Clique aqui para criar uma senha nova</a> (este link vale por 1 hora).</p>
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #e4e4e7;">
          <p style="margin:0;font-size:11px;color:#a1a1aa;">Este convite é pessoal. Se você não esperava por ele, ignore este email.</p>
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
  /** Alternativa em texto puro — email só-HTML pontua como spam. */
  text: string;
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
      text: opts.text,
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.log(`[create-employee] Resend ${res.status}: ${txt}`);
    return false;
  }
  return true;
}

/**
 * Envia o email de acesso via Resend, com branding do tenant. O email traz
 * SEMPRE a senha temporária + o endereço da plataforma + o aviso de trocar a
 * senha ao entrar, e ainda um link de recovery para quem preferir definir a
 * própria senha na hora. Retorna true se o email foi enviado.
 *
 * O acesso nunca depende deste envio: a senha temporária também é devolvida ao
 * admin na resposta, então uma falha de email não trava o colaborador.
 */
async function dispatchInvite(
  serviceClient: ReturnType<typeof createClient>,
  opts: { email: string; fullName: string; tenantId: string; tempPassword: string },
): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const from = Deno.env.get("EMAIL_FROM") ?? "";
  const siteUrl = Deno.env.get("SITE_URL") ?? "https://gt3.omnx.pro";
  if (!apiKey || !from) {
    console.log("[create-employee] Invite skipped: RESEND_API_KEY/EMAIL_FROM ausentes");
    return false;
  }

  const { data: linkData, error: linkErr } = await serviceClient.auth.admin.generateLink({
    type: "recovery",
    email: opts.email,
    options: { redirectTo: `${siteUrl}/reset-password` },
  });
  if (linkErr || !linkData?.properties?.action_link) {
    console.log("[create-employee] Invite link generation failed:", linkErr?.message);
    return false;
  }

  const { data: tenant } = await serviceClient
    .from("tenants")
    .select("name, primary_color")
    .eq("id", opts.tenantId)
    .maybeSingle();
  const tenantName = (tenant as { name?: string } | null)?.name || "OMNX GT3";
  const brandColor = (tenant as { primary_color?: string } | null)?.primary_color || "#7C3AED";

  const html = buildInviteEmailHtml({
    recipientName: opts.fullName,
    link: linkData.properties.action_link,
    tenantName,
    brandColor,
    siteUrl,
    email: opts.email,
    tempPassword: opts.tempPassword,
  });

  const text = [
    `Olá, ${opts.fullName}!`,
    ``,
    `Sua conta no ${tenantName} está pronta.`,
    ``,
    `Endereço: ${siteUrl}`,
    `Email: ${opts.email}`,
    `Senha temporária: ${opts.tempPassword}`,
    ``,
    `Assim que entrar, troque essa senha em Configurações — ela é provisória e`,
    `serve só para o primeiro acesso.`,
    ``,
    `Prefere já definir a sua própria senha? Use este link (vale por 1 hora):`,
    `${linkData.properties.action_link}`,
    ``,
    `---`,
    `Este convite é pessoal. Se você não esperava por ele, ignore este email.`,
  ].join("\n");

  return await sendResendEmail({
    apiKey,
    from,
    to: opts.email,
    subject: `Seu acesso ao ${tenantName}`,
    html,
    text,
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  const corsHeaders = getCorsHeaders(origin);

  function json(data: Record<string, unknown>, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Auth: verify caller is admin ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.log("[create-employee] Error: Missing or invalid Authorization header");
      return json({ error: "Unauthorized" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userErr } = await anonClient.auth.getUser(token);
    if (userErr || !user) {
      console.log("[create-employee] Error: Failed to get user from token:", userErr?.message);
      return json({ error: "Unauthorized" }, 401);
    }
    const callerUserId = user.id;
    console.log("[create-employee] Auth validated - caller user_id:", callerUserId);

    // Check caller is admin
    const { data: isAdmin } = await anonClient.rpc("has_role", {
      _user_id: callerUserId,
      _role: "admin",
    });
    console.log("[create-employee] Admin check result:", isAdmin);
    if (!isAdmin) {
      console.log("[create-employee] Error: User is not admin");
      return json({ error: "Forbidden: only admins can create employees" }, 403);
    }

    // Get caller's tenant
    const { data: callerProfile } = await anonClient
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", callerUserId)
      .single();
    if (!callerProfile) {
      console.log("[create-employee] Error: Caller profile not found for user_id:", callerUserId);
      return json({ error: "Caller profile not found" }, 400);
    }
    const tenantId = callerProfile.tenant_id;
    console.log("[create-employee] Caller tenant_id:", tenantId);

    // ── Parse body ──
    const body = await req.json();
    const { full_name, email, password, position_id, phone, work_email, role, is_ceo, send_invite } = body as {
      full_name: string;
      email: string;
      password?: string;
      position_id?: string;
      phone?: string;
      work_email?: string;
      role?: "admin" | "manager" | "member";
      is_ceo?: boolean;
      send_invite?: boolean;
    };
    // O acesso é SEMPRE duplo: senha temporária devolvida ao admin na resposta
    // + email para o colaborador com essa mesma senha, o endereço da plataforma
    // e o aviso de trocá-la ao entrar. `send_invite: false` só suprime o email
    // (quando o admin quer repassar a senha por outro canal).
    const wantsInvite = send_invite !== false;
    console.log("[create-employee] Request body parsed:", { full_name, email, position_id, role, is_ceo });

    // NOTE: manager_id is deprecated. The org chart hierarchy is now based on
    // position.reports_to_id (position-to-position) instead of employee.manager_id (person-to-person).
    // Incoming direct-manager values are ignored to keep org chart behavior position-based.

    if (!full_name?.trim() || !email?.trim()) {
      console.log("[create-employee] Error: Missing required fields - full_name:", !!full_name, "email:", !!email);
      return json({ error: "full_name and email are required" }, 400);
    }

    // ── Service role client (admin powers) ──
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Tenta criar o auth user diretamente. Se o email já existir, o Supabase
    // retorna erro (code: email_exists / user_already_exists). Aí localizamos o
    // user_id existente via RPC get_user_id_by_email e reportamos a colisão de tenant.
    const tempPassword = password || crypto.randomUUID().slice(0, 12) + "A1!";

    // BRECHA 2: registra um convite real antes de criar o usuário. handle_new_user
    // só honra invited_tenant_id se existir esta linha (tenant+email+token válidos).
    const inviteToken = crypto.randomUUID();
    const { error: inviteErr } = await serviceClient
      .from("tenant_invitations")
      .insert({
        tenant_id: tenantId,
        email: email.trim().toLowerCase(),
        token: inviteToken,
        created_by: callerUserId,
      });
    if (inviteErr) {
      console.log("[create-employee] Error creating invitation:", inviteErr.message);
      return json({ error: inviteErr.message }, 500);
    }

    console.log("[create-employee] Creating auth user with email:", email.trim());
    const { data: newUser, error: createErr } = await serviceClient.auth.admin.createUser({
      email: email.trim(),
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: full_name.trim(),
        invited_tenant_id: tenantId,
        invite_token: inviteToken,
      },
    });

    if (createErr) {
      const msg = createErr.message?.toLowerCase() || "";
      const isDuplicate =
        msg.includes("already") ||
        msg.includes("registered") ||
        msg.includes("exists") ||
        (createErr as { code?: string }).code === "email_exists" ||
        (createErr as { code?: string }).code === "user_already_exists";

      if (isDuplicate) {
        console.log("[create-employee] Email already exists, looking up user");
        const { data: existingUserId, error: rpcErr } = await serviceClient.rpc(
          "get_user_id_by_email",
          { _email: email.trim() }
        );

        if (rpcErr || !existingUserId) {
          console.log("[create-employee] Could not resolve existing user_id:", rpcErr?.message);
          return json({ error: "Este email já está cadastrado no sistema" }, 400);
        }

        // Verifica se já existe employee para este user (UNIQUE(user_id) é global)
        const { data: existingEmployee } = await serviceClient
          .from("employees")
          .select("id, tenant_id")
          .eq("user_id", existingUserId)
          .maybeSingle();

        // Tenant real do usuário existente (employee tem prioridade; senão o profile)
        const { data: existingProfile } = await serviceClient
          .from("profiles")
          .select("tenant_id")
          .eq("user_id", existingUserId)
          .maybeSingle();
        const existingTenantId = existingEmployee?.tenant_id ?? existingProfile?.tenant_id ?? null;

        if (existingTenantId === tenantId) {
          // Convite emitido nesta chamada é desnecessário — remove.
          await serviceClient.from("tenant_invitations")
            .delete().eq("token", inviteToken);
          return json({
            error: "Este email já está cadastrado como colaborador nesta empresa",
          }, 400);
        }

        // BRECHA 3: e-mail pertence a um usuário de OUTRA empresa. NÃO migrar a
        // conta (isso sequestraria a conta da vítima e geraria senha nova).
        // Recusa explícita e limpa o convite criado nesta chamada.
        if (existingTenantId && existingTenantId !== tenantId) {
          await serviceClient.from("tenant_invitations")
            .delete().eq("token", inviteToken);
          console.log("[create-employee] REFUSED: email belongs to another tenant:", existingTenantId);
          return json({
            error: "Este e-mail já pertence a outra organização. Contate o suporte.",
          }, 409);
        }

        // Usuário existe sem tenant definido — vincula ao tenant atual
        console.log("[create-employee] Existing user will be linked to this tenant:", existingUserId);

        // Migra o profile para este tenant (service_role ignora RLS)
        await serviceClient
          .from("profiles")
          .update({ tenant_id: tenantId, full_name: full_name.trim() })
          .eq("user_id", existingUserId);

        // Garante role no sistema (unique por user_id)
        await serviceClient
          .from("user_roles")
          .update({ role: role || "member" })
          .eq("user_id", existingUserId);

        // Cria ou re-vincula o employee a este tenant — IDEMPOTENTE (UNIQUE(user_id)).
        const linkFields = {
          tenant_id: tenantId,
          phone: phone?.trim() || null,
          work_email: work_email?.trim() || email.trim(),
          status: "active",
          is_ceo: is_ceo || false,
          manager_id: null,
        };
        let linkedEmployee: { id: string };
        if (existingEmployee) {
          const { data: upd, error: updErr } = await serviceClient
            .from("employees")
            .update(linkFields)
            .eq("id", existingEmployee.id)
            .select()
            .single();
          if (updErr) {
            console.log("[create-employee] Error re-linking employee:", updErr.message);
            return json({ error: updErr.message }, 500);
          }
          linkedEmployee = upd;
        } else {
          const { data: ins, error: linkEmpErr } = await serviceClient
            .from("employees")
            .insert({ user_id: existingUserId, ...linkFields })
            .select()
            .single();
          if (linkEmpErr) {
            console.log("[create-employee] Error linking existing user as employee:", linkEmpErr.message);
            return json({ error: linkEmpErr.message }, 500);
          }
          linkedEmployee = ins;
        }

        if (position_id) {
          await serviceClient
            .from("employee_positions")
            .delete()
            .eq("employee_id", linkedEmployee.id)
            .eq("is_primary", true);
          await serviceClient
            .from("employee_positions")
            .insert({ employee_id: linkedEmployee.id, position_id, is_primary: true });
        }

        // Gera nova senha temporária para o usuário existente (fallback se o
        // convite por email não puder ser enviado)
        const newTempPassword = crypto.randomUUID().slice(0, 12) + "A1!";
        await serviceClient.auth.admin.updateUserById(existingUserId, {
          password: newTempPassword,
        });

        // Envia o email de acesso com a senha temporária + link da plataforma
        const inviteSent = wantsInvite
          ? await dispatchInvite(serviceClient, {
              email: email.trim(),
              fullName: full_name.trim(),
              tenantId,
              tempPassword: newTempPassword,
            })
          : false;

        console.log("[create-employee] Existing user linked successfully - employee_id:", linkedEmployee.id, "invite_sent:", inviteSent);
        return json({
          success: true,
          employee_id: linkedEmployee.id,
          user_id: existingUserId,
          invite_sent: inviteSent,
          temp_password: newTempPassword,
        });
      }

      console.log("[create-employee] Error creating auth user:", createErr.message);
      return json({ error: createErr.message }, 400);
    }

    const newUserId = newUser.user.id;
    console.log("[create-employee] Auth user created successfully - new user_id:", newUserId);

    // 3. If role is not default member, update it
    if (role && role !== "member") {
      console.log("[create-employee] Updating role to:", role);
      await serviceClient
        .from("user_roles")
        .update({ role })
        .eq("user_id", newUserId);
    }

    // 4. Cria (ou completa) o registro de employee — IDEMPOTENTE.
    // Em produção há constraint UNIQUE(user_id) em employees e o employee pode já
    // existir no momento deste passo (ex.: trigger de signup ou chamada duplicada).
    // O INSERT cego estourava "duplicate key value violates unique constraint
    // employees_user_id_key", abortava a função e o setor (position) nunca era
    // aplicado → colaborador aparecia com setor zerado. Agora: se já existe,
    // atualiza; senão, insere.
    console.log("[create-employee] Ensuring employee record for tenant:", tenantId);
    const employeeFields = {
      tenant_id: tenantId,
      phone: phone?.trim() || null,
      work_email: work_email?.trim() || email.trim(),
      status: "active",
      is_ceo: is_ceo || false,
      manager_id: null,
    };

    const { data: preExisting } = await serviceClient
      .from("employees")
      .select("id")
      .eq("user_id", newUserId)
      .maybeSingle();

    let employee: { id: string };
    if (preExisting) {
      console.log("[create-employee] Employee já existia (id:", preExisting.id, ") — atualizando");
      const { data: updated, error: updErr } = await serviceClient
        .from("employees")
        .update(employeeFields)
        .eq("id", preExisting.id)
        .select()
        .single();
      if (updErr) {
        console.log("[create-employee] Error updating employee record:", updErr.message);
        return json({ error: updErr.message }, 500);
      }
      employee = updated;
    } else {
      const { data: inserted, error: empErr } = await serviceClient
        .from("employees")
        .insert({ user_id: newUserId, ...employeeFields })
        .select()
        .single();
      if (empErr) {
        console.log("[create-employee] Error creating employee record:", empErr.message);
        return json({ error: empErr.message }, 500);
      }
      employee = inserted;
    }

    console.log("[create-employee] Employee record ready - employee_id:", employee.id);

    // 5. Aplica o cargo/setor (idempotente: zera a primária anterior e seta a nova)
    if (position_id) {
      console.log("[create-employee] Setting primary position:", position_id);
      await serviceClient
        .from("employee_positions")
        .delete()
        .eq("employee_id", employee.id)
        .eq("is_primary", true);
      const { error: posErr } = await serviceClient
        .from("employee_positions")
        .insert({ employee_id: employee.id, position_id, is_primary: true });
      if (posErr) console.log("[create-employee] Error setting position:", posErr.message);
    }

    // 6. Envia o email de acesso com a senha temporária + endereço da plataforma
    // + aviso de trocar a senha. `send_invite: false` suprime só o email.
    const inviteSent = wantsInvite
      ? await dispatchInvite(serviceClient, {
          email: email.trim(),
          fullName: full_name.trim(),
          tenantId,
          tempPassword,
        })
      : false;

    console.log("[create-employee] Employee creation completed successfully - invite_sent:", inviteSent);
    return json({
      success: true,
      employee_id: employee.id,
      user_id: newUserId,
      invite_sent: inviteSent,
      temp_password: tempPassword,
    });
  } catch (err: unknown) {
    console.log("[create-employee] Unhandled error:", (err as Error).message);
    return json({ error: (err as Error).message || "Internal error" }, 500);
  }
});
