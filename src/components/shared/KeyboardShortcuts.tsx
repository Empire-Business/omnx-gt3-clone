import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[]; description: string }[];
}

const SHORTCUTS: ShortcutGroup[] = [
  {
    title: "Geral",
    shortcuts: [
      { keys: ["⌘", "K"], description: "Busca global" },
      { keys: ["?"], description: "Atalhos de teclado" },
    ],
  },
  {
    title: "Navegação",
    shortcuts: [
      { keys: ["G", "D"], description: "Ir para Dashboard" },
      { keys: ["G", "O"], description: "Ir para Organograma" },
      { keys: ["G", "C"], description: "Ir para Colaboradores" },
      { keys: ["G", "P"], description: "Ir para Projetos" },
      { keys: ["G", "R"], description: "Ir para Processos" },
      { keys: ["G", "T"], description: "Ir para Tarefas" },
    ],
  },
];

export function KeyboardShortcutsDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let lastKey = "";
    let lastKeyTime = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      const now = Date.now();

      // ? key opens help
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }

      // G + key navigation shortcuts
      if (e.key.toLowerCase() === "g" && !e.metaKey && !e.ctrlKey) {
        lastKey = "g";
        lastKeyTime = now;
        return;
      }

      if (lastKey === "g" && now - lastKeyTime < 500) {
        const nav = getNavTarget(e.key.toLowerCase());
        if (nav) {
          e.preventDefault();
          window.location.hash = "";
          // Use pushState to navigate without full reload
          window.dispatchEvent(new CustomEvent("keyboard-navigate", { detail: nav }));
        }
        lastKey = "";
        return;
      }

      lastKey = "";
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Atalhos de Teclado</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 mt-2">
          {SHORTCUTS.map((group) => (
            <div key={group.title}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{group.title}</p>
              <div className="flex flex-col gap-1.5">
                {group.shortcuts.map((s) => (
                  <div key={s.description} className="flex items-center justify-between">
                    <span className="text-sm text-foreground">{s.description}</span>
                    <div className="flex items-center gap-1">
                      {s.keys.map((k, i) => (
                        <span key={i}>
                          <kbd className="px-1.5 py-0.5 text-xs font-mono bg-muted border border-border rounded">{k}</kbd>
                          {i < s.keys.length - 1 && <span className="text-muted-foreground mx-0.5">+</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <Separator className="mt-3" />
            </div>
          ))}
          <p className="text-xs text-muted-foreground text-center">
            Pressione <kbd className="px-1 py-0.5 text-xs font-mono bg-muted border border-border rounded">?</kbd> para abrir/fechar
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getNavTarget(key: string): string | null {
  const map: Record<string, string> = {
    d: "/dashboard",
    o: "/organograma",
    c: "/colaboradores",
    p: "/projetos",
    r: "/processos",
    t: "/tarefas",
    s: "/configuracoes",
    f: "/faq",
  };
  return map[key] || null;
}
