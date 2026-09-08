/**
 * RegistrationFormBuilder — construtor simples da ficha de inscrição.
 * O resultado é gravado em `internal_events.registration_form` (jsonb) no
 * formato `{ fields: [...] }` esperado por `useInternalEvents`.
 */
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, ArrowUp, ArrowDown, X } from "lucide-react";
import {
  FIELD_TYPES,
  FIELD_TYPE_LABELS,
  InternalEventFieldType,
  InternalEventForm,
  InternalEventFormField,
  isChoiceField,
} from "./events-api";

interface Props {
  value: InternalEventForm;
  onChange: (form: InternalEventForm) => void;
  disabled?: boolean;
}

function newField(): InternalEventFormField {
  return {
    id: crypto.randomUUID(),
    label: "",
    type: "text",
    required: false,
  };
}

export function RegistrationFormBuilder({ value, onChange, disabled }: Props) {
  const fields = value.fields;

  const update = (index: number, patch: Partial<InternalEventFormField>) => {
    onChange({ fields: fields.map((f, i) => (i === index ? { ...f, ...patch } : f)) });
  };

  const remove = (index: number) => {
    onChange({ fields: fields.filter((_, i) => i !== index) });
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    const tmp = next[index];
    next[index] = next[target];
    next[target] = tmp;
    onChange({ fields: next });
  };

  const changeType = (index: number, type: InternalEventFieldType) => {
    const field = fields[index];
    if (field.type === type) return;
    update(index, {
      // Trocar o tipo gera um id NOVO de propósito: as respostas já gravadas
      // são indexadas pelo id do campo. Mantendo o id, um texto respondido
      // ("Não posso comer glúten") passaria a ser lido sob o novo tipo e
      // apareceria como "Sim" — uma afirmação que ninguém fez. Com id novo, a
      // resposta antiga fica órfã e é exibida como resposta de formato antigo,
      // em vez de reinterpretada.
      id: crypto.randomUUID(),
      type,
      options: isChoiceField(type) ? field.options ?? ["Opção 1"] : undefined,
    });
  };

  const setOption = (index: number, optionIndex: number, text: string) => {
    const options = [...(fields[index].options ?? [])];
    options[optionIndex] = text;
    update(index, { options });
  };

  const addOption = (index: number) => {
    const options = [...(fields[index].options ?? [])];
    update(index, { options: [...options, "Opção " + (options.length + 1)] });
  };

  const removeOption = (index: number, optionIndex: number) => {
    update(index, {
      options: (fields[index].options ?? []).filter((_, i) => i !== optionIndex),
    });
  };

  return (
    <div className="space-y-3">
      {fields.length === 0 && (
        <p className="text-xs text-muted-foreground rounded-md border border-dashed border-border px-3 py-4 text-center">
          Nenhuma pergunta ainda. A ficha pode ser apenas uma confirmação de presença,
          ou você pode adicionar perguntas abaixo.
        </p>
      )}

      {fields.map((field, index) => (
        <div key={field.id} className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
          <div className="flex items-start gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor={`field-label-${field.id}`} className="text-xs">
                Pergunta {index + 1}
              </Label>
              <Input
                id={`field-label-${field.id}`}
                value={field.label}
                disabled={disabled}
                placeholder="Ex: Qual sua restrição alimentar?"
                onChange={(e) => update(index, { label: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-1 pt-6">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={disabled || index === 0}
                onClick={() => move(index, -1)}
                aria-label={`Mover pergunta ${index + 1} para cima`}
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={disabled || index === fields.length - 1}
                onClick={() => move(index, 1)}
                aria-label={`Mover pergunta ${index + 1} para baixo`}
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                disabled={disabled}
                onClick={() => remove(index)}
                aria-label={`Remover pergunta ${index + 1}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[180px] space-y-1.5">
              <Label className="text-xs">Tipo de resposta</Label>
              <Select
                value={field.type}
                disabled={disabled}
                onValueChange={(v) => changeType(index, v as InternalEventFieldType)}
              >
                <SelectTrigger aria-label={`Tipo da pergunta ${index + 1}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {FIELD_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Switch
                id={`field-required-${field.id}`}
                checked={field.required === true}
                disabled={disabled}
                onCheckedChange={(checked) => update(index, { required: checked })}
              />
              <Label htmlFor={`field-required-${field.id}`} className="text-xs cursor-pointer">
                Obrigatória
              </Label>
            </div>
          </div>

          {isChoiceField(field.type) && (
            <div className="space-y-2">
              <Label className="text-xs">Opções</Label>
              {(field.options ?? []).map((opt, optionIndex) => {
                const options = field.options ?? [];
                const normalized = opt.trim().toLowerCase();
                const isEmpty = !opt.trim();
                // Repetida só marca a partir da 2ª ocorrência — a 1ª é a válida.
                const isDuplicate =
                  !isEmpty &&
                  options.findIndex((o) => o.trim().toLowerCase() === normalized) !== optionIndex;
                const invalid = isEmpty || isDuplicate;
                return (
                <div key={`${field.id}-${optionIndex}`} className="flex items-start gap-2">
                  <div className="flex-1 space-y-1">
                  <Input
                    value={opt}
                    disabled={disabled}
                    onChange={(e) => setOption(index, optionIndex, e.target.value)}
                    aria-label={`Opção ${optionIndex + 1} da pergunta ${index + 1}`}
                    aria-invalid={invalid}
                    className={invalid ? "border-destructive focus-visible:ring-destructive" : undefined}
                  />
                  {invalid && (
                    <p className="text-[11px] text-destructive">
                      {isEmpty
                        ? "Escreva o texto da opção ou remova-a."
                        : "Esta opção está repetida. Cada opção precisa ser diferente."}
                    </p>
                  )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    disabled={disabled || (field.options ?? []).length <= 1}
                    onClick={() => removeOption(index, optionIndex)}
                    aria-label={`Remover opção ${optionIndex + 1}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
                );
              })}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() => addOption(index)}
                className="gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar opção
              </Button>
            </div>
          )}
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => onChange({ fields: [...fields, newField()] })}
        className="gap-1.5"
      >
        <Plus className="w-4 h-4" />
        Adicionar pergunta
      </Button>
    </div>
  );
}
