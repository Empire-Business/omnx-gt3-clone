/**
 * CopyGuestLinkButton — v8.7.0
 * Copia link público de convidado para a área de transferência.
 */
import { Button } from "@/components/ui/button";
import { Link2, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { getGuestMeetUrl } from "@/hooks/useLiveKit";

interface CopyGuestLinkButtonProps {
  roomName: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  label?: string;
  stopPropagation?: boolean;
}

export function CopyGuestLinkButton({
  roomName,
  variant = "outline",
  size = "sm",
  className,
  label = "Copiar link de convidado",
  stopPropagation = false,
}: CopyGuestLinkButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    if (stopPropagation) e.stopPropagation();
    const url = getGuestMeetUrl(roomName);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link de convidado copiado");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleCopy}
      className={className}
      type="button"
    >
      {copied ? <Check className="w-4 h-4 mr-2" /> : <Link2 className="w-4 h-4 mr-2" />}
      {label}
    </Button>
  );
}
