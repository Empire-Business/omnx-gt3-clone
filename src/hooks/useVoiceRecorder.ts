/**
 * useVoiceRecorder — v8.10.11
 * Gravação de áudio via MediaRecorder. Retorna File ao parar (webm/opus).
 */
import { useCallback, useEffect, useRef, useState } from "react";

export function useVoiceRecorder() {
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startTsRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0); // segundos
  const [error, setError] = useState<string | null>(null);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.start();
      mediaRef.current = rec;
      startTsRef.current = Date.now();
      setRecording(true);
      setElapsed(0);
      intervalRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTsRef.current) / 1000));
      }, 250);
    } catch (e: any) {
      setError(e?.message ?? "Permissão de microfone negada");
      stopTracks();
      setRecording(false);
    }
  }, []);

  const stop = useCallback((): Promise<File | null> => {
    return new Promise((resolve) => {
      const rec = mediaRef.current;
      if (!rec || rec.state === "inactive") {
        stopTracks();
        setRecording(false);
        resolve(null);
        return;
      }
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: rec.mimeType });
        chunksRef.current = [];
        stopTracks();
        setRecording(false);
        resolve(file);
      };
      rec.stop();
    });
  }, []);

  const cancel = useCallback(() => {
    const rec = mediaRef.current;
    if (rec && rec.state !== "inactive") {
      rec.onstop = null;
      try { rec.stop(); } catch {}
    }
    chunksRef.current = [];
    stopTracks();
    setRecording(false);
    setElapsed(0);
  }, []);

  useEffect(() => () => cancel(), [cancel]);

  return { start, stop, cancel, recording, elapsed, error };
}
