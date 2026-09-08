/**
 * EventRegistrationDialog — o colaborador confirma presença e responde
 * a ficha de inscrição definida no evento.
 *
 * A submissão é delegada ao componente pai (que já detém a mutation vinda de
 * `useEventRegistrations`), para não duplicar o hook.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  EventRegistrationAnswers,
  InternalEvent,
  parseRegistrationForm,
} from "./events-api";

interface Props {
  event: InternalEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (answers: EventRegistrationAnswers) => Promise<void>;
  isPending: boolean;
}

export function EventRegistrationDialog({
  event,
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: Props) {
  const [answers, setAnswers] = useState<EventRegistrationAnswers>({});
  /**
   * Campos numéricos guardam o TEXTO cru digitado, não o número. Um input
   * controlado por número mata todo estado intermediário: ao digitar o ponto
   * decimal (ou o sinal de menos) o navegador reporta valor vazio, o estado
   * gravaria null e o que já foi digitado sumiria da tela. A conversão para
   * número acontece só no envio.
   */
  const [numberDrafts, setNumberDrafts] = useState<Record<string, string>>({});
  const [invalidFieldId, setInvalidFieldId] = useState<string | null>(null);

  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});
  const registerField = useCallback(
    (id: string) => (node: HTMLElement | null) => {
      fieldRefs.current[id] = node;
    },
    [],
  );

  const fields = useMemo(
    () => (event ? parseRegistrationForm(event.registration_form).fields : []),
    [event],
  );

  const eventId = event?.id;
  useEffect(() => {
    if (open) {
      setAnswers({});
      setNumberDrafts({});
      setInvalidFieldId(null);
    }
  }, [open, eventId]);

  if (!event) return null;

  const setAnswer = (id: string, value: string | number | boolean | null) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    setInvalidFieldId((prev) => (prev === id ? null : prev));
  };

  const setNumberDraft = (id: string, text: string) => {
    setNumberDrafts((prev) => ({ ...prev, [id]: text }));
    setInvalidFieldId((prev) => (prev === id ? null : prev));
  };

  /** Marca o campo culpado e leva o foco até ele — toast sozinho não basta. */
  const reportProblem = (fieldId: string, message: string) => {
    setInvalidFieldId(fieldId);
    toast.error(message);
    // O foco só depois do render que aplica o aria-invalid.
    requestAnimationFrame(() => fieldRefs.current[fieldId]?.focus());
  };

  const handleSubmit = async () => {
    const payload: EventRegistrationAnswers = { ...answers };

    for (const field of fields) {
      if (field.type === "number") {
        const draft = (numberDrafts[field.id] ?? "").trim();
        if (draft === "") {
          payload[field.id] = null;
        } else {
          const parsed = Number(draft);
          if (Number.isNaN(parsed)) {
            reportProblem(
              field.id,
              `"${field.label}" precisa ser um número. Corrija o valor digitado.`,
            );
            return;
          }
          payload[field.id] = parsed;
        }
      }

      if (field.required !== true) continue;

      const value = payload[field.id];
      const empty =
        field.type === "checkbox"
          ? value !== true
          : value === undefined || value === null || String(value).trim() === "";

      if (empty) {
        reportProblem(
          field.id,
          field.type === "checkbox"
            ? `Marque "${field.label}" para continuar.`
            : `Responda: ${field.label}`,
        );
        return;
      }
    }

    try {
      await onSubmit(payload);
      onOpenChange(false);
    } catch {
      // erro já reportado pelo hook (toast)
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-[18px] font-semibold tracking-tight">
            Inscrição — {event.title}
          </DialogTitle>
          <DialogDescription>
            {fields.length > 0
              ? "Responda a ficha para confirmar sua participação."
              : "Confirme sua participação neste evento."}
          </DialogDescription>
        </DialogHeader>

        {fields.length > 0 && (
          <ScrollArea className="max-h-[50vh] pr-3">
            <div className="space-y-5 py-1">
              {fields.map((field) => {
                const value = answers[field.id];
                const required = field.required === true;
                const invalid = invalidFieldId === field.id;
                const controlId = `answer-${field.id}`;
                const labelId = `answer-label-${field.id}`;
                const invalidClass = invalid
                  ? "border-destructive focus-visible:ring-destructive"
                  : undefined;

                return (
                  <div key={field.id} className="space-y-2">
                    <Label
                      id={labelId}
                      // Escolha única não tem um único controle para apontar:
                      // o grupo é rotulado por aria-labelledby logo abaixo.
                      htmlFor={field.type === "select" ? undefined : controlId}
                    >
                      {field.label}
                      {required && (
                        <>
                          <span className="text-destructive ml-0.5" aria-hidden="true">
                            *
                          </span>
                          <span className="sr-only"> (obrigatório)</span>
                        </>
                      )}
                    </Label>

                    {field.type === "text" && (
                      <Input
                        id={controlId}
                        ref={registerField(field.id)}
                        value={typeof value === "string" ? value : ""}
                        placeholder={field.placeholder}
                        disabled={isPending}
                        aria-required={required}
                        aria-invalid={invalid}
                        className={invalidClass}
                        onChange={(e) => setAnswer(field.id, e.target.value)}
                      />
                    )}

                    {field.type === "textarea" && (
                      <Textarea
                        id={controlId}
                        ref={registerField(field.id)}
                        value={typeof value === "string" ? value : ""}
                        placeholder={field.placeholder}
                        rows={3}
                        className={cn("resize-none", invalidClass)}
                        disabled={isPending}
                        aria-required={required}
                        aria-invalid={invalid}
                        onChange={(e) => setAnswer(field.id, e.target.value)}
                      />
                    )}

                    {field.type === "number" && (
                      <Input
                        id={controlId}
                        ref={registerField(field.id)}
                        type="number"
                        inputMode="decimal"
                        value={numberDrafts[field.id] ?? ""}
                        disabled={isPending}
                        aria-required={required}
                        aria-invalid={invalid}
                        className={invalidClass}
                        onChange={(e) => setNumberDraft(field.id, e.target.value)}
                      />
                    )}

                    {field.type === "date" && (
                      <Input
                        id={controlId}
                        ref={registerField(field.id)}
                        type="date"
                        value={typeof value === "string" ? value : ""}
                        disabled={isPending}
                        aria-required={required}
                        aria-invalid={invalid}
                        className={invalidClass}
                        onChange={(e) => setAnswer(field.id, e.target.value)}
                      />
                    )}

                    {field.type === "select" && (
                      <RadioGroup
                        role="radiogroup"
                        aria-labelledby={labelId}
                        aria-required={required}
                        aria-invalid={invalid}
                        value={typeof value === "string" ? value : ""}
                        disabled={isPending}
                        onValueChange={(v) => setAnswer(field.id, v)}
                        className={cn(
                          invalid && "rounded-md border border-destructive p-2",
                        )}
                      >
                        {(field.options ?? []).map((opt, optionIndex) => {
                          // Chave e id vêm do ÍNDICE, nunca do texto: duas
                          // opções com o mesmo texto gerariam ids duplicados e
                          // clicar no segundo rótulo marcaria o primeiro.
                          const optionId = `${controlId}-opt-${optionIndex}`;
                          return (
                            <div key={optionId} className="flex items-center gap-2">
                              <RadioGroupItem
                                value={opt}
                                id={optionId}
                                ref={optionIndex === 0 ? registerField(field.id) : undefined}
                              />
                              <Label htmlFor={optionId} className="font-normal cursor-pointer">
                                {opt}
                              </Label>
                            </div>
                          );
                        })}
                      </RadioGroup>
                    )}

                    {field.type === "checkbox" && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={controlId}
                          ref={registerField(field.id)}
                          checked={value === true}
                          disabled={isPending}
                          aria-required={required}
                          aria-invalid={invalid}
                          className={invalid ? "border-destructive" : undefined}
                          onCheckedChange={(checked) => setAnswer(field.id, checked === true)}
                        />
                        <Label htmlFor={controlId} className="font-normal cursor-pointer">
                          Sim
                        </Label>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Confirmar inscrição
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
