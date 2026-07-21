import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Network, Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const COOLDOWN_SECONDS = 60;
const LS_KEY = "gt3_forgot_pw_until";

function getCooldownFromStorage(): number {
  const until = parseInt(localStorage.getItem(LS_KEY) ?? "0", 10);
  const remaining = Math.ceil((until - Date.now()) / 1000);
  return remaining > 0 ? remaining : 0;
}

function saveCooldownToStorage() {
  localStorage.setItem(LS_KEY, String(Date.now() + COOLDOWN_SECONDS * 1000));
}

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(getCooldownFromStorage);
  const { resetPassword } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cooldown > 0) return;
    setSubmitting(true);
    try {
      await resetPassword(email);
      setSent(true);
      saveCooldownToStorage();
      setCooldown(COOLDOWN_SECONDS);
    } catch (error: any) {
      const msg: string = error.message || "";
      const isRateLimit =
        msg.toLowerCase().includes("rate limit") ||
        msg.toLowerCase().includes("email rate limit") ||
        msg.toLowerCase().includes("too many") ||
        msg.toLowerCase().includes("429");

      if (isRateLimit) {
        setCooldown(COOLDOWN_SECONDS);
        toast({
          title: "Limite de envios atingido",
          description:
            "Muitas tentativas em pouco tempo. Aguarde 1 minuto antes de tentar novamente, ou verifique sua caixa de entrada — o email pode já ter sido enviado.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Erro",
          description: msg || "Não foi possível enviar o email.",
          variant: "destructive",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || submitting) return;
    setSubmitting(true);
    try {
      await resetPassword(email);
      saveCooldownToStorage();
      setCooldown(COOLDOWN_SECONDS);
      toast({ title: "Email reenviado!", description: "Verifique sua caixa de entrada." });
    } catch (error: any) {
      const msg: string = error.message || "";
      const isRateLimit =
        msg.toLowerCase().includes("rate limit") ||
        msg.toLowerCase().includes("too many") ||
        msg.toLowerCase().includes("429");

      saveCooldownToStorage();
      setCooldown(COOLDOWN_SECONDS);
      toast({
        title: isRateLimit ? "Limite de envios atingido" : "Erro",
        description: isRateLimit
          ? "Aguarde 1 minuto antes de tentar novamente."
          : msg || "Não foi possível reenviar o email.",
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
            <CardTitle className="text-xl">Recuperar senha</CardTitle>
            <CardDescription>
              {sent
                ? "Email enviado com sucesso!"
                : "Informe seu email para receber o link de recuperação"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="flex flex-col items-center gap-4 py-4">
                <CheckCircle2 className="w-12 h-12 text-success" />
                <p className="text-sm text-muted-foreground text-center">
                  Enviamos um link de recuperação para{" "}
                  <strong className="text-foreground">{email}</strong>. Verifique sua caixa de
                  entrada (e a pasta de spam).
                </p>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={cooldown > 0 || submitting}
                  className="text-sm text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {cooldown > 0
                    ? `Reenviar em ${cooldown}s`
                    : submitting
                    ? "Enviando…"
                    : "Não recebi — reenviar"}
                </button>
                <Link to="/auth">
                  <Button variant="outline">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Voltar ao login
                  </Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitting || cooldown > 0}
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  {cooldown > 0 ? `Aguarde ${cooldown}s` : "Enviar link de recuperação"}
                </Button>

                <div className="text-center">
                  <Link to="/auth" className="text-sm text-primary hover:underline">
                    <ArrowLeft className="w-3 h-3 inline mr-1" />
                    Voltar ao login
                  </Link>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
