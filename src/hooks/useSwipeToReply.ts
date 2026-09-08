/**
 * useSwipeToReply — arrastar a mensagem para o lado para responder.
 *
 * POR QUE ESTE HOOK EXISTE
 * Responder no celular hoje custa três etapas: long-press → esperar o action
 * sheet abrir → localizar "Responder" numa lista de dez ações. É o gesto mais
 * usado do chat pagando o pedágio mais caro. O swipe resolve em um movimento
 * só — é o padrão que WhatsApp, Telegram e iMessage consolidaram, e o usuário
 * já chega sabendo. Este hook é irmão do `useLongPress`: os dois convivem no
 * MESMO balão, cada um cobrindo uma faixa do gesto de toque.
 *
 * DECISÕES DE PROJETO (o "porquê" de cada uma)
 *
 * - SÓ TOQUE, nunca mouse. Arrastar com o botão do mouse apertado é o começo de
 *   uma SELEÇÃO DE TEXTO no desktop; sequestrar isso quebraria copiar/colar do
 *   balão. Mesma regra do `useLongPress`.
 *
 * - DECISÃO DE INTENÇÃO NOS PRIMEIROS PIXELS ("lock" de eixo). Este é o ponto
 *   onde swipe em lista rolável costuma dar errado: se o hook trata todo
 *   movimento como candidato a swipe, a rolagem vertical do histórico fica
 *   engasgada/travada. Então, enquanto o deslocamento total não passa de
 *   `directionLockThreshold`, não fazemos NADA — só observamos. Ao cruzar esse
 *   limiar decidimos de uma vez:
 *     |dy| > |dx|  → a intenção é ROLAR. Abandonamos o gesto até o dedo levantar
 *                     (`abandonedRef`), sem nunca mais reavaliar — reavaliar a
 *                     cada frame produz o "gruda/solta" clássico.
 *     |dx| >= |dy| → assumimos o swipe horizontal.
 *   O abandono é definitivo por gesto justamente para nunca roubar uma rolagem
 *   em andamento no meio do caminho.
 *
 * - preventDefault SÓ DEPOIS DE ASSUMIR o gesto. Chamar antes mataria a rolagem
 *   da página. ATENÇÃO/IMPORTANTE: em listener registrado pelo React (delegação
 *   no root), `touchmove` é PASSIVO em vários navegadores — nesse caso o
 *   `preventDefault()` é ignorado e o console pode até avisar. Por isso ele aqui
 *   é best-effort (guardado por `e.cancelable`) e a defesa REAL é CSS: o ponto
 *   de uso precisa aplicar `touch-action: pan-y` no balão. Assim o navegador
 *   continua dono da rolagem vertical (não engasga) e entrega o movimento
 *   horizontal ao JS sem cancelar o gesto com um scroll-início.
 *
 * - MULTI-TOQUE IGNORADO: dois dedos é pinça/zoom, não swipe.
 *
 * - VIBRAÇÃO AO CRUZAR O LIMIAR, não ao soltar. É isso que produz a sensação de
 *   "travou, pode soltar" — vibrar no fim do gesto chega tarde demais para
 *   informar qualquer coisa. Uma vez só por gesto (`vibratedRef`), senão o
 *   dedo tremendo em cima do limiar vira metralhadora. `navigator.vibrate` não
 *   existe no iOS/Safari, então a chamada é sempre guardada.
 *
 * - RESISTÊNCIA APÓS O LIMIAR: depois de `threshold` o balão passa a se mover a
 *   uma fração do dedo e satura em `maxOffset`. Sem isso o balão viaja para fora
 *   da tela e o gesto deixa de parecer "engatado" num destino — o amortecimento
 *   é o que comunica visualmente que já se chegou ao fim útil do arrasto.
 *
 * - O ESTADO VISUAL É DEVOLVIDO, não aplicado. O hook não conhece o DOM do
 *   balão; devolve `{ offset, active, willTrigger }` e o ponto de uso decide o
 *   `transform`, o ícone revelado e a transição de volta.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { TouchEvent as ReactTouchEvent } from "react";

/** Sentido aceito do arrasto. No WhatsApp responde-se arrastando da esquerda
 *  para a direita ("right"); aqui é configurável porque as mensagens próprias
 *  ficam encostadas na direita e as de terceiros na esquerda. */
export type SwipeDirection = "right" | "left" | "both";

export interface UseSwipeToReplyOptions {
  /** Sentido aceito. Padrão "right" (o do WhatsApp). */
  direction?: SwipeDirection;
  /** Distância, em px, a partir da qual soltar dispara `onReply`. Padrão 60px. */
  threshold?: number;
  /** Teto do deslocamento visual, em px. Padrão 90px. */
  maxOffset?: number;
  /**
   * Deslocamento total, em px, até decidir o eixo do gesto. Padrão 8px —
   * abaixo disso é tremor do dedo e a direção medida é puro ruído.
   */
  directionLockThreshold?: number;
  /** Fração do movimento do dedo aproveitada depois do limiar. Padrão 0.25. */
  resistance?: number;
  /** Duração da vibração ao cruzar o limiar, em ms. 0 desliga. Padrão 12ms. */
  vibrateMs?: number;
  /** Desliga o gesto sem quebrar as regras dos hooks (ex.: linha em edição). */
  disabled?: boolean;
}

/**
 * Objeto espalhável (`{...handlers}`) em qualquer elemento. Tipado com os
 * eventos do React para não precisar de `any` no ponto de uso.
 */
export interface SwipeToReplyHandlers {
  onTouchStart: (e: ReactTouchEvent<HTMLElement>) => void;
  onTouchMove: (e: ReactTouchEvent<HTMLElement>) => void;
  onTouchEnd: (e: ReactTouchEvent<HTMLElement>) => void;
  onTouchCancel: (e: ReactTouchEvent<HTMLElement>) => void;
}

export interface SwipeToReplyState {
  /**
   * Deslocamento visual em px, JÁ com resistência e teto aplicados. Positivo =
   * para a direita, negativo = para a esquerda. 0 quando não há gesto.
   */
  offset: number;
  /** Há um swipe horizontal assumido em andamento (o balão está deslocado). */
  active: boolean;
  /** O limiar foi cruzado: soltar AGORA dispara `onReply`. */
  willTrigger: boolean;
}

export type UseSwipeToReplyResult = SwipeToReplyState & {
  handlers: SwipeToReplyHandlers;
};

export function useSwipeToReply(
  onReply: () => void,
  options: UseSwipeToReplyOptions = {},
): UseSwipeToReplyResult {
  const {
    direction = "right",
    threshold = 60,
    maxOffset = 90,
    directionLockThreshold = 8,
    resistance = 0.25,
    vibrateMs = 12,
    disabled = false,
  } = options;

  /** Guarda o callback em ref: assim os handlers ficam estáveis mesmo quando o
   *  pai recria a closure a cada render (é o caso das linhas de mensagem). */
  const callbackRef = useRef(onReply);
  callbackRef.current = onReply;

  const originRef = useRef<{ x: number; y: number } | null>(null);
  /** Eixo já decidido como horizontal — a partir daqui o gesto é nosso. */
  const lockedRef = useRef(false);
  /** Gesto descartado (movimento vertical): ignorar até o dedo levantar. */
  const abandonedRef = useRef(false);
  /** Vibração já emitida neste gesto — uma por gesto, não por frame. */
  const vibratedRef = useRef(false);
  /** Espelho do `willTrigger` legível dentro dos handlers sem virar dependência
   *  (state é assíncrono; no `touchend` precisamos do valor do último move). */
  const willTriggerRef = useRef(false);
  /** Evita setState depois do unmount (mensagem excluída, troca de conversa). */
  const mountedRef = useRef(true);

  const [state, setState] = useState<SwipeToReplyState>({
    offset: 0,
    active: false,
    willTrigger: false,
  });

  const reset = useCallback(() => {
    originRef.current = null;
    lockedRef.current = false;
    abandonedRef.current = false;
    vibratedRef.current = false;
    willTriggerRef.current = false;
    if (mountedRef.current) setState({ offset: 0, active: false, willTrigger: false });
  }, []);

  // Se o componente desmontar no meio do gesto, um setState tardio cairia em
  // componente morto. A flag também protege o `touchend` assíncrono.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** O sentido do arrasto é permitido pela opção `direction`? */
  const isAllowedDirection = useCallback(
    (dx: number) => {
      if (direction === "both") return true;
      return direction === "right" ? dx > 0 : dx < 0;
    },
    [direction],
  );

  const onTouchStart = useCallback(
    (e: ReactTouchEvent<HTMLElement>) => {
      if (disabled) return;
      // Multi-toque é pinça/zoom, não swipe.
      if (e.touches.length !== 1) {
        reset();
        return;
      }
      const t = e.touches[0];
      originRef.current = { x: t.clientX, y: t.clientY };
      lockedRef.current = false;
      abandonedRef.current = false;
      vibratedRef.current = false;
      willTriggerRef.current = false;
    },
    [disabled, reset],
  );

  const onTouchMove = useCallback(
    (e: ReactTouchEvent<HTMLElement>) => {
      if (disabled) return;
      const origin = originRef.current;
      if (!origin || abandonedRef.current) return;
      // Um segundo dedo entrou no meio do caminho: virou pinça, desiste.
      if (e.touches.length !== 1) {
        abandonedRef.current = true;
        reset();
        return;
      }
      const t = e.touches[0];
      if (!t) return;

      const dx = t.clientX - origin.x;
      const dy = t.clientY - origin.y;

      // --- Fase 1: decidir a intenção (uma vez só por gesto) ---------------
      if (!lockedRef.current) {
        if (Math.hypot(dx, dy) < directionLockThreshold) return; // ainda é ruído
        if (Math.abs(dy) > Math.abs(dx)) {
          // Predominantemente vertical: a lista precisa rolar. Abandona de vez —
          // reavaliar a cada frame faria o balão "grudar" no meio da rolagem.
          abandonedRef.current = true;
          return;
        }
        if (!isAllowedDirection(dx)) {
          // Horizontal, mas no sentido errado (ex.: mensagem própria arrastada
          // para a direita, onde não há espaço). Também abandona: fingir que
          // não houve gesto é melhor que oferecer um arrasto que não dispara.
          abandonedRef.current = true;
          return;
        }
        lockedRef.current = true;
      }

      // --- Fase 2: gesto assumido -----------------------------------------
      // Agora sim podemos suprimir o comportamento padrão. Best-effort: em
      // listener passivo isso é ignorado — quem realmente segura a rolagem é o
      // `touch-action: pan-y` aplicado no elemento pelo ponto de uso.
      if (e.cancelable) e.preventDefault();

      // Se o dedo voltou e cruzou para o sentido proibido, o offset zera em vez
      // de inverter — o balão nunca se desloca para o lado que não responde.
      const raw = isAllowedDirection(dx) ? dx : 0;
      const magnitude = Math.abs(raw);
      // Resistência: 1:1 até o limiar; depois só uma fração, saturando no teto.
      const damped =
        magnitude <= threshold
          ? magnitude
          : Math.min(maxOffset, threshold + (magnitude - threshold) * resistance);
      const offset = raw < 0 ? -damped : damped;
      const willTrigger = magnitude >= threshold;

      // Vibra ao CRUZAR o limiar (não ao soltar): é o "travou, pode soltar".
      if (willTrigger && !vibratedRef.current) {
        vibratedRef.current = true;
        if (vibrateMs > 0 && typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
          navigator.vibrate(vibrateMs);
        }
      }

      willTriggerRef.current = willTrigger;
      if (mountedRef.current) setState({ offset, active: true, willTrigger });
    },
    [disabled, directionLockThreshold, isAllowedDirection, maxOffset, reset, resistance, threshold, vibrateMs],
  );

  const onTouchEnd = useCallback(() => {
    const shouldFire = lockedRef.current && willTriggerRef.current;
    // Zera o visual ANTES de disparar: `onReply` costuma focar o composer e
    // re-renderizar a lista; com o offset ainda aplicado o balão "pula".
    reset();
    if (shouldFire) callbackRef.current();
  }, [reset]);

  const onTouchCancel = useCallback(() => {
    // Cancelado pelo sistema (chamada, gesto do SO): volta ao lugar sem disparar.
    reset();
  }, [reset]);

  return {
    ...state,
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel },
  };
}
