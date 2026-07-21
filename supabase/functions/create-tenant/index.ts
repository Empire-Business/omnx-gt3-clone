import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const ALLOWED_ORIGINS = [
  "https://gt3.omnx.pro",
  "https://gt3.empirebusiness.com.br",
  "https://t3.empirebusiness.com.br",
  "http://localhost:5173",
  "http://localhost:8080",
];

function getCorsHeaders(origin: string) {
  const allowed = origin || ALLOWED_ORIGINS[0]; // reflete o origin (auth por bearer token, nao cookie) — suporta Vercel previews e dominios de tenant
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const corsHeaders = getCorsHeaders(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is admin
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) throw new Error("Unauthorized");

    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: isAdm } = await adminClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdm) throw new Error("Only admins can create tenants");

    const { name, slug, adminEmail, adminPassword, adminName } = await req.json();
    if (!name || !slug || !adminEmail || !adminPassword) {
      throw new Error("Missing required fields: name, slug, adminEmail, adminPassword");
    }

    // Create the new tenant
    const { data: tenant, error: tenantErr } = await adminClient
      .from("tenants")
      .insert({ name, slug })
      .select()
      .single();
    if (tenantErr) throw tenantErr;

    // BRECHA 2: convite real para o novo admin — handle_new_user só honra
    // invited_tenant_id quando existe esta linha (tenant+email+token válidos).
    const inviteToken = crypto.randomUUID();
    const { error: inviteErr } = await adminClient
      .from("tenant_invitations")
      .insert({
        tenant_id: tenant.id,
        email: adminEmail.trim().toLowerCase(),
        token: inviteToken,
        created_by: user.id,
      });
    if (inviteErr) throw inviteErr;

    // Create admin user for the new tenant
    const { data: authData, error: createErr } = await adminClient.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        full_name: adminName || name,
        invited_tenant_id: tenant.id,
        invite_token: inviteToken,
      },
    });
    if (createErr) throw createErr;

    // Override role to admin (handle_new_user creates as member for invited)
    const { error: roleErr } = await adminClient
      .from("user_roles")
      .update({ role: "admin" })
      .eq("user_id", authData.user.id);
    if (roleErr) throw roleErr;

    // Create employee record
    await adminClient.from("employees").insert({
      tenant_id: tenant.id,
      user_id: authData.user.id,
      work_email: adminEmail,
      status: "active",
    });

    return new Response(JSON.stringify({ tenant, user_id: authData.user.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
