import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Camera, Save, Shield, Lock, Cake } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { normalizeSupabaseAssetUrl } from "@/integrations/supabase/config";
import { NotificationPreferences } from "@/components/settings/NotificationPreferences";
import { isBirthdayOn } from "@/hooks/useBirthdays";

export default function Perfil() {
  const { user, profile, updatePassword } = useAuth();
  const { role } = usePermissions();
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [birthDate, setBirthDate] = useState<string>(((profile as any)?.birth_date ?? "") as string);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPw, setChangingPw] = useState(false);

  // Sync fullName when profile loads asynchronously
  useEffect(() => {
    if (profile?.full_name && !fullName) {
      setFullName(profile.full_name);
    }
    // Only run when profile changes, not when fullName changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.full_name]);

  // Sincroniza a data de nascimento quando o perfil carrega (formato YYYY-MM-DD).
  useEffect(() => {
    const bd = (profile as any)?.birth_date;
    if (bd) setBirthDate(String(bd).slice(0, 10));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(profile as any)?.birth_date]);

  // ... keep existing code (handleSave and handleAvatarUpload functions)

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName, birth_date: birthDate || null } as any)
        .eq("user_id", user.id);
      if (error) throw error;
      toast.success("Perfil atualizado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    } catch {
      toast.error("Erro ao salvar perfil.");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: urlData.publicUrl })
        .eq("user_id", user.id);
      if (updateError) throw updateError;

      toast.success("Avatar atualizado!");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      window.location.reload();
    } catch {
      toast.error("Erro ao enviar avatar.");
    } finally {
      setUploading(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setChangingPw(true);
    try {
      await updatePassword(newPassword);
      toast.success("Senha alterada com sucesso!");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error(err.message || "Erro ao alterar senha.");
    } finally {
      setChangingPw(false);
    }
  };

  const roleLabels: Record<string, string> = {
    admin: "Administrador",
    manager: "Gerente",
    member: "Membro",
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-h1 font-bold text-foreground">Meu Perfil</h1>
        <p className="text-muted-foreground text-sm">Gerencie suas informações pessoais</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Informações Pessoais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="relative group">
              <Avatar className="w-20 h-20">
                <AvatarImage src={normalizeSupabaseAssetUrl(profile?.avatar_url) || ""} />
                <AvatarFallback className="text-xl bg-primary/10 text-primary">
                  {profile?.full_name?.charAt(0)?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <label className="absolute inset-0 flex items-center justify-center bg-foreground/50 rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                <Camera className="w-5 h-5 text-background" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                  disabled={uploading}
                />
              </label>
            </div>
            <div>
              <p className="font-semibold text-foreground">{profile?.full_name || "Usuário"}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                <span className="flex items-center gap-1">
                  <Shield className="w-3 h-3 text-primary" />
                  <Badge variant="secondary" className="text-xs">
                    {roleLabels[role || "member"] || role}
                  </Badge>
                </span>
                {/* Aniversário no cabeçalho — é a confirmação visual de que a
                    data capturada no primeiro acesso entrou mesmo no cadastro.
                    Dia e mês apenas; o ano nunca aparece. */}
                {birthDate && (
                  <Badge variant="outline" className="text-xs gap-1">
                    <Cake className="w-3 h-3 text-primary" />
                    {birthDate.slice(8, 10)}/{birthDate.slice(5, 7)}
                    {isBirthdayOn(birthDate) && (
                      <span className="ml-0.5 font-semibold text-amber-600 dark:text-amber-400">
                        🎉 hoje!
                      </span>
                    )}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>Nome completo</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Seu nome" />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Cake className="w-3.5 h-3.5 text-primary" /> Aniversário
              </Label>
              <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="w-full sm:w-auto" />
              <p className="text-xs text-muted-foreground">
                No seu dia, você aparece no quadro de aniversariantes do Início e sobe para o topo
                da lista de conversas do time. O ano nunca é exibido — só dia e mês.
              </p>
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input value={user?.email || ""} disabled className="opacity-60" />
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Salvando..." : "Salvar alterações"}
          </Button>
        </CardContent>
      </Card>

      {/* Notificações — mesmo painel da aba "Notificações" em /configuracoes,
          reaproveitado aqui como atalho (push, som e silenciamento). */}
      <NotificationPreferences />

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Lock className="w-4 h-4 text-primary" /> Alterar Senha
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>Nova senha</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
              />
            </div>
            <div className="space-y-2">
              <Label>Confirmar nova senha</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
              />
            </div>
          </div>
          <Button
            onClick={handleChangePassword}
            disabled={changingPw || !newPassword || !confirmPassword}
            variant="outline"
            className="w-full sm:w-auto"
          >
            <Lock className="w-4 h-4 mr-2" />
            {changingPw ? "Alterando..." : "Alterar Senha"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
