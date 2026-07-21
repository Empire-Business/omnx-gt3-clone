import { useState, useEffect } from "react";
import { Shield, Users, Crown, Briefcase, User, Palette, Upload, Image, Webhook, Plus, Trash2, Check, X, Globe, Key, Activity, Building2, Code, Send, RefreshCw, ChevronDown, ChevronRight, ExternalLink, Copy, Plug } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useEmployees } from "@/hooks/useEmployees";
import { useWebhooks, WEBHOOK_EVENTS } from "@/hooks/useWebhooks";
import { IntegrationsCard } from "@/components/settings/IntegrationsCard";
import { AvatarBadge } from "@/components/shared/SharedComponents";
import { WebhookLogs, WebhookTester } from "@/components/shared/WebhookLogs";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

const ROLE_CONFIG: Record<AppRole, { label: string; icon: typeof Crown; color: string }> = {
  admin: { label: "Admin", icon: Crown, color: "bg-warning/10 text-warning" },
  manager: { label: "Manager", icon: Briefcase, color: "bg-info/10 text-info" },
  member: { label: "Member", icon: User, color: "bg-muted text-muted-foreground" },
};

interface UserWithRole {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: AppRole;
  role_id: string;
}

export default function Configuracoes() {
  const { user } = useAuth();
  const { isAdmin, loading: permLoading } = usePermissions();
  const { updateUserRole } = useEmployees();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: usersWithRoles, isLoading } = useQuery({
    queryKey: ["admin-user-roles"],
    queryFn: async () => {
      const { data: roles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("id, user_id, role");
      if (rolesErr) throw rolesErr;

      const userIds = (roles || []).map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", userIds);

      const profileMap: Record<string, { full_name: string | null; avatar_url: string | null }> = {};
      for (const p of profiles || []) {
        profileMap[p.user_id] = { full_name: p.full_name, avatar_url: p.avatar_url };
      }

      return (roles || []).map((r) => ({
        user_id: r.user_id,
        full_name: profileMap[r.user_id]?.full_name || "Sem nome",
        avatar_url: profileMap[r.user_id]?.avatar_url || null,
        role: r.role,
        role_id: r.id,
      })) as UserWithRole[];
    },
    enabled: isAdmin && !permLoading,
  });

  const changeRole = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: AppRole }) => {
      await updateUserRole.mutateAsync({ userId, role: newRole });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-user-roles"] });
      qc.invalidateQueries({ queryKey: ["user-role"] });
      qc.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Papel atualizado!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (permLoading || isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-h1 font-bold text-foreground">Configurações</h1>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-h1 font-bold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground">Apenas administradores podem acessar esta página.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1 font-bold text-foreground">Configurações</h1>

      <Tabs defaultValue="branding" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="branding" className="text-xs sm:text-sm"><Palette className="w-3.5 h-3.5 mr-1.5 hidden sm:inline" />Marca</TabsTrigger>
          <TabsTrigger value="roles" className="text-xs sm:text-sm"><Shield className="w-3.5 h-3.5 mr-1.5 hidden sm:inline" />Permissões</TabsTrigger>
          <TabsTrigger value="integracoes" className="text-xs sm:text-sm"><Plug className="w-3.5 h-3.5 mr-1.5 hidden sm:inline" />Integrações</TabsTrigger>
          <TabsTrigger value="webhooks" className="text-xs sm:text-sm"><Webhook className="w-3.5 h-3.5 mr-1.5 hidden sm:inline" />Webhooks</TabsTrigger>
          <TabsTrigger value="api" className="text-xs sm:text-sm"><Code className="w-3.5 h-3.5 mr-1.5 hidden sm:inline" />API</TabsTrigger>
          <TabsTrigger value="tenants" className="text-xs sm:text-sm"><Building2 className="w-3.5 h-3.5 mr-1.5 hidden sm:inline" />Tenants</TabsTrigger>
        </TabsList>

        <TabsContent value="branding" className="mt-4">
          <TenantBrandingCard />
        </TabsContent>

        <TabsContent value="roles" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" /> Gerenciamento de Permissões
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col divide-y divide-border">
                {(usersWithRoles || []).map((u) => {
                  const config = ROLE_CONFIG[u.role];
                  const isSelf = u.user_id === user?.id;
                  const Icon = config.icon;
                  return (
                    <div key={u.user_id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <AvatarBadge name={u.full_name || "?"} avatarUrl={u.avatar_url} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {u.full_name}
                          {isSelf && <span className="text-xs text-muted-foreground ml-1">(você)</span>}
                        </p>
                      </div>
                      <Select
                        value={u.role}
                        onValueChange={(v) => changeRole.mutate({ userId: u.user_id, newRole: v as AppRole })}
                        disabled={isSelf || changeRole.isPending}
                      >
                        <SelectTrigger className="w-[140px] h-8">
                          <div className="flex items-center gap-1.5">
                            <Icon className="w-3.5 h-3.5" />
                            <SelectValue />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin"><div className="flex items-center gap-1.5"><Crown className="w-3.5 h-3.5" /> Admin</div></SelectItem>
                          <SelectItem value="manager"><div className="flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5" /> Manager</div></SelectItem>
                          <SelectItem value="member"><div className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Member</div></SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integracoes" className="mt-4">
          <IntegrationsCard />
        </TabsContent>

        <TabsContent value="webhooks" className="mt-4">
          <WebhooksCard />
        </TabsContent>

        <TabsContent value="api" className="mt-4">
          <APICard onViewDocs={() => navigate("/api-docs")} />
        </TabsContent>

        <TabsContent value="tenants" className="mt-4">
          <CreateTenantCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ════════════════════════════════════════════
   TENANT BRANDING CARD (W1.3)
   ════════════════════════════════════════════ */

function TenantBrandingCard() {
  const qc = useQueryClient();

  const { data: tenant, isLoading } = useQuery({
    queryKey: ["tenant-branding"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name, slug, logo_url, logo_dark_url, favicon_url, primary_color, secondary_color, custom_domain")
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [name, setName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#0D1829");
  const [secondaryColor, setSecondaryColor] = useState("#C9A240");
  const [customDomain, setCustomDomain] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (tenant) {
      setName(tenant.name);
      setPrimaryColor((tenant as any).primary_color || "#0D1829");
      setSecondaryColor((tenant as any).secondary_color || "#C9A240");
      setCustomDomain((tenant as any).custom_domain || "");
    }
  }, [tenant]);

  const handleRestoreDefaults = async () => {
    if (!tenant) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("tenants")
        .update({
          primary_color: null,
          logo_url: null,
          logo_dark_url: null,
          favicon_url: null,
        } as any)
        .eq("id", tenant.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["tenant-branding"] });
      toast.success("Marca restaurada para o padrão do design system.");
    } catch (e: any) {
      toast.error(e.message || "Erro ao restaurar");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBranding = async () => {
    if (!tenant) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("tenants")
        .update({
          name: name.trim(),
          primary_color: primaryColor,
          custom_domain: customDomain.trim() || null,
        } as any)
        .eq("id", tenant.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["tenant-branding"] });
      toast.success("Marca atualizada com sucesso!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, variant: 'light' | 'dark') => {
    const file = e.target.files?.[0];
    if (!file || !tenant) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("A imagem deve ter no máximo 2MB"); return; }
    try {
      const ext = file.name.split(".").pop();
      const path = `${tenant.id}/logo${variant === 'dark' ? '-dark' : ''}.${ext}`;
      const { error: upErr } = await supabase.storage.from("branding").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("branding").getPublicUrl(path);
      const field = variant === 'dark' ? 'logo_dark_url' : 'logo_url';
      await supabase.from("tenants").update({ [field]: publicUrl }).eq("id", tenant.id);
      qc.invalidateQueries({ queryKey: ["tenant-branding"] });
      toast.success(`Logo (${variant === 'dark' ? 'escuro' : 'claro'}) atualizado!`);
    } catch (err: any) {
      toast.error(err.message || "Erro no upload");
    }
  };

  if (isLoading) return <Skeleton className="h-48 rounded-xl" />;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Palette className="w-4 h-4 text-primary" /> Personalização da Marca
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Nome */}
        <div className="space-y-2">
          <Label htmlFor="tenant-name">Nome da Empresa</Label>
          <Input id="tenant-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da empresa" />
        </div>

        {/* Logos - Light & Dark */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Logo Modo Claro */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-warning" />
              <Label className="text-sm font-medium">Logo — Modo Claro</Label>
            </div>
            <div className="p-6 rounded-xl border border-border bg-background flex flex-col items-center gap-3">
              {tenant?.logo_url ? (
                <img src={tenant.logo_url} alt="Logo claro" className="h-12 max-w-[160px] object-contain" />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-muted flex items-center justify-center">
                  <Image className="w-6 h-6 text-muted-foreground" />
                </div>
              )}
              <label className="cursor-pointer">
                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleLogoUpload(e, 'light')} />
                <span className="text-sm text-primary hover:underline flex items-center gap-1">
                  <Upload className="w-3.5 h-3.5" /> {tenant?.logo_url ? 'Trocar' : 'Enviar'} logo
                </span>
              </label>
            </div>
          </div>

          {/* Logo Modo Escuro */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-info" />
              <Label className="text-sm font-medium">Logo — Modo Escuro</Label>
            </div>
            <div className="p-6 rounded-xl border border-border bg-muted flex flex-col items-center gap-3">
              {(tenant as any)?.logo_dark_url ? (
                <img src={(tenant as any).logo_dark_url} alt="Logo escuro" className="h-12 max-w-[160px] object-contain" />
              ) : tenant?.logo_url ? (
                <img src={tenant.logo_url} alt="Logo (fallback)" className="h-12 max-w-[160px] object-contain opacity-70" />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-muted/20 flex items-center justify-center">
                  <Image className="w-6 h-6 text-muted-foreground" />
                </div>
              )}
              <label className="cursor-pointer">
                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleLogoUpload(e, 'dark')} />
                <span className="text-sm text-primary hover:underline flex items-center gap-1">
                  <Upload className="w-3.5 h-3.5" /> {(tenant as any)?.logo_dark_url ? 'Trocar' : 'Enviar'} logo escuro
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Cor da marca */}
        <div className="space-y-2 pt-2">
          <Label htmlFor="primary-color">Cor da Marca</Label>
          <div className="flex items-center gap-2 max-w-sm">
            <input
              id="primary-color"
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="w-12 h-10 rounded-md border border-border cursor-pointer bg-transparent"
            />
            <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} placeholder="#3C50B4" />
          </div>
          <p className="text-xs text-muted-foreground">
            Usada em botões, links e elementos de destaque. As demais cores (status, badges, fundos) seguem o design system e adaptam-se sozinhas ao modo claro/escuro.
          </p>
        </div>

        {/* Domínio próprio */}
        <div className="space-y-2 pt-2">
          <Label htmlFor="custom-domain">Domínio próprio (opcional)</Label>
          <Input
            id="custom-domain"
            value={customDomain}
            onChange={(e) => setCustomDomain(e.target.value)}
            placeholder="app.suaempresa.com.br"
          />
          <p className="text-xs text-muted-foreground">
            Para usar um domínio próprio, aponte um CNAME do seu DNS para <code className="px-1 py-0.5 rounded bg-muted text-xs">cname.vercel-dns.com</code> e cole o domínio aqui.
          </p>
        </div>

        <p className="text-xs text-muted-foreground">
          As alterações aparecem em todo o sistema após recarregar a página.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSaveBranding} disabled={saving} className="w-full sm:w-auto">
            {saving ? "Salvando..." : "Salvar Marca"}
          </Button>
          <Button onClick={handleRestoreDefaults} disabled={saving} variant="outline" className="w-full sm:w-auto">
            Restaurar padrão
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ════════════════════════════════════════════
   CREATE TENANT CARD (W1.4)
   ════════════════════════════════════════════ */

function CreateTenantCard() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adminName, setAdminName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name || !slug || !email || !password) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    if (password.length < 6) {
      toast.error("Senha deve ter no mínimo 6 caracteres");
      return;
    }
    setCreating(true);
    try {
      const res = await supabase.functions.invoke("create-tenant", {
        body: { name, slug, adminEmail: email, adminPassword: password, adminName: adminName || name },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      toast.success(`Tenant "${name}" criado com sucesso!`);
      setOpen(false);
      setName(""); setSlug(""); setEmail(""); setPassword(""); setAdminName("");
    } catch (e: any) {
      toast.error(e.message || "Erro ao criar tenant");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" /> Gestão de Tenants (Multi-Tenant)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Crie novos tenants (empresas) isolados no sistema. Cada tenant tem seus próprios dados, usuários e configurações.
        </p>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Criar Novo Tenant</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Criar Novo Tenant</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Nome da Empresa *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Corp" />
              </div>
              <div className="space-y-2">
                <Label>Slug (identificador único) *</Label>
                <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="acme-corp" />
              </div>
              <div className="border-t border-border pt-4">
                <p className="text-sm font-medium text-foreground mb-3">Administrador do Tenant</p>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Nome do Admin</Label>
                    <Input value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="João Silva" />
                  </div>
                  <div className="space-y-2">
                    <Label>Email do Admin *</Label>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@acme.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Senha Inicial *</Label>
                    <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
                  </div>
                </div>
              </div>
              <Button onClick={handleCreate} disabled={creating} className="w-full">
                {creating ? "Criando..." : "Criar Tenant"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

/* ════════════════════════════════════════════
   API CARD (W2.1)
   ════════════════════════════════════════════ */

interface ApiKeyRow {
  id: string;
  name: string;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
}

const AGENT_GATEWAY_URL =
  "https://opbdoulspzlabxzevffc.supabase.co/functions/v1/agent-gateway";

function APICard({ onViewDocs }: { onViewDocs: () => void }) {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);

  const { data: keys, isLoading } = useQuery<ApiKeyRow[]>({
    queryKey: ["agent-api-keys"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(AGENT_GATEWAY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action: "list_api_keys" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao carregar chaves");
      return json.keys as ApiKeyRow[];
    },
  });

  const createKey = useMutation({
    mutationFn: async (name: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      const rawKey = crypto.randomUUID();
      const res = await fetch(AGENT_GATEWAY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action: "create_api_key", name, raw_key: rawKey }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao criar chave");
      return rawKey;
    },
    onSuccess: (rawKey) => {
      setGeneratedKey(rawKey);
      setShowCreate(false);
      setNewKeyName("");
      qc.invalidateQueries({ queryKey: ["agent-api-keys"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeKey = useMutation({
    mutationFn: async (keyId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(AGENT_GATEWAY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action: "revoke_api_key", key_id: keyId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao revogar chave");
    },
    onSuccess: () => {
      toast.success("Chave revogada");
      setRevokeId(null);
      qc.invalidateQueries({ queryKey: ["agent-api-keys"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField((f) => (f === field ? null : f)), 2000);
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "Nunca";
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Code className="w-4 h-4 text-primary" /> Documentação da API
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            API REST completa para integrações externas com agentes de IA (OpenClaw, etc.),
            automações e sistemas externos.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-foreground">12+</div>
              <div className="text-sm text-muted-foreground">Endpoints REST</div>
            </div>
            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-foreground">SHA-256</div>
              <div className="text-sm text-muted-foreground">Chaves hasheadas</div>
            </div>
            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-foreground">HMAC</div>
              <div className="text-sm text-muted-foreground">Assinatura de Segurança</div>
            </div>
          </div>
          <Button onClick={onViewDocs} variant="outline" className="gap-2">
            <ExternalLink className="w-4 h-4" />
            Ver Documentação Completa
          </Button>
        </CardContent>
      </Card>

      {/* API Keys */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="w-4 h-4 text-primary" /> Chaves de API
            </CardTitle>
            <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}>
              <Plus className="w-3.5 h-3.5" /> Nova chave
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !keys?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhuma chave criada ainda.</p>
              <p className="text-xs mt-1">Crie uma chave para conectar o OpenClaw ao GT3.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {keys.map((k) => (
                <div key={k.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{k.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Criada em {formatDate(k.created_at)} · Último uso: {formatDate(k.last_used_at)}
                    </p>
                  </div>
                  <Badge variant={k.is_active ? "default" : "secondary"} className="text-xs">
                    {k.is_active ? "Ativa" : "Revogada"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setRevokeId(k.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog: criar chave */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova chave de API</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="key-name">Nome da chave</Label>
              <Input
                id="key-name"
                placeholder="Ex: OpenClaw, n8n, Zapier..."
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="mt-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              A chave será exibida <strong>uma única vez</strong> após criada. Guarde-a em lugar seguro.
            </p>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button
              onClick={() => createKey.mutate(newKeyName || "OpenClaw")}
              disabled={createKey.isPending}
            >
              {createKey.isPending ? "Criando..." : "Criar chave"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: exibir chave gerada */}
      <Dialog open={!!generatedKey} onOpenChange={() => setGeneratedKey(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="w-5 h-5 text-success" /> Chave criada
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Copie as credenciais abaixo agora. <strong>A API Key não será exibida novamente.</strong>
            </p>

            {/* API Key */}
            <div className="space-y-1.5">
              <Label className="text-xs">API Key</Label>
              <div className="flex items-center gap-2 p-2.5 bg-muted rounded-lg font-mono text-sm break-all">
                <span className="flex-1 select-all">{generatedKey}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => handleCopy(generatedKey!, "key")}
                  title="Copiar API Key"
                >
                  {copiedField === "key" ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>

            {/* API URL */}
            <div className="space-y-1.5">
              <Label className="text-xs">API URL (endpoint)</Label>
              <div className="flex items-center gap-2 p-2.5 bg-muted rounded-lg font-mono text-[11px] break-all">
                <span className="flex-1 select-all">{AGENT_GATEWAY_URL}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => handleCopy(AGENT_GATEWAY_URL, "url")}
                  title="Copiar API URL"
                >
                  {copiedField === "url" ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>

            <div className="p-3 bg-muted/50 rounded-lg space-y-1">
              <p className="text-xs font-medium text-foreground">Como usar no OpenClaw:</p>
              <p className="text-xs text-muted-foreground">
                Cole a <strong>API Key</strong> no campo <code className="bg-muted px-1 rounded">GT3_API_KEY</code> e a{" "}
                <strong>API URL</strong> no campo <code className="bg-muted px-1 rounded">GT3_API_URL</code> da skill GT3.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button
              variant="outline"
              onClick={() => handleCopy(`API Key: ${generatedKey}\nAPI URL: ${AGENT_GATEWAY_URL}`, "both")}
            >
              {copiedField === "both" ? "Copiado!" : "Copiar tudo"}
            </Button>
            <Button onClick={() => setGeneratedKey(null)}>Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: revogar chave */}
      <AlertDialog open={!!revokeId} onOpenChange={() => setRevokeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar chave?</AlertDialogTitle>
            <AlertDialogDescription>
              Qualquer integração usando esta chave vai parar de funcionar imediatamente.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => revokeId && revokeKey.mutate(revokeId)}
            >
              Revogar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ════════════════════════════════════════════
   WEBHOOKS CARD (W2.2)
   ════════════════════════════════════════════ */

function WebhooksCard() {
  const { webhooks, isLoading, createWebhook, updateWebhook, deleteWebhook } = useWebhooks();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteWebhookId, setDeleteWebhookId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newSecret, setNewSecret] = useState("");
  const [newEvents, setNewEvents] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<string | null>(null);

  const handleCreate = () => {
    if (!newName || !newUrl || newEvents.length === 0) {
      toast.error("Preencha nome, URL e selecione ao menos um evento");
      return;
    }
    createWebhook.mutate(
      { name: newName, url: newUrl, secret: newSecret || undefined, events: newEvents },
      {
        onSuccess: () => {
          toast.success("Webhook criado!");
          setShowCreate(false);
          setNewName(""); setNewUrl(""); setNewSecret(""); setNewEvents([]);
        },
        onError: (e: any) => toast.error(e.message),
      }
    );
  };

  const toggleEvent = (ev: string) => {
    setNewEvents((prev) => prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]);
  };

  if (isLoading) return <Skeleton className="h-48 rounded-xl" />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Webhook className="w-4 h-4 text-primary" /> Webhooks
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowLogs(!showLogs)}>
                <Activity className="w-3.5 h-3.5 mr-1.5" /> Logs
              </Button>
              <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Novo
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {showCreate && (
            <div className="p-4 rounded-xl border border-border bg-muted/30 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nome</Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Meu Webhook" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">URL</Label>
                  <Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://..." className="h-8 text-sm" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Secret (opcional, para assinatura HMAC)</Label>
                <Input value={newSecret} onChange={(e) => setNewSecret(e.target.value)} placeholder="whsec_..." className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Eventos</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                  {WEBHOOK_EVENTS.map((ev) => (
                    <label key={ev} className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <Checkbox checked={newEvents.includes(ev)} onCheckedChange={() => toggleEvent(ev)} />
                      {ev}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleCreate} disabled={createWebhook.isPending}>
                  {createWebhook.isPending ? "Criando..." : "Criar"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
              </div>
            </div>
          )}

          {webhooks.length === 0 && !showCreate ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum webhook configurado. Crie um para receber notificações de eventos.</p>
          ) : (
            webhooks.map((wh) => (
              <div key={wh.id} className="p-3 rounded-lg border border-border">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{wh.name}</p>
                      <Badge variant={wh.is_active ? "default" : "secondary"} className="text-[10px]">
                        {wh.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{wh.url}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {wh.events.slice(0, 5).map((ev) => (
                        <Badge key={ev} variant="outline" className="text-[9px] px-1.5 py-0">{ev}</Badge>
                      ))}
                      {wh.events.length > 5 && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0">+{wh.events.length - 5}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setSelectedWebhook(selectedWebhook === wh.id ? null : wh.id)}
                      title="Testar webhook"
                    >
                      {selectedWebhook === wh.id ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </Button>
                    <Switch
                      checked={wh.is_active}
                      onCheckedChange={(checked) => updateWebhook.mutate({ id: wh.id, is_active: checked } as any)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => setDeleteWebhookId(wh.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                
                {/* Teste e Logs do Webhook */}
                {selectedWebhook === wh.id && (
                  <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
                    <WebhookTester webhookId={wh.id} webhookUrl={wh.url} />
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Delete Webhook Confirmation */}
      <AlertDialog open={!!deleteWebhookId} onOpenChange={(open) => { if (!open) setDeleteWebhookId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir webhook?</AlertDialogTitle>
            <AlertDialogDescription>
              O webhook e seus logs serão removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteWebhookId) { deleteWebhook.mutate(deleteWebhookId); setDeleteWebhookId(null); } }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {showLogs && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" /> Logs de Webhook
            </CardTitle>
          </CardHeader>
          <CardContent>
            <WebhookLogs limit={50} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
