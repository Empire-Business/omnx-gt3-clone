/**
 * VirtualBackgroundControl — v8.10.4
 * Botão na ControlBar que abre o seletor de fundo virtual (BackgroundPickerPopover).
 * Lê a LocalVideoTrack da câmera via useLocalParticipant e delega tudo para o picker.
 */
import { useLocalParticipant } from "@livekit/components-react";
import { Track, type LocalVideoTrack } from "livekit-client";
import { BackgroundPickerPopover } from "./BackgroundPickerPopover";

export function VirtualBackgroundControl() {
  const { localParticipant } = useLocalParticipant();
  const pub = localParticipant?.getTrackPublication(Track.Source.Camera);
  const track = (pub?.track as LocalVideoTrack | undefined) ?? null;

  return <BackgroundPickerPopover track={track} />;
}
