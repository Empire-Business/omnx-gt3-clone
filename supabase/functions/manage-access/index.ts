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
      return json({ error: "Unauthorized" }, 401);
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userErr } = await anonClient.auth.getUser(token);
    if (userErr || !user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const callerUserId = user.id;

    // Check caller is admin
    const { data: isAdmin } = await anonClient.rpc("has_role", {
      _user_id: callerUserId,
      _role: "admin",
    });
    if (!isAdmin) {
      return json({ error: "Forbidden: only admins can manage access" }, 403);
    }

    // ── Service role client ──
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Parse body ──
    const body = await req.json();
    const { target_user_id, action, role, hard_delete } = body as {
      target_user_id: string;
      action: "ban" | "unban" | "reset_password" | "generate_temp_password" | "delete_user" | "update_role" | "get_user_info";
      role?: string;
      hard_delete?: boolean;
    };

    if (!target_user_id || !action) {
      return json({ error: "target_user_id and action are required" }, 400);
    }

    if (target_user_id === callerUserId) {
      return json({ error: "Cannot perform this action on yourself" }, 400);
    }

    // ── Tenant validation: ensure target user belongs to same tenant ──
    // Get caller's tenant
    const { data: callerProfile } = await anonClient
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", callerUserId)
      .single();

    // Get target user's tenant
    const { data: targetProfile } = await serviceClient
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", target_user_id)
      .single();

    // BRECHA 4: isolamento vale para TODAS as ações — inclusive get_user_info,
    // que antes estava indevidamente excluída e vazava dados pessoais de
    // funcionários de outras empresas. Tenant ausente = negar (nunca permitir).
    if (
      !callerProfile?.tenant_id ||
      !targetProfile?.tenant_id ||
      targetProfile.tenant_id !== callerProfile.tenant_id
    ) {
      return json({ error: "Cannot perform actions on users outside your organization" }, 403);
    }

    // ── Handle actions ──
    switch (action) {
      case "ban": {
        const { error } = await serviceClient.auth.admin.updateUserById(target_user_id, {
          ban_duration: "876000h", // ~100 years
        });
        if (error) return json({ error: error.message }, 500);
        return json({ success: true, action, message: "User banned successfully" });
      }

      case "unban": {
        const { error } = await serviceClient.auth.admin.updateUserById(target_user_id, {
          ban_duration: "none",
        });
        if (error) return json({ error: error.message }, 500);
        return json({ success: true, action, message: "User unbanned successfully" });
      }

      case "reset_password": {
        // Get user's email first
        const { data: userData, error: userErr } = await serviceClient.auth.admin.getUserById(target_user_id);
        if (userErr || !userData?.user?.email) {
          return json({ error: "User not found or has no email" }, 404);
        }

        // Send password reset email
        const { error } = await serviceClient.auth.resetPasswordForEmail(userData.user.email, {
          redirectTo: `${Deno.env.get("SITE_URL") ?? "https://gt3.omnx.pro"}/reset-password`,
        });
        if (error) return json({ error: error.message }, 500);
        return json({ success: true, action, message: "Password reset email sent successfully" });
      }

      case "generate_temp_password": {
        // Gera uma senha temporária forte e a define direto no usuário, retornando-a
        // para o admin entregar (não depende de SMTP nem de e-mail acessível).
        const tempPassword = crypto.randomUUID().slice(0, 12) + "A1!";
        const { error } = await serviceClient.auth.admin.updateUserById(target_user_id, {
          password: tempPassword,
        });
        if (error) return json({ error: error.message }, 500);
        return json({ success: true, action, temp_password: tempPassword, message: "Senha temporária gerada" });
      }

      case "delete_user": {
        if (hard_delete) {
          // Hard delete - completely remove the user from auth
          const { error } = await serviceClient.auth.admin.deleteUser(target_user_id);
          if (error) return json({ error: error.message }, 500);
          return json({ success: true, action, message: "User permanently deleted" });
        } else {
          // Soft delete - just set employee status to inactive
          const { error } = await serviceClient
            .from("employees")
            .update({
              status: "inactive",
              status_reason: "Account deleted by admin",
              termination_date: new Date().toISOString().split("T")[0]
            })
            .eq("user_id", target_user_id);
          if (error) return json({ error: error.message }, 500);
          return json({ success: true, action, message: "User deactivated (soft delete)" });
        }
      }

      case "update_role": {
        if (!role || !["admin", "manager", "member"].includes(role)) {
          return json({ error: "Valid role (admin, manager, member) is required" }, 400);
        }

        // Upsert the user's role in user_roles table (source of truth for permissions)
        const { error } = await serviceClient
          .from("user_roles")
          .upsert({ user_id: target_user_id, role }, { onConflict: "user_id" });
        if (error) return json({ error: error.message }, 500);
        return json({ success: true, action, message: `User role updated to ${role}` });
      }

      case "get_user_info": {
        // Get detailed user info including last login and ban status
        const { data: authData, error: authErr } = await serviceClient.auth.admin.getUserById(target_user_id);
        if (authErr) return json({ error: authErr.message }, 500);

        const { data: profileData } = await serviceClient
          .from("profiles")
          .select("full_name, role, tenant_id")
          .eq("user_id", target_user_id)
          .single();

        const { data: employeeData } = await serviceClient
          .from("employees")
          .select("status, status_reason, termination_date")
          .eq("user_id", target_user_id)
          .single();

        return json({
          success: true,
          action,
          user: {
            id: target_user_id,
            email: authData?.user?.email,
            full_name: profileData?.full_name || null,
            role: profileData?.role || "member",
            tenant_id: profileData?.tenant_id || null,
            last_sign_in_at: authData?.user?.last_sign_in_at || null,
            created_at: authData?.user?.created_at || null,
            is_banned: authData?.user?.banned_until !== null && authData?.user?.banned_until !== undefined,
            banned_until: authData?.user?.banned_until || null,
            employee_status: employeeData?.status || null,
            status_reason: employeeData?.status_reason || null,
            termination_date: employeeData?.termination_date || null,
          },
        });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err: unknown) {
    return json({ error: (err as Error).message || "Internal error" }, 500);
  }
});
