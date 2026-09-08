/**
 * GUARDA DE REDE — degrada a call sozinha antes de ela travar.
 *
 * Portado do produto irmão `omnx-meet`
 * (`src/apps/meeting-room/room/useNetworkGuard.ts`).
 *
 * CAUSA RAIZ: o comportamento padrão do WebRTC sob rede ruim é insistir. Ele
 * continua tentando enviar vídeo, a fila de pacotes cresce, e o que o usuário
 * vê é a imagem congelando e o ÁUDIO PICOTANDO junto — o pior resultado
 * possível, porque numa reunião dá para perder o vídeo e continuar conversando,
 * mas não dá para perder a voz.
 *
 * Aqui a decisão é explícita e em degraus, sempre protegendo o áudio:
 *   1. qualidade `poor` por 5s  → corta o vídeo local (mantém áudio)
 *   2. qualidade `lost`         → somente áudio, imediatamente
 *   3. qualidade boa por 15s    → devolve o vídeo, uma vez só
 *
 * O passo 3 tem HISTERESE proposital (15s, e não volta em laço): sem isso, uma
 * rede oscilando faz o vídeo ligar e desligar sem parar, o que incomoda mais do
 * que ficar sem vídeo.
 *
 * REGRA INEGOCIÁVEL: a guarda só religa o que ELA MESMA desligou. Se o usuário
 * desligou a câmera por vontade própria, a recuperação automática não pode
 * religá-la na cara dele.
 */
import { useEffect, useRef, useState } from "react";
import { ConnectionQuality, Track } from "livekit-client";
import { useLocalParticipant, useRoomContext } from "@livekit/components-react";

export type EstadoDaRede = "ok" | "instavel" | "video_reduzido" | "somente_audio";

/** Quanto tempo de qualidade `poor` antes de cortar o vídeo local. */
const MS_ATE_CORTAR_VIDEO = 5_000;
/** Quanto tempo de qualidade boa antes de devolver o vídeo (histerese). */
const MS_ATE_DEVOLVER_VIDEO = 15_000;
/** Cadência da amostragem — 1s é o passo natural do `connectionQuality`. */
const MS_ENTRE_AMOSTRAS = 1_000;

export function useNetworkGuard(ativo: boolean): EstadoDaRede {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [estado, setEstado] = useState<EstadoDaRede>("ok");

  // Guarda se FOMOS NÓS que desligamos a câmera. Se o usuário desligou por
  // vontade própria, a recuperação automática não pode religar na cara dele.
  const desligadoPelaGuarda = useRef(false);
  const desdeRuim = useRef<number | null>(null);
  const desdeBom = useRef<number | null>(null);

  useEffect(() => {
    if (!ativo || !room || !localParticipant) return;

    const intervalo = setInterval(() => {
      const qualidade = localParticipant.connectionQuality;
      const agora = Date.now();
      const temVideo = localParticipant.isCameraEnabled;

      if (qualidade === ConnectionQuality.Lost) {
        desdeBom.current = null;
        if (temVideo) {
          desligadoPelaGuarda.current = true;
          void localParticipant.setCameraEnabled(false);
        }
        setEstado("somente_audio");
        return;
      }

      if (qualidade === ConnectionQuality.Poor) {
        desdeBom.current = null;
        desdeRuim.current ??= agora;
        if (agora - desdeRuim.current >= MS_ATE_CORTAR_VIDEO && temVideo) {
          desligadoPelaGuarda.current = true;
          void localParticipant.setCameraEnabled(false);
          setEstado("video_reduzido");
        } else if (!temVideo && desligadoPelaGuarda.current) {
          setEstado("video_reduzido");
        } else {
          // Ainda dentro da janela de tolerância: avisamos que está instável,
          // mas não mexemos em nada. Rede ruim por 2s é rotina; cortar o vídeo
          // a cada soluço seria pior que o problema.
          setEstado("instavel");
        }
        return;
      }

      // Qualidade boa ou excelente.
      desdeRuim.current = null;
      desdeBom.current ??= agora;

      if (desligadoPelaGuarda.current && agora - desdeBom.current >= MS_ATE_DEVOLVER_VIDEO) {
        desligadoPelaGuarda.current = false;
        void localParticipant.setCameraEnabled(true);
      }
      if (!desligadoPelaGuarda.current) setEstado("ok");
    }, MS_ENTRE_AMOSTRAS);

    return () => clearInterval(intervalo);
  }, [ativo, room, localParticipant]);

  /**
   * Quando o usuário liga a câmera manualmente, abrimos mão do controle: ele
   * decidiu, e a guarda não volta a mexer nisso até a próxima queda real.
   */
  useEffect(() => {
    if (!localParticipant) return;
    const aoPublicar = (pub: { source: Track.Source }) => {
      if (pub.source === Track.Source.Camera) desligadoPelaGuarda.current = false;
    };
    localParticipant.on("localTrackPublished", aoPublicar);
    return () => {
      localParticipant.off("localTrackPublished", aoPublicar);
    };
  }, [localParticipant]);

  return estado;
}
