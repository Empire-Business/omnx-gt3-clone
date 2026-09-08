/**
 * Som de notificação — ponto ÚNICO de acesso ao Web Audio para alertas.
 *
 * Substitui as duas implementações que existiam (`playNotifSound` em useChat e
 * `playPing` no SmartNotificationToaster). Ambas tinham dois defeitos que
 * deixavam o usuário sem som e sem nenhum erro visível:
 *
 *  1. `playPing` criava um `AudioContext` NOVO a cada notificação e nunca
 *     chamava `close()`. O Chrome limita a quantidade de contextos por
 *     documento; ao estourar, `new AudioContext()` LANÇA — e o erro caía num
 *     `catch {}` vazio. Como o AppLayout fica montado a sessão inteira (SPA),
 *     o contador só subia: o som funcionava nas primeiras notificações e depois
 *     morria até um F5. Sintoma relatado: "não escuto mais o som".
 *  2. Nenhuma das duas chamava `resume()`. Um contexto criado sem gesto do
 *     usuário nasce `suspended`; `oscillator.start()` não emite nada e também
 *     não lança. `playNotifSound` ainda cacheava esse contexto numa variável de
 *     módulo — uma vez suspenso, ficava mudo para sempre.
 *
 * Aqui existe UM contexto para todo o app, ele é destravado no primeiro gesto
 * do usuário e sempre recebe `resume()` antes de tocar.
 */

// Preferência por dispositivo (localStorage).
// Regra do produto: todos começam com o som LIGADO — só "0" desliga.
const SOUND_KEY = "chat-sound-enabled";

export function isNotificationSoundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setNotificationSoundEnabled(on: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, on ? "1" : "0");
  } catch {
    /* modo privado / storage bloqueado — silencioso */
  }
}

export type NotificationSoundKind = "task" | "chat";

let ctx: AudioContext | null = null;

/** Contexto único do app. Recria se um contexto anterior foi fechado. */
function getContext(): AudioContext | null {
  if (ctx && ctx.state !== "closed") return ctx;
  const Ctor =
    typeof window !== "undefined"
      ? window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    return ctx;
  } catch {
    // Estourou o limite de contextos do navegador — sem som, mas sem quebrar.
    return null;
  }
}

/**
 * Destrava o áudio no primeiro gesto do usuário.
 *
 * Políticas de autoplay (Chrome, Safari, todos os mobile) só permitem sair de
 * `suspended` dentro de um handler de gesto. Sem isto, a PRIMEIRA notificação
 * da sessão sempre sairia muda — que é o caso mais comum, já que ela costuma
 * chegar antes de o usuário clicar em qualquer coisa.
 */
export function initNotificationAudioUnlock(): () => void {
  if (typeof window === "undefined") return () => {};
  const unlock = () => {
    const c = getContext();
    if (c && c.state === "suspended") void c.resume().catch(() => {});
  };
  const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart"];
  for (const ev of events) window.addEventListener(ev, unlock, { passive: true });
  return () => {
    for (const ev of events) window.removeEventListener(ev, unlock);
  };
}

/**
 * Toca o alerta. `force` ignora a preferência do usuário — usado pelo botão
 * "Testar som" das configurações, que precisa soar mesmo com o toggle recém-ligado.
 */
export async function playNotificationSound(
  kind: NotificationSoundKind = "chat",
  options: { force?: boolean } = {},
): Promise<void> {
  if (!options.force && !isNotificationSoundEnabled()) return;
  const c = getContext();
  if (!c) return;
  try {
    // O contexto pode ter sido suspenso pelo navegador (aba em background,
    // troca de dispositivo de áudio). Sem este resume o som some em definitivo.
    if (c.state === "suspended") await c.resume();
    if (c.state !== "running") return;

    const now = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    // Notas distintas: tarefa sobe (660→880), mensagem desce (880→660).
    const from = kind === "task" ? 660 : 880;
    const to = kind === "task" ? 880 : 660;
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(to, now + 0.18);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    osc.connect(gain).connect(c.destination);
    osc.start(now);
    osc.stop(now + 0.35);
    // Oscillator/gain são descartados pelo GC ao terminar; o CONTEXTO é que
    // não pode ser recriado a cada toque (era exatamente o vazamento anterior).
    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        /* noop */
      }
    };
  } catch {
    /* falha de áudio nunca deve quebrar a UI */
  }
}
