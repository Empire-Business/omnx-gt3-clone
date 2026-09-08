/**
 * ORÇAMENTO GLOBAL DE VÍDEO DA SALA — um teto só, repartido entre quem desenha tile.
 *
 * Portado do produto irmão `omnx-meet`
 * (`src/apps/meeting-room/room/video-budget.tsx`), onde nasceu numa auditoria de
 * performance. A causa raiz é a mesma aqui no GT3:
 *
 * `limiteDeVideosSimultaneos()` diz quantos elementos `<video>` a MÁQUINA
 * aguenta decodificar ao mesmo tempo. Cada stream tem custo fixo de CPU/GPU —
 * independente do tamanho do tile na tela. Só que, sem um contador central,
 * cada lugar que monta tile se comporta como se fosse o único: o palco de um
 * lado, o painel de participantes do outro. Numa call de 6 pessoas em máquina
 * fraca (teto 4), palco + painel aberto montam 8 `<video>` para um orçamento de
 * 4 — o dobro do que a máquina suporta, com o número certo escrito em dois
 * lugares que não se falam. O resultado é o framerate de TODOS caindo,
 * inclusive o de quem está falando, que é o único que importa naquele instante.
 *
 * Aqui o teto vira UM SÓ, e as zonas o dividem por PRIORIDADE, na ordem de
 * `ORDEM_DE_PRIORIDADE`:
 *
 *  1. `destaque`  — o quadro grande do palco (tela compartilhada ou quem está
 *     falando). É o conteúdo da reunião naquele instante; se algo tem de virar
 *     avatar, não é ele.
 *  2. `pip`       — a câmera de quem apresenta sobreposta ao slide. Vem antes
 *     das miniaturas de propósito: numa apresentação, o rosto de quem fala e o
 *     que ele mostra são a mesma informação. O GT3 ainda não desenha PiP; a
 *     zona fica reservada para quando desenhar, e custa zero enquanto ninguém
 *     declarar demanda nela.
 *  3. `grade`     — os tiles do palco em grade simétrica.
 *  4. `miniatura` — a sidebar (desktop) / carrossel (mobile) do palco.
 *  5. `painel`    — a coluna de participantes (`MeetParticipantsPanel`), que
 *     fica com o que sobrar. Ela é rolável e estreita: é a que menos perde
 *     virando avatar.
 *
 * A diferença para a referência é a zona `miniatura`, que no omnx-meet dividia
 * `grade` com o palco. No GT3 a sidebar e a grade são layouts distintos e
 * simultâneos com o painel lateral, então separá-las evita que dois lugares
 * declarem demanda na mesma zona e um sobrescreva o outro.
 *
 * Quem não recebe vaga degrada para avatar sozinho (ver `MeetTile`); o que
 * faltava era alguém CONTANDO.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { TrackReference } from "@livekit/components-react";
import { detectarPerfilDoDispositivo, limiteDeVideosSimultaneos } from "./device-capabilities";

export type ZonaDeVideo = "destaque" | "pip" | "grade" | "miniatura" | "painel";

const ORDEM_DE_PRIORIDADE: readonly ZonaDeVideo[] = [
  "destaque",
  "pip",
  "grade",
  "miniatura",
  "painel",
];

type DemandasPorZona = Record<ZonaDeVideo, number>;

const SEM_DEMANDA: DemandasPorZona = {
  destaque: 0,
  pip: 0,
  grade: 0,
  miniatura: 0,
  painel: 0,
};

interface OrcamentoDeVideo {
  /** Quantos vídeos esta máquina aguenta decodificar ao mesmo tempo. */
  total: number;
  /** Quantos vídeos cada zona GOSTARIA de montar agora. */
  demandas: DemandasPorZona;
  declararDemanda: (zona: ZonaDeVideo, quantidade: number) => void;
}

const ContextoDoOrcamento = createContext<OrcamentoDeVideo | null>(null);

export function OrcamentoDeVideoProvider({ children }: { children: ReactNode }) {
  /**
   * O perfil da máquina não muda no meio da call — a detecção já é memoizada
   * dentro de `device-capabilities`, e reavaliá-la a cada render gastaria CPU
   * exatamente onde estamos tentando economizá-la.
   */
  const total = useMemo(() => limiteDeVideosSimultaneos(detectarPerfilDoDispositivo()), []);
  const [demandas, setDemandas] = useState<DemandasPorZona>(SEM_DEMANDA);

  const declararDemanda = useCallback((zona: ZonaDeVideo, quantidade: number) => {
    setDemandas((atuais) => {
      // Devolver o MESMO objeto quando nada mudou é o que impede o ciclo
      // "efeito declara → estado muda → render → efeito declara": sem esta
      // comparação, cada tile que aparece re-renderizaria a sala inteira em
      // loop, no meio de uma videochamada.
      if (atuais[zona] === quantidade) return atuais;
      return { ...atuais, [zona]: quantidade };
    });
  }, []);

  const valor = useMemo<OrcamentoDeVideo>(
    () => ({ total, demandas, declararDemanda }),
    [total, demandas, declararDemanda],
  );

  return <ContextoDoOrcamento.Provider value={valor}>{children}</ContextoDoOrcamento.Provider>;
}

/**
 * Quantas vagas ESTA zona recebeu, depois de as zonas mais prioritárias se
 * servirem.
 *
 * `demanda` é quantos vídeos a zona gostaria de montar agora. A zona declara e
 * consulta na mesma chamada de propósito: são a mesma informação, e separar em
 * dois hooks convidaria alguém a declarar sem consultar (ou pior, a consultar
 * sem declarar, que é justamente o bug que este módulo existe para matar).
 *
 * Fora de um `OrcamentoDeVideoProvider` o hook não quebra: cai no teto do
 * dispositivo sem repartição, que é exatamente o comportamento que existia
 * antes. Assim um `MeetTile` usado fora do palco continua funcionando.
 */
export function useVagasDeVideo(zona: ZonaDeVideo, demanda: number): number {
  const contexto = useContext(ContextoDoOrcamento);
  const declararDemanda = contexto?.declararDemanda;

  useEffect(() => {
    if (!declararDemanda) return;
    declararDemanda(zona, demanda);
    // Zerar no desmonte importa: sem isso, fechar a apresentação deixaria a
    // vaga do destaque reservada para um componente que já saiu da tela, e o
    // painel ficaria eternamente com uma vaga a menos.
    return () => declararDemanda(zona, 0);
  }, [declararDemanda, zona, demanda]);

  const total = contexto?.total ?? limiteDeVideosSimultaneos(detectarPerfilDoDispositivo());
  const demandas = contexto?.demandas ?? SEM_DEMANDA;

  let restante = total;
  for (const outra of ORDEM_DE_PRIORIDADE) {
    /*
      Ao chegar na própria zona usamos a demanda RECÉM-CALCULADA, e não a que
      está no estado: a declaração só chega ao contexto no efeito, um commit
      depois. Para as zonas de cima o atraso de um commit é irrelevante (no pior
      caso o painel monta um vídeo a mais por um quadro); para a própria zona
      ele apareceria como um tile piscando de avatar para vídeo a cada mudança.
    */
    if (outra === zona) return Math.max(0, Math.min(demanda, restante));
    restante -= Math.min(demandas[outra], restante);
  }
  return 0;
}

/** Chave estável de um tile dentro do orçamento. */
export function chaveDaTrack(track: TrackReference): string {
  return `${track.participant.identity}-${track.source}`;
}

/**
 * A track tem imagem PARA VALER neste instante?
 *
 * Quem está com a câmera desligada vem na lista como placeholder (o
 * `useTracks` do palco pede `withPlaceholder: true`) e não custa nada para
 * decodificar. Contar essa gente como demanda desperdiçaria vaga — pior: a
 * distribuição por índice daria o orçamento aos primeiros da fila mesmo que os
 * primeiros estivessem todos de câmera fechada, e quem tinha vídeo virava
 * avatar sem necessidade.
 *
 * A track LOCAL é um caso à parte: ela não é "assinada" (é a nossa própria
 * câmera, já em memória), então perguntar por `isSubscribed` a reprovaria
 * sempre. Mesmo critério do `MeetTile`.
 */
export function temVideoAoVivo(track: TrackReference): boolean {
  const publicacao = track.publication;
  if (!publicacao) return false;
  if (publicacao.isMuted) return false;
  return publicacao.isSubscribed || track.participant.isLocal;
}

export function contarVideosAoVivo(tracks: readonly TrackReference[]): number {
  let total = 0;
  for (const track of tracks) if (temVideoAoVivo(track)) total += 1;
  return total;
}

/**
 * Quais tiles podem montar `<video>`, dadas `vagas` vagas.
 *
 * A ordem da lista é a prioridade: quem aparece primeiro na tela é servido
 * primeiro. Só quem tem imagem ao vivo consome vaga.
 */
export function selecionarComVideo(
  tracks: readonly TrackReference[],
  vagas: number,
): ReadonlySet<string> {
  const escolhidos = new Set<string>();
  let restante = vagas;
  for (const track of tracks) {
    if (restante <= 0) break;
    if (!temVideoAoVivo(track)) continue;
    escolhidos.add(chaveDaTrack(track));
    restante -= 1;
  }
  return escolhidos;
}
