import { toPng, toJpeg, toSvg } from 'html-to-image';
import { jsPDF } from 'jspdf';

export type ImageFormat = 'png' | 'jpeg' | 'svg';

interface ExportOptions {
  quality?: number;
  backgroundColor?: string;
  pixelRatio?: number;
  /** Elemento a capturar. Se ausente, tenta localizar um `.react-flow` no DOM. */
  element?: HTMLElement | null;
}

/** Resolve o elemento-alvo: explícito > `.react-flow` visível. */
function resolveFlowElement(element?: HTMLElement | null): HTMLElement | null {
  if (element) {
    return (element.closest('.react-flow') as HTMLElement) || element;
  }
  const viewport = document.querySelector('.react-flow__viewport') as HTMLElement | null;
  if (viewport) return viewport.closest('.react-flow') as HTMLElement;
  return document.querySelector('.react-flow') as HTMLElement | null;
}

/** Cor de fundo padrão sensível ao tema (usa o bg computado do body). */
function themeBackgroundColor(): string {
  try {
    const bg = getComputedStyle(document.body).backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
  } catch {
    /* noop */
  }
  const dark = document.documentElement.classList.contains('dark');
  return dark ? '#0D1829' : '#ffffff';
}

function getFilterFn() {
  return (node: HTMLElement) => {
    if (!node.classList) return true;
    return (
      !node.classList.contains('react-flow__minimap') &&
      !node.classList.contains('react-flow__controls') &&
      !node.classList.contains('react-flow__attribution') &&
      !node.classList.contains('react-flow__panel')
    );
  };
}

function buildOpts(options: ExportOptions) {
  return {
    quality: options.quality ?? 0.95,
    backgroundColor: options.backgroundColor ?? themeBackgroundColor(),
    pixelRatio: options.pixelRatio ?? 2,
    cacheBust: true,
    includeQueryParams: true,
    skipAutoScale: true,
    filter: getFilterFn(),
    style: { overflow: 'visible' },
    fetchRequestInit: {
      mode: 'cors' as RequestMode,
      cache: 'no-cache' as RequestCache,
    },
    imagePlaceholder:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  };
}

type CaptureOptions = Record<string, unknown>;

async function captureWithRetry(
  el: HTMLElement,
  captureFn: (el: HTMLElement, opts: CaptureOptions) => Promise<string>,
  opts: CaptureOptions,
  retries = 3
): Promise<string> {
  let lastError: Error | null = null;
  for (let i = 0; i < retries; i++) {
    try {
      if (i > 0) await new Promise((r) => setTimeout(r, 200 * i));
      return await captureFn(el, opts);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`Export attempt ${i + 1} failed:`, lastError.message);
    }
  }
  throw lastError || new Error('Falha ao exportar após múltiplas tentativas');
}

export async function exportDiagramAsImage(
  format: ImageFormat,
  options: ExportOptions = {}
): Promise<string> {
  const el = resolveFlowElement(options.element);
  if (!el) throw new Error('Diagrama não encontrado. Certifique-se de que o diagrama está visível.');
  const opts = buildOpts(options);
  const captureFn = format === 'png' ? toPng : format === 'jpeg' ? toJpeg : toSvg;
  return captureWithRetry(el, captureFn, opts);
}

export async function exportDiagramAsPDF(options: ExportOptions = {}): Promise<void> {
  const dataUrl = await exportDiagramAsImage('png', { ...options, pixelRatio: 3 });

  const img = new Image();
  img.src = dataUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Falha ao carregar imagem para PDF'));
  });

  const isLandscape = img.width > img.height;
  const scaleFactor = 3;
  const pdfWidth = img.width / scaleFactor;
  const pdfHeight = img.height / scaleFactor;

  const pdf = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'px',
    format: [pdfWidth, pdfHeight],
  });

  pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
  pdf.save('diagrama-processo.pdf');
}

/** Converte um data URL PNG para Blob. */
function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(',');
  const mime = meta.match(/:(.*?);/)?.[1] || 'image/png';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/** Copia o diagrama (PNG) para a área de transferência. */
export async function copyDiagramToClipboard(options: ExportOptions = {}): Promise<void> {
  const ClipboardItemCtor = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
  if (!navigator.clipboard || !ClipboardItemCtor) {
    throw new Error('Seu navegador não suporta copiar imagem para a área de transferência.');
  }
  const dataUrl = await exportDiagramAsImage('png', options);
  const blob = dataUrlToBlob(dataUrl);
  await navigator.clipboard.write([new ClipboardItemCtor({ [blob.type]: blob })]);
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
