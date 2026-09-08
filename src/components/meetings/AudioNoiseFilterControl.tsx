/**
 * AudioNoiseFilterControl — v8.36.0
 * Botão na MeetControlBar que liga/desliga o cancelamento de ruído Krisp AI.
 *
 * ============================================================================
 * v8.36.0 — DOIS PROBLEMAS GRAVES CORRIGIDOS DE UMA VEZ
 * ============================================================================
 *
 * **(A) PERFORMANCE — o pacote descia junto com a sala.**
 * `@livekit/krisp-noise-filter` embute WASM e pesa ~6 MB. O import era
 * ESTÁTICO, então quem só entrava na reunião baixava o filtro inteiro antes de
 * ver a sala — em 4G eram ~8-10 s de tela branca. Agora o pacote entra por
 * `import()` dinâmico, no clique. O `supported` é decidido localmente
 * (`krispEhSuportado`, réplica fiel do `isKrispNoiseFilterSupported` da lib,
 * que é só checagem de versão do Safari) para não baixar 6 MB só pra desenhar
 * um botão. A checagem REAL da lib ainda é feita depois do import, antes de
 * anexar, para que o comportamento fique idêntico ao anterior.
 *
 * **(B) BUG FUNCIONAL — o filtro estava em BYPASS: ligado na UI, sem efeito.**
 * O código antigo fazia `setProcessor(proc)` e parava por aí. Só que
 * `setProcessor` apenas ANEXA o processador na pipeline; quem LIGA o filtro é um
 * `setEnabled(true)` posterior — é ali que o Krisp valida com o servidor o
 * direito de rodar. Anexado e não ligado = **bypass**: o áudio atravessa sem ser
 * tocado. O botão dizia "ligado", o usuário confiava, e o barulho de teclado
 * passava inteiro. Diagnóstico portado do produto irmão `omnx-meet`
 * (`src/apps/meeting-room/room/useFiltroDeRuido.ts`), que passou por exatamente
 * este estado.
 *
 * Junto com o `setEnabled(true)`, portamos as três configurações que a sala do
 * omnx-meet aprendeu a duras penas:
 *
 * • `bufferDropMs: 500` — sem isso o buffer interno do Krisp cresce sem
 *   controle. Em log real do produto irmão ele chegou a **24 segundos**
 *   (`ChunkAudioBuffer:dropBuffer buffer reduced from: 24064 to: 1920`), ou
 *   seja: a voz saindo 24 s atrasada. 500 ms é o teto de latência aceitável.
 *
 * • `quality` por perfil de máquina — `low` em máquina fraca, `high` no resto.
 *   O modelo `high` é o que de fato pega transiente de teclado/clique, mas em
 *   notebook de 4 GB ele é justamente o que estoura o buffer. O perfil vem de
 *   `detectarPerfilDoDispositivo()`.
 *
 * • `useBVC: false` explícito (Background Voice Cancellation). Ligado e
 *   desligado em um dia no omnx-meet, por quatro motivos: (1) é tarifado por
 *   minuto, enquanto o NC comum já vem incluso no LiveKit Cloud; (2) a
 *   allowlist de microfones dele exclui array interno de notebook — ou seja,
 *   não funciona pra maioria; (3) o modelo é baixado na ENTRADA da sala,
 *   competindo com a publicação de vídeo; e (4), o mais importante, é decisão
 *   de produto: numa call com duas pessoas do mesmo lado da mesa, calar a "voz
 *   de fundo" cala um cliente.
 *
 * **(C) O filtro se desliga sozinho e não avisa.** Sob carga (publicar vídeo +
 * fundo virtual + WASM ao mesmo tempo, tipicamente por volta do 3º segundo na
 * sala) o Krisp estoura o buffer e entra em bypass silencioso — sem erro, sem
 * exceção — enquanto a UI segue dizendo "ligado". Por isso o estado exibido
 * agora vem de `isEnabled()` (a VERDADE) e não do que o usuário clicou (a
 * LEMBRANÇA), e um supervisor (`supervisor-do-krisp.ts`) vigia a cada 5 s e
 * religa em degraus 2s/6s/15s, no máximo 3 vezes. Depois disso para, e a UI
 * passa a dizer a verdade: esta máquina não aguenta o modelo.
 *
 * ----------------------------------------------------------------------------
 * v8.10.2 — Fix: voz desaparecia ao reativar Krisp depois de desligar.
 *   Causa: instância antiga do KrispNoiseFilter já parada era reaproveitada,
 *   resultando em pipeline de áudio quebrado (track sem fluxo audível).
 *   Correção: cria SEMPRE uma instância nova ao ligar e descarta a referência
 *   ao desligar. Também remove processador antes de reaplicar para evitar
 *   empilhamento.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalParticipant } from "@livekit/components-react";
import { Track, ParticipantEvent, type LocalAudioTrack } from "livekit-client";
// Import SOMENTE de tipo: apagado na compilação, não puxa os ~6 MB pro bundle.
import type { KrispNoiseFilterProcessor, NoiseFilterOptions } from "@livekit/krisp-noise-filter";
import { Sparkles, Waves, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMeetPreferences } from "@/hooks/useMeetPreferences";
import { detectarPerfilDoDispositivo } from "./device-capabilities";
import { supervisionarKrisp, type SupervisorDoKrisp } from "./supervisor-do-krisp";

/**
 * Réplica fiel de `KrispNoiseFilterProcessor.isSupported()` (v0.3.4): a lib
 * libera todo browser, exceto Safari abaixo de 17.4. É só isso — não vale
 * baixar 6 MB de WASM para responder a esta pergunta na hora de renderizar o
 * botão. A checagem oficial continua sendo feita depois do import dinâmico.
 */
function krispEhSuportado(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const ehSafari = /^((?!chrome|android|crios|fxios|edgios|edg\/).)*safari/i.test(ua);
  if (!ehSafari) return true;
  const versao = ua.match(/version\/(\d+)\.(\d+)/i);
  if (!versao) return false;
  const maior = parseInt(versao[1], 10);
  const menor = parseInt(versao[2], 10);
  return maior > 17 || (maior === 17 && menor >= 4);
}

type KrispModule = typeof import("@livekit/krisp-noise-filter");

/**
 * Promise memoizada: se o usuário clicar duas vezes (ou o auto-efeito rodar
 * junto com um clique), os dois caminhos compartilham o MESMO download em vez
 * de disparar dois de 6 MB.
 */
let krispPromise: Promise<KrispModule> | null = null;

function carregarKrisp(): Promise<KrispModule> {
  if (!krispPromise) {
    krispPromise = import("@livekit/krisp-noise-filter").catch((err) => {
      // Não memoiza a falha: permite nova tentativa se a rede voltar.
      krispPromise = null;
      throw err;
    });
  }
  return krispPromise;
}

export function AudioNoiseFilterControl() {
  const { localParticipant } = useLocalParticipant();
  const { prefs, update } = useMeetPreferences();
  const processorRef = useRef<KrispNoiseFilterProcessor | null>(null);
  const supervisorRef = useRef<SupervisorDoKrisp | null>(null);
  const [busy, setBusy] = useState(false);
  const [carregando, setCarregando] = useState(false);
  /** A VERDADE: o que `isEnabled()` responde, não o que o usuário clicou. */
  const [ativoDeVerdade, setAtivoDeVerdade] = useState(false);
  /** Supervisor esgotou os 3 degraus — a máquina não aguenta o modelo. */
  const [desistiu, setDesistiu] = useState(false);

  const supported = krispEhSuportado();
  const pedidoLigado = supported && prefs.noiseFilter;
  const active = pedidoLigado && ativoDeVerdade;

  const getAudioTrack = useCallback((): LocalAudioTrack | null => {
    const pub = localParticipant?.getTrackPublication(Track.Source.Microphone);
    return (pub?.track as LocalAudioTrack | undefined) ?? null;
  }, [localParticipant]);

  /** Encerra vigília + relógios pendentes. Usado ao desligar e ao desmontar. */
  const pararSupervisao = useCallback(() => {
    supervisorRef.current?.parar();
    supervisorRef.current = null;
  }, []);

  const applyFilter = useCallback(
    async (enabled: boolean) => {
      if (!supported) {
        toast.error("Cancelamento de ruído requer WebAssembly (Chrome, Edge ou Firefox atualizado).");
        return;
      }
      const track = getAudioTrack();
      if (!track) return;

      setBusy(true);
      try {
        // Limpa refs ANTES de qualquer chamada para que, se algo falhar, o
        // auto-effect possa reaplicar (não fica preso achando que o processador
        // ainda está ativo).
        processorRef.current = null;
        pararSupervisao();
        setAtivoDeVerdade(false);
        try {
          await track.stopProcessor();
        } catch {
          // sem processador anterior — ok
        }

        if (enabled) {
          // Só aqui os ~6 MB descem. Feedback visível: o botão vira spinner.
          const precisaBaixar = krispPromise === null;
          if (precisaBaixar) setCarregando(true);
          let modulo: KrispModule;
          try {
            modulo = await carregarKrisp();
          } catch (erroDeRede) {
            console.error("[AudioNoiseFilter] falha ao baixar o pacote do Krisp:", erroDeRede);
            toast.error("Não foi possível baixar o cancelamento de ruído. Verifique a conexão.");
            return;
          } finally {
            if (precisaBaixar) setCarregando(false);
          }

          // Checagem OFICIAL da lib, agora que ela está em memória. Mantém o
          // comportamento idêntico ao do import estático.
          if (!modulo.isKrispNoiseFilterSupported()) {
            toast.error(
              "Cancelamento de ruído requer WebAssembly (Chrome, Edge ou Firefox atualizado).",
            );
            return;
          }

          const perfil = detectarPerfilDoDispositivo();
          // `useBVC` não existe no tipo `KrispOptions` da v0.3.4, mas é lido em
          // runtime pelo SDK do Krisp. Passamos explicitamente para nunca herdar
          // um default que ligue BVC numa versão futura — os motivos estão no
          // cabeçalho deste arquivo.
          const opcoes = {
            bufferDropMs: 500,
            quality: perfil === "fraco" ? "low" : "high",
            useBVC: false,
            onBufferDrop: () => {
              // Único aviso de que o Krisp caiu em bypass. Quem trata é o
              // supervisor (degraus 2s/6s/15s) — religar aqui, dentro do
              // engasgo, causa um segundo estouro imediato e vira liga-desliga.
              supervisorRef.current?.aoEstourarOBuffer();
            },
          } as NoiseFilterOptions;

          const proc = modulo.KrispNoiseFilter(opcoes);
          await track.setProcessor(proc);
          // ⚠️ O PULO DO GATO: `setProcessor` só ANEXA. Sem este `setEnabled`
          // o filtro fica em BYPASS — áudio cru passando com a UI dizendo
          // "ligado". Era exatamente esse o bug até a v8.35.
          await proc.setEnabled(true);

          processorRef.current = proc;
          setDesistiu(false);
          supervisorRef.current = supervisionarKrisp(proc, {
            rotulo: "meet:filtro-de-ruido",
            aoMudarEstado: setAtivoDeVerdade,
            aoDesistir: () => setDesistiu(true),
          });
          // Leitura imediata da verdade — "ligado" é uma pergunta, não uma
          // lembrança.
          setAtivoDeVerdade(proc.isEnabled());
        }

        update({ noiseFilter: enabled });
      } catch (err) {
        console.error("[AudioNoiseFilter] falha ao aplicar processador:", err);
        setAtivoDeVerdade(false);
        toast.error("Falha ao aplicar cancelamento de ruído.");
      } finally {
        setBusy(false);
      }
    },
    [getAudioTrack, supported, update, pararSupervisao],
  );

  // Aplica automaticamente quando a faixa de áudio fica disponível.
  // Antes só dependia de `localParticipant` (referência estável) — quando o
  // mic era publicado depois do mount, o efeito não re-rodava e o filtro
  // ficava aparentemente "off" até o usuário desligar+ligar.
  useEffect(() => {
    if (!supported || !prefs.noiseFilter || !localParticipant) return;

    const tryApply = () => {
      const track = getAudioTrack();
      if (!track || processorRef.current) return;
      void applyFilter(true);
    };

    // Tenta aplicar imediatamente (caso já haja track)
    tryApply();

    // E também quando o mic for publicado/(re)inscrito depois
    const onPublished = () => tryApply();
    localParticipant.on(ParticipantEvent.LocalTrackPublished, onPublished);
    localParticipant.on(ParticipantEvent.TrackMuted, onPublished);
    localParticipant.on(ParticipantEvent.TrackUnmuted, onPublished);

    return () => {
      localParticipant.off(ParticipantEvent.LocalTrackPublished, onPublished);
      localParticipant.off(ParticipantEvent.TrackMuted, onPublished);
      localParticipant.off(ParticipantEvent.TrackUnmuted, onPublished);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localParticipant, supported, prefs.noiseFilter]);

  // Encerra a vigília ao desmontar — senão o setInterval sobrevive à saída da
  // sala, perguntando `isEnabled()` a um processador morto.
  useEffect(() => () => pararSupervisao(), [pararSupervisao]);

  const handleToggle = () => {
    if (!supported) {
      toast.error("Cancelamento de ruído requer WebAssembly (Chrome, Edge ou Firefox atualizado).");
      return;
    }
    void applyFilter(!prefs.noiseFilter);
  };

  const tooltipText = !supported
    ? "Cancelamento de ruído indisponível neste navegador"
    : carregando
      ? "Baixando o modelo de cancelamento de ruído…"
      : desistiu
        ? "Este dispositivo não aguentou o filtro por IA — o áudio segue com a supressão do navegador. Fechar abas e desligar o fundo virtual costuma resolver."
        : pedidoLigado && !ativoDeVerdade
          ? "Filtro ligado, mas fora do ar agora (sobrecarga) — tentando religar"
          : active
            ? "Krisp AI: removendo ruído de fundo e mantendo só a voz"
            : "Filtro desligado — áudio cru sem cancelamento de ruído";

  const icone = carregando ? (
    <Loader2 className="w-5 h-5 animate-spin" />
  ) : desistiu || (pedidoLigado && !ativoDeVerdade) ? (
    <AlertTriangle className="w-5 h-5" />
  ) : active ? (
    <Sparkles className="w-5 h-5" />
  ) : (
    <Waves className="w-5 h-5" />
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleToggle}
          disabled={busy || !supported}
          aria-pressed={active}
          aria-busy={carregando || busy}
          aria-label={
            carregando
              ? "Baixando cancelamento de ruído"
              : active
                ? "Desligar cancelamento de ruído"
                : "Ligar cancelamento de ruído"
          }
          className={
            "h-11 w-11 rounded-full flex items-center justify-center transition-colors " +
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
            "disabled:opacity-50 disabled:cursor-not-allowed " +
            (active
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : pedidoLigado && !carregando
                ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
                : "bg-muted/40 hover:bg-muted/70 text-foreground")
          }
        >
          {icone}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{tooltipText}</TooltipContent>
    </Tooltip>
  );
}
