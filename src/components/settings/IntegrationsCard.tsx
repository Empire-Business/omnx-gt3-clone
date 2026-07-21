import { Video, Sparkles, Disc, Mail, Bell, RefreshCw, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useIntegrations, type FeatureKey, type FeatureInfo } from "@/hooks/useIntegrations";

// Metadados de apresentação de cada integração. A ordem reflete a dependência:
// reuniões é a raiz; transcrição/IA e gravação são camadas independentes.
const META: Record<
  FeatureKey,
  { label: string; provider: string; icon: typeof Video; enables: string; docsUrl: string }
> = {
  meetings: {
    label: "Reuniões & Huddles",
    provider: "LiveKit",
    icon: Video,
    enables: "Aba Reuniões, salas ao vivo e chamadas rápidas (huddles) no chat.",
    docsUrl: "https://cloud.livekit.io",
  },
  ai: {
    label: "IA & Transcrição",
    provider: "OpenRouter",
    icon: Sparkles,
    enables: "Resumo automático de reuniões, transcrição de áudio (chat/feed) e assistentes.",
    docsUrl: "https://openrouter.ai/keys",
  },
  recording: {
    label: "Gravação de Reuniões",
    provider: "Cloudflare R2 / S3",
    icon: Disc,
    enables: "Gravação em MP4 das reuniões (a reunião ao vivo funciona sem isto).",
    docsUrl: "https://dash.cloudflare.com",
  },
  email: {
    label: "Notificações por E-mail",
    provider: "Resend",
    icon: Mail,
    enables: "E-mail de resumo de mensagens de chat não lidas.",
    docsUrl: "https://resend.com/api-keys",
  },
  push: {
    label: "Notificações Push",
    provider: "Web Push (VAPID)",
    icon: Bell,
    enables: "Push do navegador para tarefas, chat e feed.",
    docsUrl: "https://vapidkeys.com",
  },
};

function StatusBadge({ f }: { f: FeatureInfo }) {
  if (f.manuallyDisabled) {
    return <Badge className="bg-muted text-muted-foreground">Desativada</Badge>;
  }
  if (!f.available) {
    return <Badge className="bg-warning/10 text-warning">Não conectada</Badge>;
  }
  if (f.health === "invalid") {
    return <Badge className="bg-destructive/10 text-destructive">Chave inválida</Badge>;
  }
  if (f.health === "error") {
    return <Badge className="bg-warning/10 text-warning">Falha ao validar</Badge>;
  }
  return <Badge className="bg-success/10 text-success">Conectada</Badge>;
}

export function IntegrationsCard() {
  const { features, loading, isError, refetch, setManuallyDisabled } = useIntegrations({ probe: true });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Integrações</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-8">
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Revalidar
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Cada função aparece automaticamente quando a chave de API correspondente está conectada
          neste ambiente. Se não estiver conectada, a função fica oculta em toda a plataforma.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">
            Não foi possível carregar o status das integrações. Tente revalidar.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {features.map((f) => {
              const meta = META[f.key];
              const Icon = meta.icon;
              return (
                <div key={f.key} className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-foreground">{meta.label}</p>
                      <StatusBadge f={f} />
                      <span className="text-xs text-muted-foreground">via {meta.provider}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{meta.enables}</p>
                    {!f.available && f.missing.length > 0 && (
                      <p className="text-xs text-warning mt-1.5">
                        Configure {f.missing.join(", ")} no ambiente para habilitar.{" "}
                        <a
                          href={meta.docsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 underline hover:text-foreground"
                        >
                          Obter chave <ExternalLink className="w-3 h-3" />
                        </a>
                      </p>
                    )}
                  </div>
                  {/* Override: só permite DESLIGAR o que está disponível — nunca ligar sem chave */}
                  <div className="flex items-center pt-0.5">
                    <Switch
                      checked={f.available && !f.manuallyDisabled}
                      disabled={!f.available || setManuallyDisabled.isPending}
                      onCheckedChange={(checked) =>
                        setManuallyDisabled.mutate(
                          { key: f.key, disabled: !checked },
                          {
                            onSuccess: () =>
                              toast.success(
                                checked ? `${meta.label} ativada` : `${meta.label} desativada`
                              ),
                            onError: (e: any) => toast.error(e?.message ?? "Falha ao atualizar"),
                          }
                        )
                      }
                      aria-label={`Ativar ${meta.label}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
