/**
 * MeetingStats — v8.36.0
 *
 * Painel de estatísticas de participação de uma reunião.
 *
 * O que mostra e com que honestidade:
 *  - COMPARECIMENTO: medido de verdade (eventos join/leave do LiveKit). Quando
 *    não há evento nenhum para a reunião, exibe um vazio explicando o motivo —
 *    nunca zeros, que seriam mentira.
 *  - TEMPO DE FALA: ESTIMATIVA a partir da proporção de texto por falante na
 *    transcrição. A diarização do Soniox é anônima (Speaker 1/2/3), então o
 *    painel deixa claro que os rótulos não são pessoas.
 *  - CÂMERA: indisponível hoje. O painel diz exatamente o que falta em vez de
 *    inventar número.
 *
 * Tudo clicável: cada participante vinculado a um colaborador abre o
 * EmployeeDetailModal com o contexto completo da pessoa.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AvatarBadge } from "@/components/shared/SharedComponents";
import { EmployeeDetailModal } from "@/components/shared/EmployeeDetailModal";
import { useEmployees, type EmployeeWithDetails } from "@/hooks/useEmployees";
import {
  useMeetingStats,
  formatDurationShort,
  type MeetingParticipantStat,
  type AbsentInvitee,
} from "@/hooks/useMeetingStats";
import type { Meeting } from "@/hooks/useMeetings";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  CalendarClock,
  Clock,
  Info,
  Mic,
  RefreshCw,
  UserCheck,
  UserX,
  Users,
  Video,
} from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";

interface MeetingStatsProps {
  meeting: Meeting;
}

const ROLE_LABEL: Record<string, string> = {
  organizer: "Organizador",
  required: "Obrigatório",
  optional: "Opcional",
};

const DECLARED_STATUS_LABEL: Record<string, string> = {
  pending: "Sem resposta",
  confirmed: "Confirmou presença",
  declined: "Recusou o convite",
  attended: "Marcado como presente",
};

function formatClock(iso: string | null): string {
  if (!iso) return "—";
  const d = parseISO(iso);
  return isValid(d) ? format(d, "HH:mm", { locale: ptBR }) : "—";
}

/* ────────────────────────────────────────────────────────────────
   KPI
   ──────────────────────────────────────────────────────────────── */

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 sm:p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-1.5 text-xl font-bold leading-none sm:text-2xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   Linha de participante presente
   ──────────────────────────────────────────────────────────────── */

function ParticipantRow({
  participant,
  onOpen,
}: {
  participant: MeetingParticipantStat;
  onOpen: (employeeId: string) => void;
}) {
  const clickable = !!participant.employeeId;
  const ratio = participant.attendanceRate;

  const content = (
    <>
      <AvatarBadge name={participant.name} avatarUrl={participant.avatarUrl} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium">{participant.name}</span>
          {participant.invitedRole === "organizer" && (
            <Badge variant="secondary" className="text-2xs">
              Organizador
            </Badge>
          )}
          {!participant.wasInvited && (
            <Badge variant="outline" className="text-2xs">
              Sem convite
            </Badge>
          )}
          {participant.reconnections > 0 && (
            <Badge variant="outline" className="gap-1 text-2xs">
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              {participant.reconnections}{" "}
              {participant.reconnections === 1 ? "reconexão" : "reconexões"}
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Entrou {formatClock(participant.firstJoinAt)} · Saiu{" "}
          {formatClock(participant.lastLeaveAt)}
        </p>
        {ratio != null && (
          <Progress
            value={Math.round(ratio * 100)}
            className="mt-2 h-1.5"
            aria-label={`Permanência de ${participant.name}: ${Math.round(ratio * 100)}% da reunião`}
          />
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold tabular-nums">
          {formatDurationShort(participant.totalSeconds)}
        </p>
        {ratio != null && (
          <p className="text-xs text-muted-foreground tabular-nums">
            {Math.round(ratio * 100)}% da reunião
          </p>
        )}
      </div>
    </>
  );

  if (!clickable) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border p-3">{content}</div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(participant.employeeId!)}
      className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Abrir detalhes de ${participant.name}`}
    >
      {content}
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────
   Linha de convidado ausente
   ──────────────────────────────────────────────────────────────── */

function AbsentRow({
  invitee,
  onOpen,
}: {
  invitee: AbsentInvitee;
  onOpen: (employeeId: string) => void;
}) {
  const clickable = !!invitee.employeeId;
  const content = (
    <>
      <AvatarBadge
        name={invitee.name}
        avatarUrl={invitee.avatarUrl}
        size="sm"
        className="opacity-60"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium">{invitee.name}</span>
          <Badge variant="outline" className="text-2xs">
            {ROLE_LABEL[invitee.role] ?? invitee.role}
          </Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {DECLARED_STATUS_LABEL[invitee.declaredStatus] ?? invitee.declaredStatus}
        </p>
      </div>
      <UserX className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </>
  );

  if (!clickable) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-dashed border-border p-3">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(invitee.employeeId!)}
      className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Abrir detalhes de ${invitee.name}`}
    >
      {content}
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────
   Componente principal
   ──────────────────────────────────────────────────────────────── */

export function MeetingStats({ meeting }: MeetingStatsProps) {
  const { data: employees = [] } = useEmployees();
  const { stats, isLoading, isError, error, refetch } = useMeetingStats(meeting, { employees });

  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeWithDetails | null>(null);

  const openEmployee = (employeeId: string) => {
    const emp = employees.find((e) => e.id === employeeId) ?? null;
    if (emp) setSelectedEmployee(emp);
  };

  const selectedManager = useMemo(
    () =>
      selectedEmployee?.manager_id
        ? (employees.find((e) => e.id === selectedEmployee.manager_id) ?? null)
        : null,
    [selectedEmployee, employees],
  );
  const selectedDirectReports = useMemo(
    () => (selectedEmployee ? employees.filter((e) => e.manager_id === selectedEmployee.id) : []),
    [selectedEmployee, employees],
  );

  /* ── Loading ── */
  if (isLoading || !stats) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[88px] w-full rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  /* ── Erro ── */
  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>Não foi possível carregar as estatísticas</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{error?.message || "Erro ao consultar os eventos de participação."}</p>
          <Button size="sm" variant="outline" onClick={() => void refetch()}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
            Tentar novamente
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const { presence, speech, camera, durationSeconds } = stats;

  return (
    <div className="space-y-4">
      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={Clock}
          label="Duração"
          value={formatDurationShort(durationSeconds)}
          hint={durationSeconds == null ? "Não registrada" : undefined}
        />
        <Kpi
          icon={Users}
          label="Presentes"
          value={
            presence.available
              ? `${presence.attendedCount}/${presence.invitedCount || presence.attendedCount}`
              : "—"
          }
          hint={presence.available ? "Compareceram / convidados" : "Sem medição"}
        />
        <Kpi
          icon={UserCheck}
          label="Permanência média"
          value={presence.available ? formatDurationShort(presence.averageSeconds) : "—"}
          hint={presence.available ? "Entre quem compareceu" : "Sem medição"}
        />
        <Kpi
          icon={Mic}
          label="Falantes"
          value={speech.available ? String(speech.speakers.length) : "—"}
          hint={speech.available ? "Detectados na transcrição" : "Sem transcrição"}
        />
      </div>

      {/* ── Comparecimento ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCheck className="h-4 w-4" aria-hidden="true" />
            Comparecimento e permanência
          </CardTitle>
          <CardDescription>
            {presence.available
              ? "Medido pelos eventos de entrada e saída da sala. Clique em alguém para abrir o perfil."
              : "Presença medida automaticamente durante a reunião."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!presence.available ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <CalendarClock
                className="mx-auto mb-2 h-8 w-8 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="text-sm font-medium">Sem dados de presença para esta reunião</p>
              <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                Nenhum evento de entrada ou saída foi registrado. Isso acontece em reuniões
                presenciais, em reuniões por link externo e em reuniões realizadas antes de o
                registro de presença passar a existir. Reuniões novas feitas pela sala do GT3 passam
                a exibir os tempos aqui.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {presence.participants.map((p) => (
                  <ParticipantRow key={p.key} participant={p} onOpen={openEmployee} />
                ))}
              </div>

              {presence.uninvitedCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  {presence.uninvitedCount}{" "}
                  {presence.uninvitedCount === 1
                    ? "pessoa entrou sem constar na lista de convidados."
                    : "pessoas entraram sem constar na lista de convidados."}
                </p>
              )}
            </>
          )}

          {/* Convidados × presentes */}
          {presence.absentInvitees.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold">
                    Convidados que não entraram ({presence.absentInvitees.length})
                  </h4>
                  {presence.available && (
                    <Badge variant="outline" className="text-2xs">
                      {presence.attendedCount} de {presence.invitedCount} convidados
                    </Badge>
                  )}
                </div>
                {!presence.available && (
                  <p className="text-xs text-muted-foreground">
                    Lista baseada apenas no convite — sem medição de presença não é possível afirmar
                    que estas pessoas faltaram.
                  </p>
                )}
                {presence.available &&
                  presence.absentInvitees.map((a) => (
                    <AbsentRow key={a.key} invitee={a} onOpen={openEmployee} />
                  ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Tempo de fala ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Mic className="h-4 w-4" aria-hidden="true" />
            Distribuição da fala
          </CardTitle>
          <CardDescription>
            Quanto cada falante ocupou da conversa, a partir da transcrição.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!speech.available ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <Mic className="mx-auto mb-2 h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">Sem transcrição para esta reunião</p>
              <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                A distribuição da fala é calculada sobre a transcrição gerada durante a reunião.
                Reuniões sem transcrição não têm essa métrica.
              </p>
            </div>
          ) : (
            <>
              <Alert>
                <Info className="h-4 w-4" aria-hidden="true" />
                <AlertTitle>Estimativa, não cronômetro</AlertTitle>
                <AlertDescription className="text-xs">
                  A transcrição separa os falantes de forma anônima (Falante 1, Falante 2…) e não
                  guarda o instante de cada palavra. Por isso a proporção abaixo é calculada pelo
                  volume de texto de cada falante, e os minutos são essa proporção aplicada à duração
                  da reunião. Os rótulos <strong>não</strong> identificam quem é quem.
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                {speech.speakers.map((s, index) => (
                  <div key={s.speaker} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {s.speaker.replace(/^Speaker\s*/i, "Falante ")}
                      </span>
                      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                        {Math.round(s.share * 100)}%
                        {s.estimatedSeconds != null && (
                          <> · ~{formatDurationShort(s.estimatedSeconds)}</>
                        )}
                      </span>
                    </div>
                    <Progress
                      value={Math.round(s.share * 100)}
                      className={cn("h-2", index === 0 && "[&>div]:bg-primary")}
                      aria-label={`${s.speaker}: ${Math.round(s.share * 100)}% da fala`}
                    />
                    <p className="text-xs text-muted-foreground">
                      {s.words.toLocaleString("pt-BR")} palavras em {s.turns}{" "}
                      {s.turns === 1 ? "intervenção" : "intervenções"}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Câmera ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Video className="h-4 w-4" aria-hidden="true" />
            Tempo de câmera
          </CardTitle>
          <CardDescription>Quanto tempo cada pessoa ficou com a câmera aberta.</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Métrica ainda não disponível</AlertTitle>
            <AlertDescription className="space-y-2 text-xs">
              <p>{camera.reason}</p>
              <p className="font-medium">Para passar a existir, falta:</p>
              <ul className="list-disc space-y-1 pl-4">
                {camera.missing.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p>
                Nenhum número é exibido aqui de propósito — um valor inventado seria pior do que a
                ausência dele.
              </p>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <EmployeeDetailModal
        employee={selectedEmployee}
        manager={selectedManager}
        directReports={selectedDirectReports}
        open={!!selectedEmployee}
        onClose={() => setSelectedEmployee(null)}
        onSelectEmployee={setSelectedEmployee}
        allEmployees={employees}
      />
    </div>
  );
}
