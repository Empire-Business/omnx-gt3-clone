/**
 * Compressão automática de imagens > 2 MB no client antes do upload.
 * Usa browser-image-compression em workers para não travar o thread principal.
 */
import imageCompression from "browser-image-compression";

const THRESHOLD_BYTES = 2 * 1024 * 1024; // 2 MB

export async function maybeCompressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= THRESHOLD_BYTES) return file;
  if (file.type === "image/gif") return file; // preserva animação
  try {
    const compressed = await imageCompression(file, {
      maxSizeMB: 1.5,
      maxWidthOrHeight: 2200,
      useWebWorker: true,
      initialQuality: 0.82,
    });
    // mantém o nome original
    return new File([compressed], file.name, { type: compressed.type, lastModified: file.lastModified });
  } catch {
    return file;
  }
}
