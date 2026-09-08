/**
 * useLongPress — detecta "pressionar e segurar" em ambiente de toque.
 *
 * POR QUE ESTE HOOK EXISTE
 * No chat, TODAS as ações de mensagem (reagir, responder, copiar, editar,
 * encaminhar, criar tarefa, favoritar, fixar, excluir, "Pergunte a Clara")
 * vivem numa barra `opacity-0 group-hover:opacity-100`. No celular não existe
 * hover — logo, nenhuma dessas ações é alcançável por toque. Este hook é a
 * superfície de entrada que faltava: o gesto padrão do WhatsApp/Telegram
 * (segurar o balão → abre o menu de ações).
 *
 * DECISÕES DE PROJETO (o "porquê" de cada uma)
 * - Só handlers de TOQUE: nada de mousedown/mouseup. No desktop, segurar o
 *   botão do mouse é o começo de uma SELEÇÃO DE TEXTO — sequestrar isso
 *   quebraria copiar/colar do balão. Por isso o gesto é exclusivo de touch.
 * - Cancelamento por movimento (`moveThreshold`): este é o erro clássico do
 *   long-press em lista rolável. Sem ele, o usuário que apoia o dedo e começa
 *   a rolar o histórico dispara o menu sem querer a cada rolagem. Qualquer
 *   deslocamento acima do limiar aborta o gesto imediatamente.
 * - Vibração: o feedback tátil é o que faz o gesto "existir" para o usuário —
 *   sem ele, o menu aparece do nada e parece bug. `navigator.vibrate` não
 *   existe no iOS/Safari, então a chamada é sempre guardada por checagem.
 * - `onContextMenu`: no Android/Chrome, segurar um elemento abre o menu nativo
 *   ("copiar link", "pesquisar…") por cima do nosso sheet. Suprimimos o menu
 *   nativo APENAS enquanto há um toque em andamento (ou logo após o gesto
 *   disparar) — assim o botão direito continua funcionando normalmente no
 *   desktop, onde nenhum toque está ativo.
 */
import { useCallback, useEffect, useRef } from "react";
import type { TouchEvent as ReactTouchEvent, MouseEvent as ReactMouseEvent } from "react";

export interface UseLongPressOptions {
  /** Tempo de pressão até disparar, em ms. Padrão 450ms (faixa do WhatsApp). */
  delay?: number;
  /**
   * Deslocamento máximo do dedo, em px, antes do gesto ser cancelado.
   * Padrão 10px — abaixo disso é tremor natural do dedo; acima é rolagem.
   */
  moveThreshold?: number;
  /** Duração da vibração de confirmação, em ms. 0 desliga. Padrão 12ms. */
  vibrateMs?: number;
  /** Desliga o gesto sem quebrar as regras dos hooks (ex.: linha em edição). */
  disabled?: boolean;
}

/**
 * Objeto espalhável (`{...handlers}`) em qualquer elemento. Tipado com os
 * eventos do React para não precisar de `any` no ponto de uso.
 */
export interface LongPressHandlers {
  onTouchStart: (e: ReactTouchEvent<HTMLElement>) => void;
  onTouchMove: (e: ReactTouchEvent<HTMLElement>) => void;
  onTouchEnd: (e: ReactTouchEvent<HTMLElement>) => void;
  onTouchCancel: (e: ReactTouchEvent<HTMLElement>) => void;
  onContextMenu: (e: ReactMouseEvent<HTMLElement>) => void;
}

export function useLongPress(
  onLongPress: () => void,
  options: UseLongPressOptions = {},
): LongPressHandlers {
  const { delay = 450, moveThreshold = 10, vibrateMs = 12, disabled = false } = options;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  /** Há um toque em andamento OU o gesto acabou de disparar — usado só para
   *  decidir se suprimimos o menu de contexto nativo. */
  const touchActiveRef = useRef(false);

  /** Guarda o callback em ref: assim os handlers ficam estáveis mesmo quando o
   *  pai recria a closure a cada render (é o caso das linhas de mensagem). */
  const callbackRef = useRef(onLongPress);
  callbackRef.current = onLongPress;

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    originRef.current = null;
  }, []);

  // Se o componente desmontar no meio do gesto (mensagem excluída, troca de
  // conversa), o timer pendente dispararia um setState em componente morto.
  useEffect(() => clear, [clear]);

  const onTouchStart = useCallback(
    (e: ReactTouchEvent<HTMLElement>) => {
      if (disabled) return;
      // Multi-toque é pinça/zoom, não long-press.
      if (e.touches.length !== 1) {
        clear();
        return;
      }
      const t = e.touches[0];
      originRef.current = { x: t.clientX, y: t.clientY };
      touchActiveRef.current = true;
      clear();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        // Feedback tátil: sem ele o menu "aparece do nada". iOS não implementa.
        if (vibrateMs > 0 && typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
          navigator.vibrate(vibrateMs);
        }
        callbackRef.current();
        // Mantém a supressão do contextmenu ligada por um instante: o Android
        // dispara o evento nativo DEPOIS do nosso timer, já com o sheet aberto.
        window.setTimeout(() => {
          touchActiveRef.current = false;
        }, 800);
      }, delay);
    },
    [clear, delay, disabled, vibrateMs],
  );

  const onTouchMove = useCallback(
    (e: ReactTouchEvent<HTMLElement>) => {
      const origin = originRef.current;
      if (!origin || timerRef.current === null) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - origin.x;
      const dy = t.clientY - origin.y;
      // Distância euclidiana: rolagem é quase sempre vertical, mas swipe
      // horizontal (troca de aba) também precisa cancelar.
      if (Math.hypot(dx, dy) > moveThreshold) clear();
    },
    [clear, moveThreshold],
  );

  const onTouchEnd = useCallback(() => {
    // Soltou antes do tempo: era um tap normal, não deve virar long-press.
    // Não mexemos em touchActiveRef aqui quando o gesto já disparou — o timeout
    // interno cuida disso.
    if (timerRef.current !== null) touchActiveRef.current = false;
    clear();
  }, [clear]);

  const onTouchCancel = useCallback(() => {
    touchActiveRef.current = false;
    clear();
  }, [clear]);

  const onContextMenu = useCallback((e: ReactMouseEvent<HTMLElement>) => {
    // Só bloqueia quando veio de um toque. Botão direito no desktop segue vivo.
    if (touchActiveRef.current) e.preventDefault();
  }, []);

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, onContextMenu };
}
