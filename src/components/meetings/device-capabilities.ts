/**
 * Perfil de capacidade da MÁQUINA de quem está na sala.
 *
 * Origem: portado do produto irmão `omnx-meet`
 * (`src/apps/meeting-room/room/device-capabilities.ts`), onde essa heurística já
 * roda em produção.
 *
 * POR QUE ISTO EXISTE. O custo de uma call de vídeo está quase todo em CPU/GPU:
 * codificar a própria câmera, decodificar a dos outros e compor os efeitos da
 * interface por cima. Boa parte dos usuários entra por notebook corporativo de
 * 4 GB ou por celular — e é justamente quem não pode trocar de máquina que
 * trava. Sem adaptar, a sala inteira paga pelo participante mais fraco (o
 * congestionamento sobe, o SFU degrada, todo mundo pisca).
 *
 * As APIs usadas são HEURÍSTICAS, não garantias:
 * - `hardwareConcurrency`: núcleos lógicos. Existe em todo browser moderno.
 * - `deviceMemory`: RAM em GB arredondada para baixo (2, 4, 8…). Só existe em
 *   Chromium; no Safari/Firefox vem `undefined`. Tratamos ausência como
 *   DESCONHECIDO — nunca como "fraco" —, para não punir quem está bem servido
 *   só porque usa Safari.
 */

export type PerfilDeDispositivo = "fraco" | "medio" | "forte";

interface NavigatorComMemoria extends Navigator {
  deviceMemory?: number;
}

/**
 * Memoizado de propósito: é uma decisão POR MÁQUINA e não muda no meio da call.
 * Reavaliar a cada render gastaria CPU exatamente onde estamos tentando
 * economizá-la (a sala re-renderiza a cada participante que fala).
 */
let perfilMemoizado: PerfilDeDispositivo | null = null;

/**
 * Celular é tratado como teto de "médio" mesmo com 8 núcleos: o gargalo do
 * aparelho é térmico, não de núcleos. Ele sustenta 720p por dois minutos, entra
 * em throttling e daí em diante entrega menos do que entregaria se nunca
 * tivesse subido — além de torrar bateria, que numa reunião de 40 minutos é o
 * que decide se a pessoa fica até o fim.
 */
function pareceMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(navigator.userAgent);
}

export function detectarPerfilDoDispositivo(): PerfilDeDispositivo {
  if (perfilMemoizado) return perfilMemoizado;
  if (typeof navigator === "undefined") return "medio";

  const nucleos = navigator.hardwareConcurrency ?? 0;
  const memoriaGb = (navigator as NavigatorComMemoria).deviceMemory ?? 0;

  // Sinais fortes de máquina apertada. Qualquer um basta: 4 núcleos ou menos
  // travam codificando simulcast (cada camada é uma codificação independente),
  // e 4 GB de RAM com o navegador aberto já vive perto do limite.
  const fraco = (nucleos > 0 && nucleos <= 4) || (memoriaGb > 0 && memoriaGb <= 4);
  const forte = nucleos >= 8 && (memoriaGb === 0 || memoriaGb >= 8) && !pareceMobile();

  perfilMemoizado = fraco ? "fraco" : forte ? "forte" : "medio";
  return perfilMemoizado;
}

/**
 * Quantos vídeos remotos vale a pena DECODIFICAR ao mesmo tempo.
 *
 * Cada stream decodificado é um custo fixo de CPU, independente do tamanho do
 * tile na tela. Renderizar 12 vídeos numa máquina fraca derruba o framerate de
 * todos eles — inclusive o de quem está falando, que é o único que importa
 * naquele instante.
 *
 * Exportado para uso futuro pela grade (quem passar do limite vira avatar, sem
 * custo de decodificação, e volta a ser vídeo ao falar). Hoje só o
 * `room-options` consome o perfil; este limite fica aqui para que a regra viva
 * junto da heurística que a origina, e não espalhada pela UI.
 *
 * TETO DE 8 — não é palpite nosso, é limite do navegador (pesquisa de
 * 2026-08-31). O Chromium define `kMaxDecoderInstances = 8` em
 * `rtc_video_decoder_adapter.h`: a partir do 9º decoder ativo, qualquer stream
 * ABAIXO de 320x240 é rebaixado para decodificação em SOFTWARE, sem aviso.
 * Numa grade isso é exatamente o nosso caso — tile pequeno + adaptiveStream faz
 * o SDK assinar a camada h180 (320x180), que já está sob o corte. Ou seja: do
 * 9º vídeo em diante a máquina decodifica em CPU por mais forte que seja, e o
 * colapso é abrupto em vez de gradual. Por isso o degrau "forte" caiu de 16
 * para 8: acima disso não se ganha vídeo, se troca GPU por CPU.
 * Referência de campo (telemetria UMA do Chromium, fev/2026): 99% dos usuários
 * ficam em até 24 decoders ativos somando todas as abas — 16 só da nossa sala
 * era ocupar sozinho a folga do usuário inteiro.
 */
export function limiteDeVideosSimultaneos(perfil: PerfilDeDispositivo): number {
  if (perfil === "fraco") return 4;
  // Máquina média também encoda a própria câmera e compõe a interface: deixar
  // 2 decoders de folga sob o teto do navegador vale mais que 2 tiles a mais.
  if (perfil === "medio") return 6;
  return 8;
}

/**
 * Efeitos pesados de interface (`backdrop-filter`, halos desfocados) são
 * compostos pela GPU a cada quadro, SOBRE uma tela que já está redesenhando
 * vídeo. Em máquina fraca isso compete diretamente com a decodificação — a
 * interface fica bonita e a call fica travada. O enfeite é a primeira coisa a
 * cair, nunca a qualidade da conversa.
 *
 * Também respeita quem pediu menos movimento no sistema operacional.
 */
export function deveUsarEfeitosPesados(perfil: PerfilDeDispositivo): boolean {
  if (perfil === "fraco") return false;
  if (typeof window === "undefined") return true;
  return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

let vidroMemoizado: boolean | null = null;

/**
 * As PÍLULAS DE VIDRO sobre o vídeo podem ser desfocadas nesta máquina?
 *
 * (Portado do `podeUsarVidroSobreVideo()` do omnx-meet, onde a medida foi
 * feita: 36 camadas de blur → 0.)
 *
 * Cada `backdrop-filter: blur()` obriga a GPU a LER DE VOLTA o que já foi
 * desenhado atrás dele e refiltrar — a cada quadro, porque atrás dele há vídeo
 * em movimento. Cada tile da sala carrega várias dessas pílulas (nome, chip de
 * fixado, mic mudo, botão de pin); numa grade de 6 com o painel de
 * participantes aberto são dezenas de camadas recompostas 30 vezes por segundo
 * sobre exatamente a imagem que a call precisa entregar.
 *
 * Quando o vidro cai, o fundo das pílulas fica mais OPACO no lugar — a
 * legibilidade do nome sobre a imagem era o serviço que o desfoque prestava, e
 * quem paga por ele é o contraste, não o enfeite.
 *
 * Memoizado junto com o perfil: é uma decisão POR MÁQUINA, e reavaliar
 * `matchMedia` em cada tile a cada render gastaria CPU exatamente onde estamos
 * tentando economizá-la.
 */
export function podeUsarVidroSobreVideo(): boolean {
  vidroMemoizado ??= deveUsarEfeitosPesados(detectarPerfilDoDispositivo());
  return vidroMemoizado;
}
