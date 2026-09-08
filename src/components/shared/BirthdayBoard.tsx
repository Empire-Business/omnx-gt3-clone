/**
 * BirthdayBoard — quadro de aniversariantes.
 *
 * Mora dentro de uma tela que já existe (o Dashboard), logo abaixo da
 * saudação: nenhuma página nova, nenhum item de menu novo.
 *
 * Três estados:
 *  1. É o SEU aniversário — a faixa vira a felicitação, com o seu nome.
 *  2. Alguém faz hoje — cartões com o atalho "Parabenizar", que abre a conversa
 *     com a mensagem pronta (quem envia é você, não o sistema).
 *  3. Ninguém hoje — linha discreta com os próximos, e só quando há algum nos
 *     próximos 7 dias. Sem aniversário à vista, o componente some.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Cake, Loader2, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AvatarBadge } from "@/components/shared/SharedComponents";
import { useAuth } from "@/hooks/useAuth";
import { useBirthdays, type BirthdayPerson } from "@/hooks/useBirthdays";
import { findOrCreateDM } from "@/hooks/useChat";

/** Mesma chave usada pelo composer do Chat (`chat-draft:<channelId>`). */
function saveDraft(channelId: string, text: string) {
  try { localStorage.setItem(`chat-draft:${channelId}`, text); } catch { /* storage bloqueado */ }
}

export function BirthdayBoard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { today, upcoming, isLoading } = useBirthdays();
  const [openingFor, setOpeningFor] = useState<string | null>(null);

  const meIsBirthday = today.some((p) => p.user_id === profile?.user_id);
  const others = today.filter((p) => p.user_id !== profile?.user_id);
  const nextWeek = upcoming.filter((p) => p.daysUntil <= 7);

  if (isLoading) return null;
  if (today.length === 0 && nextWeek.length === 0) return null;

  const congratulate = async (person: BirthdayPerson) => {
    if (!profile?.user_id || !profile?.tenant_id) {
      toast.error("Sessão inválida — recarregue a página.");
      return;
    }
    setOpeningFor(person.user_id);
    try {
      const dmId = await findOrCreateDM(profile.user_id, person.user_id, profile.tenant_id);
      const firstName = String(person.full_name || "").trim().split(/\s+/)[0];
      saveDraft(
        dmId,
        firstName
          ? `Feliz aniversário, ${firstName}! 🎉🎂 Muitas felicidades!`
          : "Feliz aniversário! 🎉🎂 Muitas felicidades!",
      );
      navigate(`/chat/${dmId}`);
    } catch {
      toast.error("Não deu para abrir a conversa agora.");
    } finally {
      setOpeningFor(null);
    }
  };

  // ── Ninguém hoje: só a prévia da semana ──
  if (today.length === 0) {
    return (
      <div className="bg-card rounded-md shadow-sm px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="flex items-center gap-1.5 text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-[0.08em]">
          <Cake className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
          Próximos aniversários
        </span>
        {nextWeek.map((p) => (
          <span key={p.user_id} className="text-[13px] text-foreground">
            {p.full_name || "Sem nome"}
            <span className="text-muted-foreground"> · {p.dayLabel}</span>
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-md shadow-sm overflow-hidden bg-gradient-to-r from-amber-100 via-amber-50 to-card dark:from-amber-500/20 dark:via-amber-500/10 dark:to-card">
      <div className="px-4 py-3.5">
        <div className="flex items-center gap-2">
          <PartyPopper className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <p className="text-[10px] font-mono font-medium uppercase tracking-[0.08em] text-amber-800 dark:text-amber-300">
            {meIsBirthday && others.length === 0 ? "Hoje é o seu dia" : "Aniversariantes de hoje"}
          </p>
        </div>

        {meIsBirthday && (
          <p className="mt-1.5 text-[15px] font-semibold text-foreground">
            Feliz aniversário, {String(profile?.full_name || "").trim().split(/\s+/)[0] || "você"}! 🎉
            <span className="block text-[13px] font-normal text-muted-foreground mt-0.5">
              O time inteiro está vendo isso aqui hoje — prepare-se para as mensagens.
            </span>
          </p>
        )}

        {others.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {others.map((person) => (
              <div
                key={person.user_id}
                className="flex items-center gap-2.5 bg-card/80 backdrop-blur-sm rounded-lg pl-2 pr-2 py-1.5 shadow-sm"
              >
                <AvatarBadge
                  name={person.full_name || "Colaborador"}
                  avatarUrl={person.avatar_url}
                  size="sm"
                />
                <span className="text-[13px] font-medium text-foreground max-w-[160px] truncate">
                  {person.full_name || "Colaborador"}
                </span>
                <Button
                  size="sm"
                  className="h-7 px-2.5 gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-semibold"
                  disabled={openingFor === person.user_id}
                  onClick={() => congratulate(person)}
                >
                  {openingFor === person.user_id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <span aria-hidden="true">🎂</span>
                  )}
                  Parabenizar
                </Button>
              </div>
            ))}
          </div>
        )}

        {nextWeek.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Ainda esta semana:{" "}
            {nextWeek.map((p, i) => (
              <span key={p.user_id}>
                {i > 0 && " · "}
                {p.full_name || "Sem nome"} ({p.dayLabel})
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}
