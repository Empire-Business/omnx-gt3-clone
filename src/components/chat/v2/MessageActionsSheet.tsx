/**
 * MessageActionsSheet — action sheet de mensagem para toque (padrão WhatsApp).
 *
 * POR QUE ESTE COMPONENTE EXISTE
 * Em `src/pages/Chat.tsx`, o `MessageRowImpl` expõe todas as ações de mensagem
 * numa barra flutuante `opacity-0 group-hover:opacity-100`. Hover não existe no
 * celular: reagir, responder, copiar, editar, encaminhar, criar tarefa,
 * favoritar, fixar, excluir e "Pergunte a Clara" ficam TODAS inalcançáveis por
 * toque. Este sheet é a mesma lista de ações, servida por um Drawer que sobe de
 * baixo — acionado por long-press no balão (ver `useLongPress`).
 *
 * ESCOPO: este componente NÃO tem lógica de chat. Ele recebe exatamente os
 * mesmos callbacks que o `MessageRowImpl` já recebe do pai e só decide o que
 * mostrar. As condições de exibição são cópia fiel do DropdownMenu "Mais" do
 * Chat.tsx (Editar só se `onEditStart && isMine && !editing`; "Pergunte a
 * Clara" só se `onAskCami`; Excluir só se `onDelete`) — se as duas superfícies
 * divergirem, o mobile passa a oferecer ação que o desktop nega, ou o
 * contrário.
 *
 * DUAS DECISÕES QUE VALE EXPLICAR
 * 1) Excluir usa AlertDialog, não `confirm()`. O Chat.tsx hoje chama o
 *    `confirm()` nativo; no celular isso é um popup do sistema, fora do design
 *    e fora do dark mode. O AlertDialog já é o padrão do projeto.
 * 2) O AlertDialog é irmão do Drawer, não filho. Empilhar dois portais com
 *    focus-trap disputa o foco e trava o teclado/leitor de tela; então ao pedir
 *    exclusão fechamos o sheet e só depois abrimos a confirmação.
 */
import { useState, type ReactNode } from "react";
import {
  MessageSquare, FileText, Settings, ChevronRight, CheckSquare, Star, Pin, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ReactionIcon, REACTIONS } from "@/components/shared/ReactionIcon";
import { CamiAvatar } from "@/components/shared/CamiAvatar";
import { cn } from "@/lib/utils";

export interface MessageActionsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Texto cru da mensagem — usado só pela ação "Copiar". */
  content: string;
  /** Mensagem é do usuário logado (gate de "Editar", igual ao desktop). */
  isMine: boolean;
  /** Linha já está em modo de edição — esconde "Editar". */
  editing?: boolean;

  // ─── Ações: mesma assinatura das props do MessageRowImpl ───
  onReact: (emoji: string) => void;
  onReply?: () => void;
  onEditStart?: () => void;
  onForward?: () => void;
  onAskCami?: () => void;
  onCreateTask?: () => void;
  onStar?: () => void;
  isStarred?: boolean;
  onPin?: () => void;
  onUnpin?: () => void;
  isPinned?: boolean;
  onDelete?: () => void;
}

/**
 * Linha de ação. 48px de altura mínima é o piso de alvo de toque confortável
 * (WCAG 2.5.5 pede 44px; ganhamos folga porque a lista é rolável com o polegar).
 */
function ActionRow({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "w-full min-h-[48px] flex items-center gap-3 px-4 rounded-lg text-left text-sm",
        "transition-colors active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        destructive ? "text-destructive" : "text-foreground",
      )}
    >
      <span className="flex-shrink-0 flex items-center justify-center w-5 h-5">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

export function MessageActionsSheet({
  open,
  onOpenChange,
  content,
  isMine,
  editing,
  onReact,
  onReply,
  onEditStart,
  onForward,
  onAskCami,
  onCreateTask,
  onStar,
  isStarred,
  onPin,
  onUnpin,
  isPinned,
  onDelete,
}: MessageActionsSheetProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  /** Toda ação fecha o sheet: manter aberto depois do toque esconde o efeito
   *  da própria ação (ex.: o campo de resposta que acabou de focar). */
  const run = (fn?: () => void) => () => {
    onOpenChange(false);
    fn?.();
  };

  const handleCopy = () => {
    onOpenChange(false);
    // `clipboard` pode não existir em contexto não-seguro (http). Falhar calado
    // aqui seria pior que avisar: o usuário acha que copiou e cola nada.
    navigator.clipboard
      ?.writeText(content)
      .then(() => toast.success("Copiado"))
      .catch(() => toast.error("Não foi possível copiar"));
  };

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85vh]">
          {/* Título/descrição existem para leitor de tela — o sheet é visual,
              mas o Drawer (Radix por baixo) exige rótulo acessível. */}
          <DrawerHeader className="sr-only">
            <DrawerTitle>Ações da mensagem</DrawerTitle>
            <DrawerDescription>Escolha uma ação para esta mensagem.</DrawerDescription>
          </DrawerHeader>

          {/* Fileira de reações rápidas — mesmos emojis do desktop (REACTIONS),
              com alvo de 44px para o polegar. */}
          <div className="flex items-center justify-around gap-1 px-4 pt-3 pb-2 border-b border-border">
            {REACTIONS.map((r) => (
              <button
                key={r.key}
                type="button"
                aria-label={`Reagir: ${r.label}`}
                onClick={() => {
                  onOpenChange(false);
                  onReact(r.key);
                }}
                className="w-11 h-11 rounded-full flex items-center justify-center transition-transform active:scale-90 active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ReactionIcon emoji={r.key} size={24} />
              </button>
            ))}
          </div>

          {/* Lista de ações — espelha o DropdownMenu "Mais" do Chat.tsx, na
              mesma ordem e com os mesmos rótulos. */}
          <div
            className="flex flex-col gap-0.5 p-2 overflow-y-auto pb-[max(0.5rem,env(safe-area-inset-bottom))]"
            role="menu"
            aria-label="Ações da mensagem"
          >
            <ActionRow
              icon={<MessageSquare className="w-4 h-4" />}
              label="Responder"
              onClick={run(onReply)}
            />
            <ActionRow
              icon={<FileText className="w-4 h-4" />}
              label="Copiar"
              onClick={handleCopy}
            />
            {onEditStart && isMine && !editing && (
              <ActionRow
                icon={<Settings className="w-4 h-4" />}
                label="Editar"
                onClick={run(onEditStart)}
              />
            )}
            <ActionRow
              icon={<ChevronRight className="w-4 h-4" />}
              label="Encaminhar"
              onClick={run(onForward)}
            />
            {onAskCami && (
              <ActionRow
                icon={<CamiAvatar className="w-4 h-4 text-primary" />}
                label="Pergunte a Clara"
                onClick={run(onAskCami)}
              />
            )}
            <ActionRow
              icon={<CheckSquare className="w-4 h-4" />}
              label="Criar tarefa"
              onClick={run(onCreateTask)}
            />
            <ActionRow
              icon={
                // Favorito ativo usa o token `warning` (mesma cor de destaque
                // do DS) em vez do `amber-500` hardcoded que o Chat.tsx herdou.
                <Star className={cn("w-4 h-4", isStarred && "fill-warning text-warning")} />
              }
              label={isStarred ? "Desfavoritar" : "Favoritar"}
              onClick={run(onStar)}
            />
            <ActionRow
              icon={<Pin className="w-4 h-4" />}
              label={isPinned ? "Desafixar" : "Fixar"}
              onClick={run(isPinned ? onUnpin : onPin)}
            />

            {onDelete && (
              <>
                <div className="h-px bg-border my-1 mx-2" />
                <ActionRow
                  icon={<Trash2 className="w-4 h-4" />}
                  label="Excluir"
                  destructive
                  onClick={() => {
                    onOpenChange(false);
                    setConfirmDelete(true);
                  }}
                />
              </>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Confirmação de exclusão — fora do Drawer, por focus-trap (ver topo). */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta mensagem?</AlertDialogTitle>
            <AlertDialogDescription>
              A mensagem será removida da conversa para todos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => onDelete?.()}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
