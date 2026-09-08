/**
 * edgeFunctionErrorMessage — extrai a mensagem REAL de erro de uma Edge Function.
 *
 * Em `@supabase/functions-js@2.x`, `supabase.functions.invoke` devolve
 * `data: null` e um `FunctionsHttpError` cuja `.message` é SEMPRE a string
 * genérica "Edge Function returned a non-2xx status code". O corpo da resposta
 * — onde vive o motivo de verdade (ex.: "no transcript available for this
 * meeting") — fica em `error.context`, que é o objeto `Response` original.
 *
 * Sem isto o usuário vê um toast que não diz nada: foi exatamente o que fez uma
 * reunião sem transcrição parecer um bug da IA, quando o 400 já explicava a
 * causa no corpo da resposta.
 */
export async function edgeFunctionErrorMessage(
  error: unknown,
  fallback: string,
): Promise<string> {
  const ctx = (error as { context?: unknown } | null | undefined)?.context;

  if (ctx && typeof (ctx as Response).clone === "function") {
    try {
      // `clone()` porque o corpo pode já ter sido consumido por outro leitor.
      const body = await (ctx as Response).clone().json();
      const msg = (body as { error?: unknown })?.error;
      if (typeof msg === "string" && msg.trim()) return msg;
    } catch {
      /* corpo não-JSON, vazio ou indisponível — cai no fallback abaixo */
    }
  }

  const raw = (error as { message?: unknown } | null | undefined)?.message;
  if (typeof raw === "string" && raw.trim() && !/non-2xx status code/i.test(raw)) {
    return raw;
  }
  return fallback;
}
