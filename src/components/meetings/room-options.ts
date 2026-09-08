/**
 * FONTE ÚNICA da configuração de mídia da sala (MeetRoom + MeetGuest).
 *
 * Origem: portado do produto irmão `omnx-meet`
 * (`src/apps/meeting-room/room/room-options.ts` e
 * `useCapturaPorTamanhoDaSala.ts`), onde essa adaptação já roda em produção.
 *
 * O QUE ISTO CORRIGE. Até aqui as duas páginas carregavam o MESMO objeto
 * literal, copiado de uma para a outra (o `// TODO: extrair para módulo
 * compartilhado` do MeetGuest é desta dívida). Além de duplicado, era ESTÁTICO:
 * sempre h540, sempre simulcast, sem nenhuma noção de máquina fraca nem de
 * quantas pessoas há na sala. Ou seja, o notebook de 4 GB codificava três
 * camadas de 540p para aparecer num tile de 180px numa reunião de oito — e
 * fritava.
 *
 * `adaptiveStream` e `dynacast` resolvem só metade do problema: o primeiro
 * cuida de quem RECEBE (assina a camada do tamanho do tile), o segundo evita
 * TRANSMITIR camada que ninguém assiste. Nenhum dos dois impede a câmera de
 * CAPTURAR e CODIFICAR na resolução pedida — e é exatamente aí que está a CPU.
 * Por isso a captura precisa cair por perfil de máquina (aqui) e por tamanho de
 * sala (hook no fim do arquivo).
 */

import { useEffect, useRef } from "react";
import { useLocalParticipant, useRemoteParticipants } from "@livekit/components-react";
import {
  AudioPresets,
  LocalVideoTrack,
  Track,
  VideoPresets,
  type AudioCaptureOptions,
  type RoomOptions,
  type VideoPreset,
} from "livekit-client";
import { detectarPerfilDoDispositivo, type PerfilDeDispositivo } from "./device-capabilities";

/**
 * Resolução de CAPTURA por tamanho de reunião.
 *
 * O tile encolhe conforme entra gente. Capturar 720p numa call de seis é
 * desperdício puro — nenhuma tela daquela sala vai mostrar aquela resolução.
 *
 * 1-2 pessoas → 720p: é a call 1:1, o rosto ocupa a tela inteira.
 * 3-4 pessoas → 540p: grade 2x2, ~600px de largura por tile.
 * 5+ pessoas  → 360p: tiles pequenos; acima disso é só calor no processador.
 */
export function presetDeCapturaPara(
  participantes: number,
  perfil: PerfilDeDispositivo = "medio",
): VideoPreset {
  /**
   * Máquina fraca nunca captura acima de 360p, não importa o tamanho da call:
   * codificar 720p em 2-4 núcleos consome o processador que deveria estar
   * decodificando os outros participantes, e o resultado é travamento dos dois
   * lados. 360p num tile de call é perfeitamente legível.
   */
  if (perfil === "fraco") return VideoPresets.h360;
  if (participantes <= 2) return perfil === "forte" ? VideoPresets.h720 : VideoPresets.h540;
  if (participantes <= 4) return VideoPresets.h540;
  return VideoPresets.h360;
}

export interface MeetRoomOptionsParams {
  /**
   * `audioCaptureDefaults` já montado pela página — ele depende do Krisp estar
   * ativo (quando está, NS e AGC nativos ficam DESLIGADOS porque brigam com o
   * filtro: o NS nativo distorce o sinal antes do Krisp e o AGC causa
   * "pumping"). Essa decisão é de preferência do usuário, não de hardware, por
   * isso continua na página e chega aqui pronta.
   */
  audioCaptureDefaults: AudioCaptureOptions;
  /** Microfone escolhido no pré-join, quando houve escolha explícita. */
  audioInputDeviceId?: string;
  /** Câmera escolhida no pré-join, quando houve escolha explícita. */
  videoInputDeviceId?: string;
  /**
   * Quantas pessoas esperamos na sala na MONTAGEM. As `RoomOptions` são lidas
   * uma única vez, antes da conexão, quando ainda não dá para saber quem vai
   * entrar — por isso o default é 2 e a correção real vem do
   * `useCapturaPorTamanhoDaSala`, já dentro da sala.
   */
  participantesEsperados?: number;
}

export function buildMeetRoomOptions({
  audioCaptureDefaults,
  audioInputDeviceId,
  videoInputDeviceId,
  participantesEsperados = 2,
}: MeetRoomOptionsParams): RoomOptions {
  const perfil = detectarPerfilDoDispositivo();
  const preset = presetDeCapturaPara(participantesEsperados, perfil);
  const maquinaFraca = perfil === "fraco";

  return {
    /**
     * Assina de cada remoto apenas a camada compatível com o tamanho REAL do
     * elemento na tela — e pausa tracks fora do viewport ou com a aba em
     * segundo plano.
     *
     * `pixelDensity: 'screen'` foi o que mudou em relação ao `adaptiveStream:
     * true` anterior: sem ele, um tile de 300px num monitor 2x recebia a camada
     * de 300px e aparecia BORRADO. Com ele recebe a de 600px. É a diferença
     * entre "o vídeo daqui parece pior que o do Meet" e não parecer — e não
     * custa CPU de encode, só assinatura.
     */
    adaptiveStream: { pixelDensity: "screen" },

    /**
     * O servidor para de encaminhar (e o publisher para de enviar) camadas que
     * ninguém está assistindo. Numa sala em que todos estão em tiles pequenos,
     * a camada grande simplesmente não sai da máquina de ninguém.
     */
    dynacast: true,

    audioCaptureDefaults: {
      ...audioCaptureDefaults,
      ...(audioInputDeviceId ? { deviceId: audioInputDeviceId } : {}),
    },

    /**
     * O dispositivo escolhido no pré-join entra AQUI, como default de captura,
     * em vez de virar um `switchActiveDevice` depois de conectar: a troca
     * pós-entrada abriria a câmera ERRADA primeiro (a padrão do sistema),
     * publicaria alguns quadros dela e só então trocaria — os outros veriam
     * dois segundos da webcam que a pessoa acabou de recusar na tela anterior.
     */
    videoCaptureDefaults: {
      resolution: preset.resolution,
      ...(videoInputDeviceId ? { deviceId: videoInputDeviceId } : {}),
    },

    publishDefaults: {
      /**
       * Cada camada de simulcast é uma codificação INDEPENDENTE rodando em
       * paralelo. Em máquina fraca desligamos: uma camada no lugar de três.
       * Perde-se adaptação por assinante e ganha-se o processador de volta —
       * troca certa quando o gargalo é local, e é justamente essa máquina que
       * derrubava a reunião inteira.
       */
      simulcast: !maquinaFraca,

      /**
       * VP8 tem decodificação acelerada por hardware em praticamente qualquer
       * aparelho. VP9/AV1 dariam mais qualidade por bit, mas ali o SDK troca
       * simulcast por SVC e o custo de CPU sobe exatamente nas máquinas fracas
       * que mais precisam de folga.
       */
      videoCodec: "vp8",
      videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],

      /**
       * Teto de banda do vídeo. Sem teto, o WebRTC tenta subir a qualidade até
       * a rede reclamar — e em conexão instável esse "tentar" é o que produz o
       * congelamento periódico que o usuário percebe como travamento. Com teto
       * conservador a imagem fica estável em vez de oscilar entre nítida e
       * congelada.
       *
       * Máquina fraca desce mais ainda (400 kbps / 20 fps): ali o limite não é
       * a rede, é o encoder.
       */
      videoEncoding: {
        maxBitrate: maquinaFraca ? 400_000 : 1_200_000,
        maxFramerate: maquinaFraca ? 20 : 30,
      },

      /**
       * Sob banda insuficiente o WebRTC precisa escolher o que sacrificar.
       * Para rosto falando, cair de resolução é aceitável; travar o movimento
       * não é — expressão facial é metade da reunião.
       */
      degradationPreference: "maintain-framerate",

      /**
       * RED (redundância de áudio): reenvia pacotes de voz junto dos seguintes.
       * Em rede com perda — 4G, wifi de café — é o que separa "picotou" de "deu
       * para entender". Custa ~30% a mais num stream que já é barato (~40 kbps).
       */
      red: true,

      /**
       * `speech` + `dtx` são a configuração que a sala do GT3 já usava e
       * continua usando: são decisões de ÁUDIO, não de hardware, e este porte é
       * sobre carga de CPU/banda de vídeo. Mantidas explícitas para que uma
       * atualização de biblioteca não mude o parâmetro mais importante do
       * produto sem ninguém escrever uma linha de código.
       */
      audioPreset: AudioPresets.speech,
      dtx: true,

      /**
       * Compartilhamento de tela é o oposto da câmera: o conteúdo é quase
       * estático e o que importa é conseguir LER. Mantemos resolução e deixamos
       * o framerate cair.
       *
       * Baixamos de 1080p (encoding padrão do preset, ~3 Mbps a 30 fps) para
       * 2,5 Mbps a 15 fps: metade dos quadros de um slide parado é metade da
       * CPU de encode, sem nenhuma perda de legibilidade. `priority: 'high'`
       * garante que, sob aperto, a tela compartilhada ceda depois da câmera.
       */
      screenShareEncoding: {
        maxBitrate: 2_500_000,
        maxFramerate: 15,
        priority: "high",
      },
      screenShareSimulcastLayers: [VideoPresets.h360, VideoPresets.h720],
    },
  };
}

/* ------------------------------------------------------------------ *
 * Captura por tamanho da sala
 * ------------------------------------------------------------------ */

/**
 * Quanto tempo a contagem precisa ficar PARADA antes de mexermos na câmera.
 *
 * Não é enfeite: no primeiro minuto de uma reunião as pessoas entram uma a uma,
 * e reagir a cada entrada reabriria a câmera três vezes seguidas — três piscadas
 * na cara de todo mundo. Esperamos a sala estabilizar e ajustamos uma vez só.
 */
const ESPERA_ANTES_DE_AJUSTAR_MS = 6_000;

function areaDoPreset(preset: VideoPreset): number {
  return preset.width * preset.height;
}

/**
 * A RESOLUÇÃO DE CAPTURA SEGUE O TAMANHO REAL DA REUNIÃO.
 *
 * POR QUE AQUI DENTRO E NÃO NAS OPÇÕES DA SALA. As `RoomOptions` são lidas uma
 * única vez, na construção do `Room`, antes da conexão — quando ainda não há
 * como saber quantas pessoas vão entrar. Então a sala se corrige por dentro:
 * assim que conhece os próprios participantes, a captura desce para o degrau
 * certo.
 *
 * SÓ DESCE, NUNCA SOBE. Cada ajuste reabre a câmera (`restartTrack`), o que
 * PISCA a imagem. Descer troca um piscar por processador de volta — vale
 * sempre. Subir trocaria um piscar por MAIS consumo de CPU para ganhar nitidez
 * que ninguém pediu, no meio de uma conversa. Se a reunião esvaziar, a imagem
 * fica em 360p até a próxima call e ninguém repara.
 *
 * Portado de `omnx-meet/src/apps/meeting-room/room/useCapturaPorTamanhoDaSala.ts`.
 * Diferença: lá havia participantes `hidden` (moderador/espião) a descontar da
 * conta; o GT3 não tem esse conceito, então todo remoto conta.
 */
export function useCapturaPorTamanhoDaSala(ativo: boolean) {
  const { localParticipant } = useLocalParticipant();
  const remotos = useRemoteParticipants();

  /**
   * O degrau que já está valendo. Começa no MESMO default que o
   * `buildMeetRoomOptions` usou na montagem (`participantesEsperados = 2`),
   * porque é literalmente o que a câmera está capturando agora.
   */
  const presetAtualRef = useRef<VideoPreset | null>(null);
  const ajustando = useRef(false);

  const totalNaSala = remotos.length + 1;

  useEffect(() => {
    if (!ativo) return;

    const perfil = detectarPerfilDoDispositivo();
    presetAtualRef.current ??= presetDeCapturaPara(2, perfil);
    const alvo = presetDeCapturaPara(totalNaSala, perfil);

    const atual = presetAtualRef.current;
    if (areaDoPreset(alvo) >= areaDoPreset(atual)) return;

    const relogio = setTimeout(() => {
      const publicacao = localParticipant.getTrackPublication(Track.Source.Camera);
      const track = publicacao?.track;
      if (!(track instanceof LocalVideoTrack)) return;
      if (track.mediaStreamTrack?.readyState === "ended") return;
      if (ajustando.current) return;

      ajustando.current = true;
      /*
        O `deviceId` do aparelho EM USO viaja junto de propósito. Sem ele, o
        `restartTrack` reabriria a câmera pelo dispositivo padrão do sistema — a
        webcam que a pessoa talvez tenha recusado no pré-join apareceria sozinha
        no meio da call. O processador de fundo (blur / imagem virtual)
        sobrevive ao restart: o SDK o reinstala no track novo.
      */
      const deviceId = track.mediaStreamTrack?.getSettings().deviceId;
      void track
        .restartTrack({ resolution: alvo.resolution, ...(deviceId ? { deviceId } : {}) })
        .then(() => {
          presetAtualRef.current = alvo;
        })
        .catch((erro: unknown) => {
          // Falhar aqui é aceitável: a call continua exatamente como estava, só
          // sem a economia. Não vale derrubar o vídeo de ninguém por isso.
          console.warn("[meet] não foi possível ajustar a captura ao tamanho da sala", erro);
        })
        .finally(() => {
          ajustando.current = false;
        });
    }, ESPERA_ANTES_DE_AJUSTAR_MS);

    return () => clearTimeout(relogio);
  }, [ativo, totalNaSala, localParticipant]);
}
