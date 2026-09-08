/**
 * audio-to-wav — converte o áudio gravado pelo MediaRecorder (webm/opus, ogg,
 * mp4…) em WAV PCM 16 bits, 16 kHz, mono.
 *
 * Motivo: a API de `input_audio` do OpenRouter/OpenAI só aceita `wav` e `mp3`.
 * Enviar o `webm/opus` cru faz o modelo devolver texto solto em vez do JSON
 * pedido — foi o que quebrou a tarefa por voz. A decodificação usa a Web Audio
 * API, que lê opus nativamente, e a reamostragem para 16 kHz mono derruba o
 * tamanho do payload (fala não precisa de mais que isso).
 */

const TARGET_SAMPLE_RATE = 16000;

/** Mistura os canais em mono e reamostra para 16 kHz via OfflineAudioContext. */
async function decodeToMono16k(file: File): Promise<Float32Array> {
  const arrayBuffer = await file.arrayBuffer();

  const AudioCtx: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const decodeCtx = new AudioCtx();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuffer);
  } finally {
    void decodeCtx.close();
  }

  const frames = Math.max(1, Math.ceil((decoded.duration * TARGET_SAMPLE_RATE)));
  const offline = new OfflineAudioContext(1, frames, TARGET_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();

  return rendered.getChannelData(0);
}

/** Serializa PCM float32 [-1,1] como WAV 16 bits. */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // tamanho do bloco fmt
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits por amostra
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Converte o arquivo gravado em WAV 16 kHz mono. Se a decodificação falhar
 * (codec exótico), devolve o arquivo original — o backend ainda tem fallback de
 * modelos e é melhor tentar do que abortar a gravação do usuário.
 */
export async function toWav16kMono(file: File): Promise<File> {
  try {
    const samples = await decodeToMono16k(file);
    const blob = encodeWav(samples, TARGET_SAMPLE_RATE);
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".wav", { type: "audio/wav" });
  } catch (err) {
    console.warn("[audio-to-wav] falha ao converter, enviando original:", err);
    return file;
  }
}
