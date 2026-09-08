/**
 * BirthDateGate — captura obrigatória da data de nascimento.
 *
 * Aparece UMA vez para quem ainda não tem `profiles.birth_date` e não deixa
 * passar: sem botão de fechar, sem Esc, sem clique fora. Foi a decisão do
 * produto — a lista de aniversariantes só existe se todo mundo estiver nela, e
 * um lembrete "responda depois" nunca é respondido.
 *
 * Ele não bloqueia o carregamento do app: monta junto do layout, então se a
 * consulta do perfil falhar o modal simplesmente não aparece e o GT3 segue
 * utilizável (o oposto — travar por erro de rede — deixaria o usuário sem app).
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Cake, Gift, Loader2, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/** Limites de sanidade — pegam o dedo errado no ano, não a idade da pessoa. */
const MIN_AGE = 12;
const MAX_AGE = 110;

export function BirthDateGate() {
  const { user, profile, loading } = useAuth();
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Fecha na hora do salvamento, sem esperar o perfil recarregar. */
  const [done, setDone] = useState(false);

  const missing = !loading && !!user && !!profile && !(profile as any).birth_date;

  useEffect(() => {
    if (missing) setDone(false);
  }, [missing]);

  const open = missing && !done;

  const handleSave = async () => {
    if (!user) return;
    if (!value) {
      setError("Escolha a sua data de nascimento.");
      return;
    }
    const parts = value.split("-").map(Number);
    const picked = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
    if (Number.isNaN(picked.getTime())) {
      setError("Data inválida.");
      return;
    }
    const now = new Date();
    let age = now.getFullYear() - picked.getFullYear();
    const beforeBirthday =
      now.getMonth() < picked.getMonth() ||
      (now.getMonth() === picked.getMonth() && now.getDate() < picked.getDate());
    if (beforeBirthday) age -= 1;
    if (picked.getTime() > now.getTime()) {
      setError("A data não pode estar no futuro.");
      return;
    }
    if (age < MIN_AGE || age > MAX_AGE) {
      setError("Confira o ano — a data informada não parece certa.");
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ birth_date: value } as any)
        .eq("user_id", user.id);
      if (updateError) throw updateError;

      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["birthdays", profile?.tenant_id] });
      setDone(true);
      toast.success("Data de nascimento salva. Já está no seu perfil!");
    } catch {
      setError("Não deu para salvar agora. Tente de novo.");
      toast.error("Erro ao salvar a data de nascimento.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent
        // Sem X, sem Esc, sem clique fora: o modal é o gate.
        className="sm:max-w-md p-0 overflow-hidden [&>button]:hidden"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="relative bg-gradient-to-br from-primary/15 via-primary/5 to-transparent px-6 pt-7 pb-5 text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/15 text-primary flex items-center justify-center shadow-sm">
            <Cake className="w-7 h-7" aria-hidden="true" />
          </div>
          <DialogTitle className="mt-3 text-lg font-bold text-foreground">Quando é o seu aniversário?</DialogTitle>
          <DialogDescription className="mt-1.5 text-sm text-muted-foreground">
            É rápido e é uma vez só. A partir daí o time inteiro passa a saber o seu dia — e você
            passa a saber o de todo mundo.
          </DialogDescription>
        </div>

        <div className="px-6 pb-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="birth-date-gate">Data de nascimento</Label>
            <Input
              id="birth-date-gate"
              type="date"
              autoFocus
              value={value}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => { setValue(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter" && !saving) handleSave(); }}
              aria-invalid={!!error}
              aria-describedby={error ? "birth-date-gate-error" : undefined}
            />
            {error && (
              <p id="birth-date-gate-error" className="text-xs text-destructive">{error}</p>
            )}
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2.5">
            <Gift className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground font-medium">O ano nunca é exibido.</strong>{" "}
              O GT3 mostra apenas o dia e o mês, no seu perfil e no quadro de aniversariantes.
            </p>
          </div>

          <Button onClick={handleSave} disabled={saving || !value} className="w-full gap-2">
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <PartyPopper className="w-4 h-4" aria-hidden="true" />
            )}
            {saving ? "Salvando..." : "Salvar e continuar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
