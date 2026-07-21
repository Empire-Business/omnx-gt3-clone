import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Network, Loader2, Eye, EyeOff, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Lê o token de recovery do hash da URL e estabelece sessão
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) {
      // Pode já existir uma sessão ativa (ex: usuário logado que quer trocar senha)
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          setSessionReady(true);
        } else {
          setSessionError(true);
        }
      });
      return;
    }

    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const accessToken  = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const type         = params.get("type");

    if (type === "recovery" && accessToken && refreshToken) {
      supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error }) => {
          if (error) {
            setSessionError(true);
          } else {
            setSessionReady(true);
            // Limpa o hash da URL para não expor o token
            window.history.replaceState(null, "", window.location.pathname);
          }
        });
    } else {
      // Hash presente mas sem token de recovery — verifica sessão existente
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          setSessionReady(true);
        } else {
          setSessionError(true);
        }
      });
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({ title: "Erro", description: "As senhas não coincidem.", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: "Erro", description: "A senha deve ter no mínimo 6 caracteres.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      setTimeout(() => navigate("/"), 2500);
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível atualizar a senha.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center shadow-violet">
            <Network className="w-7 h-7 text-white" />
          </div>
        </div>

        <Card className="border-border shadow-card">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl">Redefinir senha</CardTitle>
            <CardDescription>
              {success ? "Senha atualizada com sucesso!" : "Escolha sua nova senha"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {success ? (
              <div className="flex flex-col items-center gap-4 py-4">
                <CheckCircle2 className="w-12 h-12 text-green-500" />
                <p className="text-sm text-muted-foreground text-center">
                  Sua senha foi atualizada. Redirecionando…
                </p>
              </div>
            ) : sessionError ? (
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <AlertCircle className="w-10 h-10 text-destructive" />
                <p className="text-sm text-muted-foreground">
                  Link de redefinição inválido ou expirado.
                </p>
                <Button variant="outline" onClick={() => navigate("/forgot-password")}>
                  Solicitar novo link
                </Button>
              </div>
            ) : !sessionReady ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">Nova senha</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirmar senha</Label>
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Atualizar senha
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
