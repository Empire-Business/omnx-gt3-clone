/**
 * supervisor-do-krisp — v8.36.0
 *
 * O FILTRO DE RUÍDO PRECISA DE UM VIGIA.
 *
 * Portado do produto irmão `omnx-meet`
 * (`src/apps/meeting-room/room/supervisor-do-krisp.ts`), onde a regra já roda em
 * produção depois de três dias de investigação na sala ao vivo.
 *
 * CAUSA RAIZ — por que um botão "ligado" não basta:
 *
 * **1. O Krisp se desliga sozinho.** Quando não dá conta de processar em tempo
 * real (publicar vídeo + fundo virtual + WASM competindo, tipicamente por volta
 * do 3º segundo dentro da sala), ele descarta o buffer acumulado e **entra em
 * bypass**: o áudio volta a passar cru, sem erro, sem exceção e sem nada na
 * tela. A UI continua dizendo "ligado" e o teclado passa inteiro.
 *
 * **2. "Ligado" é uma pergunta, não uma lembrança.** O que pedimos
 * (`setEnabled(true)`) e o que está acontecendo (`isEnabled()`) são coisas
 * diferentes. Foi exatamente o selo mostrando o PEDIDO em vez do FATO que fez o
 * problema durar dias sem ninguém perceber.
 *
 * **3. Religar na hora piora.** Religar dentro do engasgo produz um segundo
 * estouro imediato, e o resultado é um liga-desliga contínuo — pior do que
 * ficar desligado, porque aí o áudio pica de verdade. Os degraus (2s, 6s, 15s)
 * dão tempo de a máquina sair do pico. Depois de três, para: a máquina não é
 * capaz de rodar o modelo e insistir vira dano.
 *
 * Módulo sem React e sem dependência do LiveKit de propósito — é testável
 * isoladamente e não puxa nada pesado para o bundle.
 */

/** O mínimo que este módulo precisa saber de um processador do Krisp. */
export interface ProcessadorSupervisionavel {
  isEnabled: () => boolean;
  /**
   * `unknown` no retorno de propósito: o Krisp responde
   * `Promise<boolean | undefined>` e o processador genérico do LiveKit responde
   * `Promise<void>`. Amarrar a um dos dois faria este módulo servir a um só.
   */
  setEnabled: (ligado: boolean) => Promise<unknown>;
}

/** Espera antes de cada tentativa de religar. NUNCA no instante do estouro. */
export const DEGRAUS_DE_RELIGAMENTO_MS = [2_000, 6_000, 15_000];

/** De quanto em quanto tempo perguntamos ao Krisp se ele ainda está no ar. */
export const INTERVALO_DA_VIGILIA_MS = 5_000;

export interface SupervisorDoKrisp {
  /** Ligue no `onBufferDrop` do Krisp: é o único aviso de que ele caiu. */
  aoEstourarOBuffer: () => void;
  /** Desliga vigília e relógios pendentes. Idempotente. */
  parar: () => void;
}

export interface OpcoesDaSupervisao {
  /** Chamado sempre que a VERDADE muda (o que `isEnabled()` responde). */
  aoMudarEstado?: (ativo: boolean) => void;
  /**
   * Chamado uma única vez quando esgotamos os 3 degraus — a máquina não aguenta
   * o modelo. A UI deve parar de prometer cancelamento de ruído.
   */
  aoDesistir?: () => void;
  /** Prefixo das mensagens de console, para saber de onde vêm. */
  rotulo?: string;
}

/**
 * Começa a vigiar um processador do Krisp já ligado.
 *
 * Devolve `null` se não há processador — o chamador não precisa de um `if` a
 * mais, e um supervisor de nada não deveria ocupar espaço.
 */
export function supervisionarKrisp(
  processor: ProcessadorSupervisionavel | null | undefined,
  { aoMudarEstado, aoDesistir, rotulo = "filtro-de-ruido" }: OpcoesDaSupervisao = {},
): SupervisorDoKrisp | null {
  if (!processor) return null;

  let vivo = true;
  let tentativas = 0;
  let desistiu = false;
  let ultimoEstado: boolean | null = null;
  const relogios: number[] = [];

  const conferir = () => {
    if (!vivo) return;
    const agora = processor.isEnabled();
    if (agora !== ultimoEstado) {
      ultimoEstado = agora;
      aoMudarEstado?.(agora);
    }
  };

  const aoEstourarOBuffer = () => {
    if (!vivo) return;
    conferir();

    if (tentativas >= DEGRAUS_DE_RELIGAMENTO_MS.length) {
      if (!desistiu) {
        desistiu = true;
        console.error(
          `[${rotulo}] o filtro por IA foi desligado ${tentativas} vezes por sobrecarga e nao ` +
            "sera religado. Esta maquina nao esta dando conta do modelo — o audio segue com a " +
            "supressao nativa do navegador (teclado e cliques passam). Fechar abas e desligar o " +
            "fundo virtual costuma resolver.",
        );
        aoDesistir?.();
      }
      return;
    }

    const espera = DEGRAUS_DE_RELIGAMENTO_MS[tentativas] ?? 15_000;
    tentativas += 1;
    console.warn(
      `[${rotulo}] o Krisp se desligou por sobrecarga. Religando em ${espera / 1000}s ` +
        `(tentativa ${tentativas} de ${DEGRAUS_DE_RELIGAMENTO_MS.length}).`,
    );

    relogios.push(
      window.setTimeout(() => {
        // Se ele já voltou sozinho no intervalo, religar seria mexer no que
        // está funcionando.
        if (!vivo || processor.isEnabled()) return;
        void processor
          .setEnabled(true)
          .then(() => {
            if (!vivo) return;
            conferir();
            console.info(`[${rotulo}] filtro religado.`);
          })
          .catch((erro) => {
            console.error(`[${rotulo}] falhou ao religar o filtro:`, erro);
          });
      }, espera),
    );
  };

  // A primeira leitura sai imediatamente: quem chamou acabou de ligar o filtro
  // e precisa saber se ele de fato subiu, e não daqui a cinco segundos.
  conferir();
  const vigia = window.setInterval(conferir, INTERVALO_DA_VIGILIA_MS);

  return {
    aoEstourarOBuffer,
    parar: () => {
      vivo = false;
      window.clearInterval(vigia);
      relogios.forEach((relogio) => window.clearTimeout(relogio));
    },
  };
}
