/**
 * useBirthdays — aniversariantes do tenant.
 *
 * A data de nascimento mora em `profiles.birth_date` (migration
 * `20260713160000_profiles_birth_date.sql`). Só mês e dia importam aqui: o ano
 * NÃO é exibido em lugar nenhum do produto.
 *
 * Custo: uma única consulta por tenant, com `staleTime` de 30 min. Não existe
 * "checagem diária" no banco — quem decide se é hoje é o cliente, comparando
 * mês/dia no fuso do próprio usuário. Isso também evita o clássico bug de o
 * aniversário aparecer um dia antes/depois por diferença de UTC.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface BirthdayPerson {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  /** `YYYY-MM-DD` */
  birth_date: string;
  /** Dias até o próximo aniversário (0 = hoje). */
  daysUntil: number;
  /** `05/09` */
  dayLabel: string;
}

/** Mês (1-12) e dia de uma data `YYYY-MM-DD`, sem passar por `new Date`. */
function monthDay(birthDate: string): { month: number; day: number } | null {
  const parts = String(birthDate).slice(0, 10).split("-");
  if (parts.length < 3) return null;
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!month || !day || month > 12 || day > 31) return null;
  return { month, day };
}

/** Verdadeiro quando a data cai HOJE (compara mês+dia, ignora o ano). */
export function isBirthdayOn(birthDate: string | null | undefined, reference = new Date()): boolean {
  if (!birthDate) return false;
  const md = monthDay(birthDate);
  if (!md) return false;
  return md.month === reference.getMonth() + 1 && md.day === reference.getDate();
}

/**
 * Quantos dias faltam para o próximo aniversário. 29/02 em ano comum cai em
 * 01/03 (o `Date` normaliza sozinho) — melhor parabenizar um dia depois do que
 * sumir com a pessoa do quadro em três anos de cada quatro.
 */
function daysUntilBirthday(birthDate: string, reference: Date): number {
  const md = monthDay(birthDate);
  if (!md) return Number.MAX_SAFE_INTEGER;
  const today = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  let next = new Date(reference.getFullYear(), md.month - 1, md.day);
  if (next.getTime() < today.getTime()) {
    next = new Date(reference.getFullYear() + 1, md.month - 1, md.day);
  }
  return Math.round((next.getTime() - today.getTime()) / 86_400_000);
}

export function useBirthdays() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  const query = useQuery({
    queryKey: ["birthdays", tenantId],
    enabled: !!tenantId,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url, birth_date")
        .eq("tenant_id", tenantId!)
        .not("birth_date", "is", null);
      if (error) throw error;
      return (data || []) as Array<{
        user_id: string;
        full_name: string | null;
        avatar_url: string | null;
        birth_date: string | null;
      }>;
    },
  });

  const people = useMemo<BirthdayPerson[]>(() => {
    const now = new Date();
    return (query.data || [])
      .filter((p): p is typeof p & { birth_date: string } => !!p.birth_date)
      .map((p) => {
        const md = monthDay(p.birth_date);
        return {
          user_id: p.user_id,
          full_name: p.full_name,
          avatar_url: p.avatar_url,
          birth_date: p.birth_date,
          daysUntil: daysUntilBirthday(p.birth_date, now),
          dayLabel: md
            ? `${String(md.day).padStart(2, "0")}/${String(md.month).padStart(2, "0")}`
            : "",
        };
      })
      .filter((p) => p.daysUntil !== Number.MAX_SAFE_INTEGER)
      .sort((a, b) => a.daysUntil - b.daysUntil || (a.full_name || "").localeCompare(b.full_name || ""));
  }, [query.data]);

  const today = useMemo(() => people.filter((p) => p.daysUntil === 0), [people]);
  /** Próximos 30 dias, já sem os de hoje. */
  const upcoming = useMemo(
    () => people.filter((p) => p.daysUntil > 0 && p.daysUntil <= 30),
    [people],
  );

  /** Conjunto de `user_id` que fazem aniversário hoje — busca O(1) no chat. */
  const todayIds = useMemo(() => new Set(today.map((p) => p.user_id)), [today]);

  return {
    people,
    today,
    upcoming,
    todayIds,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
