/**
 * ComposerAttachMenu — menu de ações do clipe, no padrão WhatsApp/Telegram.
 *
 * POR QUE ESTE COMPONENTE EXISTE
 * O composer do `Chat.tsx` expunha SETE botões numa barra fixa abaixo do campo
 * (arquivo, imagem, enquete, tarefa, reunião, Clara, emoji) mais o mic e o
 * enviar. Isso rouba uma linha inteira de altura em toda conversa, e no celular
 * espreme nove alvos de toque numa faixa onde nenhum fica confortável. Os
 * mensageiros resolvem isso há anos: uma linha só — clipe, emoji, campo e um
 * botão à direita — e as ações de criação vivem atrás do clipe.
 *
 * DUAS SUPERFÍCIES, UM CONTEÚDO
 * Drawer que sobe de baixo no celular (mesma escolha do `MessageActionsSheet`,
 * onde o polegar alcança) e Popover ancorado no clipe no desktop, onde um
 * drawer de tela cheia para escolher "imagem" seria desproporcional. A lista de
 * ações é a mesma nos dois — se divergirem, uma plataforma passa a oferecer o
 * que a outra nega.
 *
 * O componente NÃO tem lógica de chat: recebe os mesmos callbacks que os botões
 * antigos disparavam e só decide o que mostrar.
 */
import { type ComponentType } from "react";
import { Paperclip, Image as ImageIcon, BarChart3, CheckSquare, Video } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CamiAvatar } from "@/components/shared/CamiAvatar";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export interface ComposerAttachMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** O botão do clipe. Vira o gatilho do Popover no desktop. */
  trigger: React.ReactNode;
  onFile: () => void;
  onImage: () => void;
  /** Enquete só existe fora de DM — omitir esconde o item. */
  onPoll?: () => void;
  onTask: () => void;
  onMeeting: () => void;
  /** Clara só aparece com IA habilitada no tenant. */
  onClara?: () => void;
}

interface Action {
  key: string;
  label: string;
  hint: string;
  Icon: ComponentType<{ className?: string }>;
  /** Par de classes [fundo, ícone] — tokens semânticos, nunca cor crua. */
  tone: [string, string];
  run: () => void;
}

export function ComposerAttachMenu({
  open, onOpenChange, trigger, onFile, onImage, onPoll, onTask, onMeeting, onClara,
}: ComposerAttachMenuProps) {
  const isMobile = useIsMobile();

  // Fecha antes de executar: a ação abre diálogo próprio (tarefa, reunião,
  // enquete) ou o seletor de arquivo do sistema, e dois portais com focus-trap
  // empilhados disputam o foco — o mesmo cuidado do MessageActionsSheet.
  const pick = (fn: () => void) => () => { onOpenChange(false); setTimeout(fn, 0); };

  const actions: Action[] = [
    { key: "file",  label: "Arquivo",  hint: "Documento, PDF, planilha",
      Icon: Paperclip,   tone: ["bg-primary/10", "text-primary"],   run: pick(onFile) },
    { key: "image", label: "Imagem",   hint: "Foto ou vídeo",
      Icon: ImageIcon,   tone: ["bg-info/10", "text-info"],         run: pick(onImage) },
    ...(onPoll ? [{ key: "poll", label: "Enquete", hint: "Perguntar ao grupo",
      Icon: BarChart3,   tone: ["bg-warning/10", "text-warning"] as [string, string], run: pick(onPoll) }] : []),
    { key: "task",  label: "Tarefa",   hint: "Atribuir e acompanhar",
      Icon: CheckSquare, tone: ["bg-success/10", "text-success"],   run: pick(onTask) },
    { key: "meet",  label: "Reunião",  hint: "Agora ou agendada",
      Icon: Video,       tone: ["bg-destructive/10", "text-destructive"], run: pick(onMeeting) },
    ...(onClara ? [{ key: "clara", label: "Pergunte a Clara", hint: "Assistente de IA",
      Icon: CamiAvatar,  tone: ["bg-primary/10", "text-primary"] as [string, string], run: pick(onClara) }] : []),
  ];

  const grid = (
    <div className="grid grid-cols-3 gap-1 p-2">
      {actions.map(({ key, label, hint, Icon, tone, run }) => (
        <button
          key={key}
          onClick={run}
          className={cn(
            "group flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center",
            "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "transition-colors"
          )}
        >
          <span className={cn(
            "flex h-11 w-11 items-center justify-center rounded-full transition-transform",
            "group-hover:scale-105 group-active:scale-95", tone[0]
          )}>
            <Icon className={cn("h-5 w-5", tone[1])} />
          </span>
          <span className="text-2xs font-medium leading-tight text-foreground">{label}</span>
          <span className="text-[10px] leading-tight text-muted-foreground hidden sm:block">{hint}</span>
        </button>
      ))}
    </div>
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        <Drawer open={open} onOpenChange={onOpenChange}>
          <DrawerContent>
            <DrawerHeader className="pb-1">
              <DrawerTitle className="text-sm">Adicionar à conversa</DrawerTitle>
            </DrawerHeader>
            <div className="pb-[calc(1rem+env(safe-area-inset-bottom))]">{grid}</div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={10}
        className="w-[340px] rounded-2xl border-border p-0 shadow-xl"
      >
        <p className="px-4 pt-3 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          Adicionar à conversa
        </p>
        {grid}
      </PopoverContent>
    </Popover>
  );
}
