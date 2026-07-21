import { useState } from "react";
import { useWebhookLogs } from "@/hooks/useWebhooks";
import { 
  CheckCircle2, XCircle, Clock, RefreshCw, 
  ChevronDown, ChevronRight, Send, AlertCircle 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface WebhookLogsProps {
  webhookId?: string;
  limit?: number;
}

/**
 * Componente para visualizar logs de webhooks
 */
export function WebhookLogs({ webhookId, limit = 50 }: WebhookLogsProps) {
  const { data: logs, isLoading, refetch } = useWebhookLogs(webhookId, limit);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <div className="text-center py-8">
        <Send className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">Nenhum log encontrado</p>
        <p className="text-sm text-muted-foreground">
          Os logs aparecerão quando os webhooks forem disparados.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Últimos {logs.length} logs
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      <ScrollArea className="h-[500px]">
        <div className="space-y-2">
          {logs.map((log) => (
            <LogItem
              key={log.id}
              log={log}
              isExpanded={expandedLog === log.id}
              onToggle={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

interface LogItemProps {
  log: {
    id: string;
    event_type: string;
    success: boolean;
    response_status?: number;
    duration_ms?: number;
    created_at: string;
    payload?: any;
    response_body?: string;
  };
  isExpanded: boolean;
  onToggle: () => void;
}

function LogItem({ log, isExpanded, onToggle }: LogItemProps) {
  const statusIcon = log.success ? (
    <CheckCircle2 className="w-5 h-5 text-success" />
  ) : (
    <XCircle className="w-5 h-5 text-destructive" />
  );

  const statusBadge = log.success ? (
    <Badge variant="default" className="bg-success text-success-foreground">
      Sucesso
    </Badge>
  ) : (
    <Badge variant="destructive">
      Falha
    </Badge>
  );

  return (
    <Card 
      className={cn(
        "cursor-pointer transition-colors",
        isExpanded && "border-primary"
      )}
      onClick={onToggle}
    >
      <CardHeader className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {statusIcon}
            <div>
              <div className="flex items-center gap-2">
                <code className="text-sm font-mono text-primary">
                  {log.event_type}
                </code>
                {statusBadge}
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                </span>
                {log.response_status && (
                  <span>HTTP {log.response_status}</span>
                )}
                {log.duration_ms && (
                  <span>{log.duration_ms}ms</span>
                )}
              </div>
            </div>
          </div>
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="px-3 pb-3 pt-0">
          <div className="space-y-3">
            {/* Payload */}
            <div>
              <h4 className="text-xs font-semibold text-foreground mb-1 uppercase">
                Payload Enviado
              </h4>
              <pre className="bg-muted rounded-lg p-3 text-xs font-mono overflow-x-auto">
                {JSON.stringify(log.payload, null, 2)}
              </pre>
            </div>

            {/* Response */}
            {log.response_body && (
              <div>
                <h4 className="text-xs font-semibold text-foreground mb-1 uppercase">
                  Resposta
                </h4>
                <pre className="bg-muted rounded-lg p-3 text-xs font-mono overflow-x-auto">
                  {log.response_body}
                </pre>
              </div>
            )}

            {/* Error details if failed */}
            {!log.success && (
              <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-destructive">
                      Falha no envio
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      O webhook falhou após 3 tentativas. Verifique se a URL está acessível 
                      e se o endpoint está retornando HTTP 200-299.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

/**
 * Componente de teste manual de webhook
 */
export function WebhookTester({ webhookId, webhookUrl }: { webhookId: string; webhookUrl: string }) {
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    status?: number;
    message: string;
  } | null>(null);

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      // Simular um evento de teste
      const testPayload = {
        event: "webhook.test",
        timestamp: new Date().toISOString(),
        data: {
          message: "Este é um evento de teste",
          webhook_id: webhookId,
        },
      };

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Event": "webhook.test",
        },
        body: JSON.stringify(testPayload),
      });

      if (response.ok) {
        setTestResult({
          success: true,
          status: response.status,
          message: "Webhook enviado com sucesso!",
        });
      } else {
        setTestResult({
          success: false,
          status: response.status,
          message: `Erro HTTP ${response.status}: ${response.statusText}`,
        });
      }
    } catch (error: any) {
      setTestResult({
        success: false,
        message: error.message || "Erro ao enviar webhook",
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-4 bg-muted/50 rounded-lg">
        <p className="text-sm text-muted-foreground mb-3">
          Envie um evento de teste para verificar se o webhook está configurado corretamente.
        </p>
        <Button 
          onClick={handleTest} 
          disabled={isTesting}
          className="gap-2"
        >
          {isTesting ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Enviando...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Enviar Evento de Teste
            </>
          )}
        </Button>
      </div>

      {testResult && (
        <div className={cn(
          "p-4 rounded-lg border",
          testResult.success 
            ? "bg-success/10 border-success/30" 
            : "bg-destructive/10 border-destructive/30"
        )}>
          <div className="flex items-start gap-2">
            {testResult.success ? (
              <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            )}
            <div>
              <p className={cn(
                "font-medium",
                testResult.success ? "text-success" : "text-destructive"
              )}>
                {testResult.success ? "Sucesso" : "Falha"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {testResult.message}
              </p>
              {testResult.status && (
                <p className="text-sm text-muted-foreground">
                  HTTP Status: {testResult.status}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
