/**
 * CamiAvatar — ícone vetorial de rosto feminino para a IA "Cami".
 * Estilo line-art monocromático, alinhado ao DS Empire/GT3 (lucide-like).
 */
import type { SVGProps } from "react";

export function CamiAvatar(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* Cabelo (parte traseira larga, bob curto) */}
      <path d="M5 11.5c0-4.5 3-7.5 7-7.5s7 3 7 7.5v4c0 .8-.4 1.5-1 2v-2c0-3.3-2.7-6-6-6s-6 2.7-6 6v2c-.6-.5-1-1.2-1-2v-4Z" fill="currentColor" fillOpacity={0.15} />
      {/* Rosto (oval) */}
      <ellipse cx="12" cy="12.5" rx="4.2" ry="5" />
      {/* Olhos */}
      <circle cx="10.3" cy="12" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="13.7" cy="12" r="0.6" fill="currentColor" stroke="none" />
      {/* Cílios curtos sobre os olhos */}
      <path d="M9.6 11.2 Q10.3 10.7 11 11.2" />
      <path d="M13 11.2 Q13.7 10.7 14.4 11.2" />
      {/* Boca pequena com curvinha de sorriso */}
      <path d="M10.8 14.5 Q12 15.3 13.2 14.5" />
      {/* Franja (cobre testa) */}
      <path d="M7.5 9.5 Q9 7.5 12 7.5 Q15 7.5 16.5 9.5" />
      {/* Pescoço */}
      <path d="M10.5 17.2 V19 M13.5 17.2 V19" />
    </svg>
  );
}
