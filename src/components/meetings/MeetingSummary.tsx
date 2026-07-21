/**
 * MeetingSummary — v8.11.2
 * Conteúdo gerado pela IA (resumo, key points, action items) + empty-state
 * informativo que reflete o estado real do job (transcrição salva? job
 * processando? erro?), para o usuário entender o que houve sem abrir o banco.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MarkdownViewer } from "@/components/shared/MarkdownViewer";
import { Meeting, useMeetingAiJob } from "@/hooks/useMeetings";
import { FileText, AlertTriangle, CheckCircle, Target, Loader2, MicOff, RefreshCw } from "lucide-react";

interface Props {
  meeting: Meeting;
}

export function MeetingSummary({ meeting }: Props) {
  const hasAnyAI =
    !!meeting.summary_markdown ||
    (meeting.key_points?.length ?? 0) > 0 ||
    (meeting.attention_points?.length ?? 0) > 0 ||
    (meeting.action_items?.length ?? 0) > 0;

  // Polling enquanto o job não terminou — assim o usuário vê progresso/erro em tempo real
  const { data: aiJob } = useMeetingAiJob(
    meeting.id,
    !hasAnyAI && meeting.status !== "scheduled",
  );

  const hasTranscript = !!meeting.transcript_raw && meeting.transcript_raw.trim().length > 0;
  const aiError =
    aiJob?.status === "failed" ? aiJob.error_message :
    (meeting.metadata as any)?.ai_error || null;
  const aiRunning = aiJob && (aiJob.status === "queued" || aiJob.status === "processing");

  return (
    <div className="space-y-6">
      {!hasAnyAI && (
        <Card>
          <CardContent className="py-8 px-6 space-y-3">
            {aiRunning ? (
              <div className="flex items-start gap-3">
                <Loader2 className="w-5 h-5 mt-0.5 text-primary animate-spin flex-shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    Processando com IA…
                    {typeof aiJob?.progress === "number" && aiJob.progress > 0 && ` ${aiJob.progress}%`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Fase: {aiJob?.phase || "iniciando"}
                    {aiJob?.processed_chunks != null && aiJob?.total_chunks
                      ? ` · ${aiJob.processed_chunks}/${aiJob.total_chunks} blocos`
                      : ""}
                  </p>
                </div>
              </div>
            ) : aiError ? (
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 mt-0.5 text-destructive flex-shrink-0" />
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-foreground">
                    A IA não conseguiu gerar o resumo.
                  </p>
                  <p className="text-xs text-muted-foreground break-words">{aiError}</p>
                  {hasTranscript && (
                    <p className="text-xs text-muted-foreground">
                      Clique em <span className="font-medium">Reprocessar IA</span> acima para tentar novamente.
                    </p>
                  )}
                </div>
              </div>
            ) : !hasTranscript ? (
              <div className="flex items-start gap-3">
                <MicOff className="w-5 h-5 mt-0.5 text-muted-foreground flex-shrink-0" />
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-foreground">
                    Nenhuma transcrição foi salva nesta reunião.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    A gravação pode não ter capturado áudio (microfone bloqueado, sem fala detectada,
                    ou aba encerrada antes do flush). Inicie uma nova gravação ou edite a reunião
                    para colar uma transcrição manual.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <RefreshCw className="w-5 h-5 mt-0.5 text-muted-foreground flex-shrink-0" />
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-foreground">
                    Transcrição salva, mas o resumo ainda não foi gerado.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Clique em <span className="font-medium">Reprocessar IA</span> acima para gerar agora.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      {meeting.summary_markdown && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="w-5 h-5" />
              Resumo da Reunião
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MarkdownViewer content={meeting.summary_markdown} />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Key Points */}
        {meeting.key_points?.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="w-4 h-4 text-primary" />
                Pontos-Chave
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {meeting.key_points.map((kp: any, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    {kp.text || kp}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Attention Points */}
        {meeting.attention_points?.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="w-4 h-4 text-warning" />
                Pontos de Atenção
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {meeting.attention_points.map((ap: any, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Badge variant="outline" className="text-xs flex-shrink-0">
                      {ap.severity || "medium"}
                    </Badge>
                    {ap.text || ap}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Action Items */}
      {meeting.action_items?.length > 0 && (
           <Card>
             <CardHeader>
               <CardTitle className="flex items-center gap-2 text-base">
                 <CheckCircle className="w-4 h-4 text-success" />
                 Itens de Ação
               </CardTitle>
             </CardHeader>
          <CardContent>
            <ul className="space-y-2">
               {meeting.action_items.map((item: any, i: number) => (
                 <li key={i} className="flex items-start gap-2 text-sm">
                   <span className="w-1.5 h-1.5 rounded-full bg-success mt-1.5 flex-shrink-0" />
                   <div>
                    <span>{item.text || item}</span>
                    {item.responsible && (
                      <Badge variant="secondary" className="ml-2 text-xs">{item.responsible}</Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
