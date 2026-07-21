import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export function useDoNotDisturb() {
  const { user, profile } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dnd_until", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("profiles")
        .select("dnd_until")
        .eq("user_id", user!.id)
        .maybeSingle();
      return (data?.dnd_until as string | null) ?? null;
    },
  });

  const dndUntil = query.data ?? (profile as any)?.dnd_until ?? null;
  const isActive = !!dndUntil && new Date(dndUntil).getTime() > Date.now();

  const setDnd = useMutation({
    mutationFn: async (untilIso: string | null) => {
      const { error } = await (supabase as any)
        .from("profiles")
        .update({ dnd_until: untilIso })
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dnd_until", user?.id] });
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (err: any) => toast.error(err.message ?? "Erro ao salvar"),
  });

  const enableFor = (minutes: number) => {
    const d = new Date(Date.now() + minutes * 60_000);
    setDnd.mutate(d.toISOString());
  };

  const disable = () => setDnd.mutate(null);

  return { dndUntil, isActive, enableFor, disable, isPending: setDnd.isPending };
}
