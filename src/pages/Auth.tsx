import { useState } from "react";
import { useNavigate, Navigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Loader2, Eye, EyeOff, Mail, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { BRAND } from "@/config/brand";
import { OmnxLockup } from "@/components/shared/OmnxLockup";

type AuthMode = "login" | "signup" | "otp-email" | "otp-verify";

export default function Auth() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const { user, loading, signIn, signUp, sendOtp, verifyOtp, resendSignupConfirmation } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "login") {
        await signIn(email, password);
        navigate("/");
      } else if (mode === "signup") {
        await signUp(email, password, fullName);
        setPendingConfirmationEmail(email);
        setMode("login");
        toast.success("Conta criada!", {
          description: "Verifique seu email para confirmar o cadastro.",
        });
      }
    } catch (error: any) {
      toast.error("Erro", {
        description: error.message || "Ocorreu um erro. Tente novamente.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendConfirmation = async () => {
    const targetEmail = pendingConfirmationEmail || email;
    if (!targetEmail) {
      toast.error("Erro", { description: "Digite o email da conta primeiro." });
      return;
    }

    setSubmitting(true);
    try {
      await resendSignupConfirmation(targetEmail);
      toast.success("Email reenviado!", {
        description: `Verifique a caixa de entrada de ${targetEmail}.`,
      });
    } catch (error: any) {
      toast.error("Erro", {
        description: error.message || "Não foi possível reenviar o email de confirmação.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendOtp = async () => {
    if (!email) {
      toast.error("Erro", { description: "Digite seu email." });
      return;
    }
    setSubmitting(true);
    try {
      await sendOtp(email);
      toast.success("Código enviado!", {
        description: "Verifique seu email para o código de 8 dígitos.",
      });
      setMode("otp-verify");
    } catch (error: any) {
      toast.error("Erro", {
        description: error.message || "Não foi possível enviar o código.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otpCode.length !== 8) {
      toast.error("Erro", { description: "Digite os 8 dígitos do código." });
      return;
    }
    setSubmitting(true);
    try {
      await verifyOtp(email, otpCode);
      toast.success("Login realizado!", {
        description: `Bem-vindo ao ${BRAND.appName}.`,
      });
      navigate("/");
    } catch (error: any) {
      toast.error("Erro", {
        description: error.message || "Código inválido ou expirado.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const getModeTitle = () => {
    switch (mode) {
      case "login":
        return "Entrar";
      case "signup":
        return "Criar conta";
      case "otp-email":
      case "otp-verify":
        return "Entrar com código";
    }
  };

  const getModeDescription = () => {
    switch (mode) {
      case "login":
        return "Entre com seu email e senha";
      case "signup":
        return "Preencha os dados para criar sua conta";
      case "otp-email":
        return "Enviaremos um código de 8 dígitos para seu email";
      case "otp-verify":
        return `Digite o código enviado para ${email}`;
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-gradient-to-b from-background to-secondary/30">
      {/* Hero */}
      <motion.div
        className="text-center mb-6 sm:mb-10 max-w-lg px-4"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <div className="flex justify-center">
          <OmnxLockup word="GT3" height={42} />
        </div>
        <p className="mt-2 text-sm sm:text-base text-muted-foreground leading-relaxed">
          {BRAND.tagline}
        </p>
      </motion.div>

      <motion.div
        className="w-full max-w-md"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
      >
        <Card className="border-border shadow-card">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl">{getModeTitle()}</CardTitle>
            <CardDescription>{getModeDescription()}</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Login/Signup Form */}
            {(mode === "login" || mode === "signup") && (
              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === "signup" && (
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Nome completo</Label>
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="Seu nome"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      className="h-11"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-11"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Senha</Label>
                    {mode === "login" && (
                      <Link
                        to="/forgot-password"
                        className="text-xs text-primary hover:underline"
                      >
                        Esqueceu a senha?
                      </Link>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="h-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full h-11 text-base" disabled={submitting}>
                  {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  {mode === "login" ? "Entrar" : "Criar conta"}
                </Button>
              </form>
            )}

            {/* OTP Email Step */}
            {mode === "otp-email" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="otp-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="otp-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 h-11"
                    />
                  </div>
                </div>

                <Button
                  type="button"
                  className="w-full h-11 text-base"
                  disabled={submitting}
                  onClick={handleSendOtp}
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Enviar código
                </Button>
              </div>
            )}

            {/* OTP Verify Step */}
            {mode === "otp-verify" && (
              <div className="space-y-4">
                <div className="flex flex-col items-center space-y-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <KeyRound className="w-6 h-6 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground text-center">
                    Digite o código de 8 dígitos enviado para{" "}
                    <span className="font-medium text-foreground">{email}</span>
                  </p>
                </div>

                <div className="flex justify-center">
                  <InputOTP
                    maxLength={8}
                    value={otpCode}
                    onChange={(value) => setOtpCode(value)}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                    </InputOTPGroup>
                    <InputOTPGroup className="ml-2">
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                      <InputOTPSlot index={6} />
                      <InputOTPSlot index={7} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>

                <Button
                  type="button"
                  className="w-full h-11 text-base"
                  disabled={submitting || otpCode.length !== 8}
                  onClick={handleVerifyOtp}
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Verificar código
                </Button>

                <button
                  type="button"
                  onClick={handleSendOtp}
                  disabled={submitting}
                  className="w-full text-sm text-muted-foreground hover:text-foreground text-center"
                >
                  Não recebeu? Enviar novamente
                </button>
              </div>
            )}

            {/* Auth Options */}
            <div className="mt-6 space-y-4">
              {pendingConfirmationEmail && (mode === "login" || mode === "signup") && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
                  <p className="text-foreground">
                    Confirme sua conta pelo email enviado para{" "}
                    <span className="font-medium">{pendingConfirmationEmail}</span>.
                  </p>
                  <button
                    type="button"
                    onClick={handleResendConfirmation}
                    disabled={submitting}
                    className="mt-2 text-primary hover:underline font-medium disabled:opacity-60"
                  >
                    Reenviar email de confirmação
                  </button>
                </div>
              )}

              {/* Toggle Login/Signup */}
              {(mode === "login" || mode === "signup") && (
                <div className="text-center text-sm">
                  <span className="text-muted-foreground">
                    {mode === "login" ? "Não tem conta? " : "Já tem conta? "}
                  </span>
                  <button
                    onClick={() => setMode(mode === "login" ? "signup" : "login")}
                    className="text-primary hover:underline font-medium"
                  >
                    {mode === "login" ? "Criar conta" : "Entrar"}
                  </button>
                </div>
              )}

              {/* Divider */}
              {(mode === "login" || mode === "signup") && (
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">ou</span>
                  </div>
                </div>
              )}

              {/* OTP Toggle */}
              {(mode === "login" || mode === "signup") && (
                <button
                  onClick={() => setMode("otp-email")}
                  className="w-full text-sm text-muted-foreground hover:text-foreground text-center"
                >
                  Entrar com código de verificação
                </button>
              )}

              {/* Back to Login */}
              {(mode === "otp-email" || mode === "otp-verify") && (
                <button
                  onClick={() => {
                    setMode("login");
                    setOtpCode("");
                  }}
                  className="w-full text-sm text-muted-foreground hover:text-foreground text-center"
                >
                  Voltar para login com senha
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
