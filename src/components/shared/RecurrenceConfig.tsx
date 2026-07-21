import { useState, useEffect } from "react";
import { Repeat, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTaskRecurrence, TaskRecurrence } from "@/hooks/useTaskRecurrence";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Frequency = "daily" | "weekly" | "biweekly" | "monthly" | "custom" | "weekdays" | "specific_days";

const FREQUENCY_OPTIONS: { value: Frequency; label: string }[] = [
  { value: "daily", label: "Diariamente" },
  { value: "weekdays", label: "Dias úteis (seg–sex)" },
  { value: "weekly", label: "Semanalmente" },
  { value: "biweekly", label: "Quinzenalmente" },
  { value: "monthly", label: "Mensalmente" },
  { value: "specific_days", label: "Dias específicos" },
  { value: "custom", label: "Intervalo personalizado" },
];

const DAYS_OF_WEEK = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
];

interface RecurrenceConfigProps {
  taskId: string;
  canEdit?: boolean;
}

export function RecurrenceConfig({ taskId, canEdit = true }: RecurrenceConfigProps) {
  const { data: recurrence, saveRecurrence, deleteRecurrence } = useTaskRecurrence(taskId);

  const [editing, setEditing] = useState(false);
  const [frequency, setFrequency] = useState<Frequency>("weekly");
  const [intervalDays, setIntervalDays] = useState(7);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1]); // Monday
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [endDate, setEndDate] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (recurrence) {
      setFrequency(recurrence.frequency as Frequency);
      setIntervalDays(recurrence.interval_days || 7);
      setDaysOfWeek(recurrence.days_of_week || [1]);
      setDayOfMonth(recurrence.day_of_month || 1);
      setEndDate(recurrence.end_date || "");
      setIsActive(recurrence.is_active);
    }
  }, [recurrence]);

  const calcNextOccurrence = (): string => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    switch (frequency) {
      case "daily":
        today.setDate(today.getDate() + 1);
        break;
      case "weekdays":
        today.setDate(today.getDate() + 1);
        while (today.getDay() === 0 || today.getDay() === 6) {
          today.setDate(today.getDate() + 1);
        }
        break;
      case "weekly":
      case "biweekly": {
        const daysAhead = frequency === "weekly" ? 7 : 14;
        today.setDate(today.getDate() + daysAhead);
        break;
      }
      case "monthly":
        today.setMonth(today.getMonth() + 1);
        today.setDate(dayOfMonth);
        break;
      case "specific_days": {
        if (daysOfWeek.length === 0) break;
        today.setDate(today.getDate() + 1);
        for (let i = 0; i < 7; i++) {
          if (daysOfWeek.includes(today.getDay())) break;
          today.setDate(today.getDate() + 1);
        }
        break;
      }
      case "custom":
        today.setDate(today.getDate() + intervalDays);
        break;
    }
    return today.toISOString().substring(0, 10);
  };

  const handleSave = async () => {
    try {
      await saveRecurrence.mutateAsync({
        task_id: taskId,
        frequency: frequency as TaskRecurrence["frequency"],
        interval_days: frequency === "custom" ? intervalDays : null,
        days_of_week: (frequency === "weekly" || frequency === "specific_days") ? daysOfWeek : null,
        day_of_month: frequency === "monthly" ? dayOfMonth : null,
        end_date: endDate || null,
        next_occurrence: calcNextOccurrence(),
        is_active: isActive,
      });
      toast.success("Recorrência salva!");
      setEditing(false);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDelete = async () => {
    if (!recurrence) return;
    try {
      await deleteRecurrence.mutateAsync(recurrence.id);
      toast.success("Recorrência removida!");
      setEditing(false);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const toggleDay = (day: number) => {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  if (!editing && !recurrence) {
    return canEdit ? (
      <Button variant="outline" size="sm" className="w-full h-8 text-xs gap-1" onClick={() => setEditing(true)}>
        <Repeat className="w-3 h-3" /> Configurar recorrência
      </Button>
    ) : null;
  }

  if (!editing && recurrence) {
    return (
      <div className="rounded-lg border border-border p-2.5 text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Repeat className={cn("w-3.5 h-3.5", recurrence.is_active ? "text-primary" : "text-muted-foreground")} />
            <span className="font-medium">{FREQUENCY_OPTIONS.find((f) => f.value === recurrence.frequency)?.label}</span>
          </div>
          {canEdit && (
            <Button variant="ghost" size="sm" className="h-6 text-xs px-1.5" onClick={() => setEditing(true)}>
              Editar
            </Button>
          )}
        </div>
        {recurrence.end_date && (
          <p className="text-muted-foreground mt-1">Até {recurrence.end_date}</p>
        )}
        {!recurrence.is_active && (
          <p className="text-warning mt-1">Pausada</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Repeat className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold">Recorrência</span>
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditing(false)}>
          <X className="w-3 h-3" />
        </Button>
      </div>

      <div>
        <Label className="text-xs">Frequência</Label>
        <Select value={frequency} onValueChange={(v) => setFrequency(v as Frequency)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FREQUENCY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {(frequency === "weekly" || frequency === "specific_days") && (
        <div>
          <Label className="text-xs">
            {frequency === "specific_days" ? "Dias permitidos" : "Dias da semana"}
          </Label>
          <div className="flex gap-1 mt-1">
            {DAYS_OF_WEEK.map((d) => (
              <button
                key={d.value}
                onClick={() => toggleDay(d.value)}
                className={cn(
                  "w-8 h-8 rounded-lg text-xs font-medium transition-colors",
                  daysOfWeek.includes(d.value) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {frequency === "monthly" && (
        <div>
          <Label className="text-xs">Dia do mês</Label>
          <Input type="number" min={1} max={31} value={dayOfMonth} onChange={(e) => setDayOfMonth(Number(e.target.value))} className="h-8 text-xs" />
        </div>
      )}

      {frequency === "custom" && (
        <div>
          <Label className="text-xs">Intervalo (dias)</Label>
          <Input type="number" min={1} value={intervalDays} onChange={(e) => setIntervalDays(Number(e.target.value))} className="h-8 text-xs" />
        </div>
      )}

      <div>
        <Label className="text-xs">Data limite (opcional)</Label>
        <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-8 text-xs" />
      </div>

      <div className="flex items-center gap-2">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-3.5 h-3.5" id="rec-active" />
        <label htmlFor="rec-active" className="text-xs text-muted-foreground">Ativa</label>
      </div>

      <div className="flex gap-2">
        <Button size="sm" className="flex-1 h-7 text-xs" onClick={handleSave} disabled={saveRecurrence.isPending}>
          Salvar
        </Button>
        {recurrence && (
          <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={handleDelete} disabled={deleteRecurrence.isPending}>
            Remover
          </Button>
        )}
      </div>
    </div>
  );
}
