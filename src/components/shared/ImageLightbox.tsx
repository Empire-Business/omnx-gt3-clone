import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, Download, ExternalLink, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";

export type LightboxImage = {
  url: string;
  name?: string;
  /** Texto auxiliar sob o nome (tamanho do arquivo, autor, data…). */
  caption?: string;
};

/**
 * Visualizador de imagens em tela cheia, dentro da própria plataforma.
 *
 * Existe porque anexos de imagem (tarefas, projetos, comentários) abriam via
 * `<a target="_blank">`: o usuário era jogado para uma aba do navegador com o
 * arquivo cru, perdia o contexto da tarefa e, no celular, saía do app (no PWA
 * instalado isso abre o navegador POR CIMA do app). Aqui a imagem abre sobre a
 * tela atual, com zoom, navegação entre os anexos e download — e o "abrir
 * original" continua disponível para quem realmente quer a aba.
 *
 * Renderiza em portal no <body> para não herdar `overflow:hidden`, z-index ou
 * `transform` de modais/carrosséis que o envolvam (um ancestral com transform
 * quebraria o `position: fixed`).
 */
export function ImageLightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: LightboxImage[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const current = images[index];
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const movedRef = useRef(false);

  const MIN = 1;
  const MAX = 5;

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  // Trocar de imagem sempre volta ao enquadramento original — manter o zoom da
  // anterior deixaria a próxima abrindo cortada, sem o usuário ter pedido.
  useEffect(() => { reset(); }, [index, reset]);

  const go = useCallback((delta: number) => {
    if (images.length < 2) return;
    const next = (index + delta + images.length) % images.length;
    onIndexChange(next);
  }, [index, images.length, onIndexChange]);

  // Teclado: Esc fecha, setas navegam, +/- controlam o zoom.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "+" || e.key === "=") setScale((s) => Math.min(MAX, s * 1.4));
      else if (e.key === "-") setScale((s) => Math.max(MIN, s / 1.4));
    };
    // `capture` para chegar antes do handler de Esc de um Dialog que esteja
    // aberto por baixo: senão o Esc fecharia o modal da tarefa junto.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [go, onClose]);

  // Trava o scroll do fundo enquanto o visualizador está aberto.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const zoomBy = (factor: number) => {
    setScale((s) => {
      const ns = Math.min(MAX, Math.max(MIN, s * factor));
      if (ns === MIN) setOffset({ x: 0, y: 0 });
      return ns;
    });
  };

  const handleDownload = async () => {
    try {
      const res = await fetch(current.url);
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = current.name || current.url.split("/").pop() || "imagem";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch {
      window.open(current.url, "_blank", "noopener,noreferrer");
    }
  };

  if (!current) return null;

  return createPortal(
    <div
      // `pointer-events-auto` NÃO é decorativo: quando este visualizador abre
      // por cima de um Dialog do Radix (o modal da tarefa), o Radix marca
      // `pointer-events: none` no <body> para bloquear tudo fora do modal — e
      // este portal, sendo filho do body, herdava o bloqueio. As setas de
      // navegação e os botões da barra ficavam visíveis mas inertes.
      className="fixed inset-0 z-[200] bg-black/95 flex flex-col animate-in fade-in duration-150"
      // Inline de propósito: o Radix escreve `pointer-events: none` no style do
      // <body>, e style inline do body ganha de qualquer classe utilitária que
      // dependa da cascata. Aqui reativamos no elemento raiz do visualizador —
      // os filhos herdam e voltam a ser clicáveis.
      style={{ pointerEvents: "auto" }}
      role="dialog"
      aria-modal="true"
      aria-label={current.name || "Visualizar imagem"}
      onClick={() => { if (!movedRef.current) onClose(); }}
      // O Radix escuta `pointerdown` no document para fechar o modal quando o
      // clique cai fora dele. Sem barrar aqui, cada toque no visualizador
      // fechava a tarefa por baixo — e ao sair da foto não havia mais nada.
      // Só na fase de bolha: barrar na captura impediria o evento de CHEGAR aos
      // filhos, e aí o arraste da imagem (que usa onPointerDown) morria junto.
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Barra superior */}
      <div
        className="flex items-center gap-2 px-3 py-2 text-white/90 flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0 flex-1">
          {current.name && <p className="text-sm font-medium truncate">{current.name}</p>}
          <p className="text-2xs text-white/60 truncate">
            {images.length > 1 ? `${index + 1} de ${images.length}` : ""}
            {current.caption ? `${images.length > 1 ? " · " : ""}${current.caption}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => zoomBy(1 / 1.4)}
          disabled={scale <= MIN}
          className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center disabled:opacity-40 transition-colors"
          aria-label="Diminuir zoom"
        >
          <ZoomOut className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => zoomBy(1.4)}
          disabled={scale >= MAX}
          className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center disabled:opacity-40 transition-colors"
          aria-label="Aumentar zoom"
        >
          <ZoomIn className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={handleDownload}
          className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center transition-colors"
          aria-label="Baixar imagem"
          title="Baixar"
        >
          <Download className="w-5 h-5" />
        </button>
        <a
          href={current.url}
          target="_blank"
          rel="noopener noreferrer"
          className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center transition-colors"
          aria-label="Abrir original em nova aba"
          title="Abrir original"
        >
          <ExternalLink className="w-5 h-5" />
        </a>
        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center transition-colors"
          aria-label="Fechar"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Palco */}
      <div className="flex-1 min-h-0 relative flex items-center justify-center overflow-hidden">
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); go(-1); }}
              className="absolute left-2 z-10 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
              aria-label="Imagem anterior"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); go(1); }}
              className="absolute right-2 z-10 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
              aria-label="Próxima imagem"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}

        <img
          src={current.url}
          alt={current.name || ""}
          draggable={false}
          className={cn(
            "max-w-full max-h-full object-contain select-none",
            scale > MIN ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"
          )}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transition: dragRef.current ? "none" : "transform 0.15s ease-out",
          }}
          onClick={(e) => {
            e.stopPropagation();
            // Clique simples alterna entre enquadrado e 2,5x — o gesto que as
            // pessoas já esperam de qualquer visualizador de foto.
            if (movedRef.current) return;
            if (scale > MIN) reset(); else setScale(2.5);
          }}
          onPointerDown={(e) => {
            if (scale <= MIN) return;
            movedRef.current = false;
            dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = dragRef.current;
            if (!d) return;
            const dx = e.clientX - d.x;
            const dy = e.clientY - d.y;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) movedRef.current = true;
            setOffset({ x: d.ox + dx, y: d.oy + dy });
          }}
          onPointerUp={(e) => {
            dragRef.current = null;
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            // Zera no próximo tick para o onClick logo abaixo ainda enxergar
            // que houve arraste (e não fechar o visualizador sem querer).
            setTimeout(() => { movedRef.current = false; }, 0);
          }}
        />
      </div>
    </div>,
    document.body,
  );
}
