/**
 * EventFormSheet — criação e edição de um evento interno.
 * Segue o padrão de Sheet lateral usado em Reuniões.
 *
 * As mutations chegam por prop: a página faz UMA chamada de
 * `useInternalEvents()` e distribui — nunca dois estados do mesmo hook.
 */
import { useEffect, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Loader2, ImageIcon, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type {
  InternalEventInput,
  InternalEventUpdateInput,
} from "@/hooks/useInternalEvents";
import {
  InternalEvent,
  InternalEventForm,
  InternalEventScope,
  MAX_EVENT_YEAR,
  MIN_EVENT_YEAR,
  MutationLike,
  fromDateTimeLocal,
  isEventDateInRange,
  isHttpsUrl,
  parseRegistrationForm,
  toDateTimeLocal,
  validateRegistrationForm,
} from "./events-api";
import { EventScopeSelector } from "./EventScopeSelector";
import { RegistrationFormBuilder } from "./RegistrationFormBuilder";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quando presente, o sheet edita este evento; caso contrário cria um novo. */
  event?: InternalEvent | null;
  createEvent: MutationLike<InternalEventInput, InternalEvent>;
  updateEvent: MutationLike<{ id: string; updates: InternalEventUpdateInput }, InternalEvent>;
  onSaved?: () => void;
}

interface FormState {
  title: string;
  description: string;
  cover_url: string;
  starts_at: string;
  ends_at: string;
  scope: InternalEventScope;
  registration_required: boolean;
  registration_form: InternalEventForm;
  area_ids: string[];
  employee_ids: string[];
}

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  cover_url: "",
  starts_at: "",
  ends_at: "",
  scope: "company",
  registration_required: false,
  registration_form: { fields: [] },
  area_ids: [],
  employee_ids: [],
};

function fromEvent(event: InternalEvent): FormState {
  const targets = event.targets ?? [];
  return {
    title: event.title,
    description: event.description ?? "",
    cover_url: event.cover_url ?? "",
    starts_at: toDateTimeLocal(event.starts_at),
    ends_at: toDateTimeLocal(event.ends_at),
    scope: event.scope,
    registration_required: event.registration_required,
    registration_form: parseRegistrationForm(event.registration_form),
    area_ids: targets.map((t) => t.area_id).filter((id): id is string => !!id),
    employee_ids: targets.map((t) => t.employee_id).filter((id): id is string => !!id),
  };
}

/** Confirmação pendente antes de concluir uma ação destrutiva. */
type PendingConfirm = "discard" | "disable-registration" | null;

export function EventFormSheet({
  open,
  onOpenChange,
  event,
  createEvent,
  updateEvent,
  onSaved,
}: Props) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [coverError, setCoverError] = useState(false);
  const [confirm, setConfirm] = useState<PendingConfirm>(null);
  const isEditing = !!event;
  const saving = createEvent.isPending || updateEvent.isPending;

  /** Snapshot do estado inicial — base para detectar alterações não salvas. */
  const initialSnapshot = useRef<string>(JSON.stringify(EMPTY_FORM));
  /** A ficha já tinha perguntas quando o sheet abriu (respostas podem existir). */
  const hadSavedFields = useRef(false);

  useEffect(() => {
    if (!open) return;
    const next = event ? fromEvent(event) : EMPTY_FORM;
    setForm(next);
    setCoverError(false);
    setConfirm(null);
    initialSnapshot.current = JSON.stringify(next);
    hadSavedFields.current = next.registration_form.fields.length > 0;
  }, [open, event]);

  const patch = (updates: Partial<FormState>) => setForm((prev) => ({ ...prev, ...updates }));

  const isDirty = JSON.stringify(form) !== initialSnapshot.current;

  /**
   * Desligar a ficha num evento que já tem perguntas não apaga nada (as
   * perguntas continuam gravadas), mas some com o formulário para quem ainda
   * não se inscreveu — vale avisar antes.
   */
  const disablingRegistration =
    isEditing && hadSavedFields.current && !form.registration_required;

  const save = async () => {
    const startsAt = fromDateTimeLocal(form.starts_at);
    if (!startsAt) {
      toast.error("Informe a data e hora de início");
      return;
    }
    const endsAt = fromDateTimeLocal(form.ends_at);

    const payload: InternalEventInput = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      cover_url: form.cover_url.trim() || null,
      starts_at: startsAt,
      ends_at: endsAt,
      scope: form.scope,
      registration_required: form.registration_required,
      // NUNCA gravar null por causa do switch: quem liga e desliga o
      // comportamento é `registration_required`. Zerar a ficha aqui apagaria as
      // perguntas de um evento que já tem inscritos, deixando as respostas
      // gravadas ilegíveis. Só fica null quando não existe pergunta alguma.
      registration_form:
        form.registration_form.fields.length > 0 ? form.registration_form : null,
      area_ids: form.scope === "areas" ? form.area_ids : [],
      employee_ids: form.scope === "custom" ? form.employee_ids : [],
    };

    try {
      if (isEditing && event) {
        await updateEvent.mutateAsync({ id: event.id, updates: payload });
      } else {
        await createEvent.mutateAsync(payload);
      }
      initialSnapshot.current = JSON.stringify(form);
      onOpenChange(false);
      onSaved?.();
    } catch {
      // erro já reportado pelo hook (toast)
    }
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      toast.error("O título é obrigatório");
      return;
    }
    const startsAt = fromDateTimeLocal(form.starts_at);
    if (!startsAt) {
      toast.error("Informe a data e hora de início");
      return;
    }
    if (!isEventDateInRange(startsAt)) {
      toast.error(
        `A data de início precisa estar entre ${MIN_EVENT_YEAR} e ${MAX_EVENT_YEAR}. Confira o ano digitado.`,
      );
      return;
    }
    const endsAt = fromDateTimeLocal(form.ends_at);
    if (endsAt && !isEventDateInRange(endsAt)) {
      toast.error(
        `A data de término precisa estar entre ${MIN_EVENT_YEAR} e ${MAX_EVENT_YEAR}. Confira o ano digitado.`,
      );
      return;
    }
    if (endsAt && new Date(endsAt) <= new Date(startsAt)) {
      toast.error("O término precisa ser depois do início");
      return;
    }
    const cover = form.cover_url.trim();
    if (cover && !isHttpsUrl(cover)) {
      toast.error("A capa precisa ser um endereço https:// de imagem. Confira o link.");
      return;
    }
    if (form.scope === "areas" && form.area_ids.length === 0) {
      toast.error("Selecione ao menos um setor");
      return;
    }
    if (form.scope === "custom" && form.employee_ids.length === 0) {
      toast.error("Selecione ao menos um colaborador");
      return;
    }
    if (form.registration_required) {
      const problem = validateRegistrationForm(form.registration_form);
      if (problem) {
        toast.error(problem);
        return;
      }
    }

    if (disablingRegistration) {
      setConfirm("disable-registration");
      return;
    }

    await save();
  };

  /** Fechar por Esc, clique fora ou "Cancelar" — nunca em silêncio. */
  const requestClose = (next: boolean) => {
    if (next) {
      onOpenChange(true);
      return;
    }
    if (saving) return;
    if (isDirty) {
      setConfirm("discard");
      return;
    }
    onOpenChange(false);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={requestClose}>
        <SheetContent
          side="right"
          className="!w-full sm:!w-[560px] sm:!max-w-[560px] p-0 gap-0 flex flex-col h-full overflow-hidden border-l shadow-2xl"
        >
          <SheetHeader className="px-6 py-5 border-b border-border bg-card">
            <SheetTitle className="text-[20px] font-semibold tracking-tight text-foreground">
              {isEditing ? "Editar evento" : "Novo evento interno"}
            </SheetTitle>
            <SheetDescription className="text-[13px] text-muted-foreground">
              Defina quando acontece, quem participa e se haverá ficha de inscrição.
              {!isEditing && " O evento é salvo como rascunho — publicar é um passo seguinte."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="event-title">Título *</Label>
              <Input
                id="event-title"
                value={form.title}
                disabled={saving}
                onChange={(e) => patch({ title: e.target.value })}
                placeholder="Ex: Confraternização de fim de ano"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="event-description">Descrição</Label>
              <Textarea
                id="event-description"
                value={form.description}
                disabled={saving}
                onChange={(e) => patch({ description: e.target.value })}
                placeholder="O que vai acontecer, onde, o que levar…"
                rows={4}
                className="resize-none"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="event-start">Início *</Label>
                <Input
                  id="event-start"
                  type="datetime-local"
                  min={`${MIN_EVENT_YEAR}-01-01T00:00`}
                  max={`${MAX_EVENT_YEAR}-12-31T23:59`}
                  value={form.starts_at}
                  disabled={saving}
                  onChange={(e) => patch({ starts_at: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-end">Término</Label>
                <Input
                  id="event-end"
                  type="datetime-local"
                  min={`${MIN_EVENT_YEAR}-01-01T00:00`}
                  max={`${MAX_EVENT_YEAR}-12-31T23:59`}
                  value={form.ends_at}
                  disabled={saving}
                  onChange={(e) => patch({ ends_at: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="event-cover" className="flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5" aria-hidden="true" />
                Capa (URL da imagem)
              </Label>
              <Input
                id="event-cover"
                type="url"
                inputMode="url"
                value={form.cover_url}
                disabled={saving}
                onChange={(e) => {
                  setCoverError(false);
                  patch({ cover_url: e.target.value });
                }}
                placeholder="https://…"
              />
              {form.cover_url.trim() && !isHttpsUrl(form.cover_url.trim()) && (
                <p className="text-xs text-destructive">
                  Use um endereço completo começando com https://
                </p>
              )}
              {form.cover_url.trim() && isHttpsUrl(form.cover_url.trim()) && (
                <div className="h-28 w-full overflow-hidden rounded-md border border-border bg-muted">
                  {coverError ? (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-3 text-center">
                      <AlertTriangle
                        className="w-4 h-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <p className="text-xs text-muted-foreground">
                        Não foi possível carregar esta imagem. Confira se o link aponta
                        para um arquivo de imagem público.
                      </p>
                    </div>
                  ) : (
                    <img
                      src={form.cover_url.trim()}
                      alt="Pré-visualização da capa do evento"
                      className="h-full w-full object-cover"
                      onError={() => setCoverError(true)}
                    />
                  )}
                </div>
              )}
            </div>

            <Separator />

            <EventScopeSelector
              scope={form.scope}
              areaIds={form.area_ids}
              employeeIds={form.employee_ids}
              onScopeChange={(scope) => patch({ scope })}
              onAreaIdsChange={(area_ids) => patch({ area_ids })}
              onEmployeeIdsChange={(employee_ids) => patch({ employee_ids })}
              disabled={saving}
            />

            <Separator />

            <div className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label htmlFor="event-registration" className="cursor-pointer">
                    Ficha de inscrição
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Exige que o colaborador confirme presença — e responda o que você perguntar.
                  </p>
                </div>
                <Switch
                  id="event-registration"
                  checked={form.registration_required}
                  disabled={saving}
                  onCheckedChange={(checked) => patch({ registration_required: checked })}
                />
              </div>

              {disablingRegistration && (
                <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3">
                  <AlertTriangle
                    className="w-4 h-4 shrink-0 text-muted-foreground mt-0.5"
                    aria-hidden="true"
                  />
                  <p className="text-xs text-muted-foreground">
                    As perguntas continuam guardadas e voltam se você religar a ficha, mas
                    ao salvar o formulário deixa de ser exigido e ninguém mais poderá se
                    inscrever neste evento.
                  </p>
                </div>
              )}

              {form.registration_required && (
                <RegistrationFormBuilder
                  value={form.registration_form}
                  onChange={(registration_form) => patch({ registration_form })}
                  disabled={saving}
                />
              )}
            </div>
          </div>

          <div className="border-t border-border bg-card px-6 py-4 flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => requestClose(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEditing ? "Salvar alterações" : "Salvar como rascunho"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "discard"
                ? "Descartar as alterações?"
                : "Desativar a ficha de inscrição?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "discard"
                ? "Você fez alterações que ainda não foram salvas. Se fechar agora, elas serão perdidas."
                : "As perguntas continuam guardadas e voltam se você religar a ficha. Mas, ao salvar, o formulário deixa de ser exigido e ninguém mais poderá se inscrever neste evento."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {confirm === "discard" ? "Continuar editando" : "Voltar"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const action = confirm;
                setConfirm(null);
                if (action === "discard") {
                  onOpenChange(false);
                } else if (action === "disable-registration") {
                  void save();
                }
              }}
            >
              {confirm === "discard" ? "Descartar" : "Desativar e salvar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
