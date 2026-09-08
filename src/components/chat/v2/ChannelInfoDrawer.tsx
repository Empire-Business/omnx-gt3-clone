import { useMemo, useState } from "react";
import {
  Search,
  Users,
  Plus,
  X,
  Settings,
  ImageIcon,
  Trash2,
  BellOff,
  Bell,
  FileText,
  ChevronRight,
  Star,
  Link2,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AvatarBadge } from "@/components/shared/SharedComponents";
import { cn } from "@/lib/utils";

/**
 * ChannelInfoDrawer — o "Dados do grupo" do mobile.
 *
 * PORQUÊ ESTE COMPONENTE EXISTE:
 * No Chat.tsx os três acessos a detalhes da conversa (buscar na conversa, ver
 * membros e abrir o painel lateral) são `hidden md:*`, e o próprio painel é
 * `hidden lg:flex`. Resultado: no celular NÃO existe nenhum caminho para ver ou
 * gerenciar os membros de um grupo. Este drawer é esse caminho.
 *
 * POR QUE Sheet (Radix) E NÃO Drawer (vaul):
 * O vaul arrasta o container inteiro para fechar, e isso briga com listas
 * roláveis longas — que é exatamente o conteúdo daqui (membros + arquivos).
 * O Sheet do repositório não tem drag-to-dismiss, já é o padrão usado na
 * MeetRoom (src/pages/MeetRoom.tsx) e aceita `side="bottom"`, que no celular é
 * o gesto esperado. Rolagem interna fica sob nosso controle.
 *
 * FONTE ÚNICA DE VERDADE:
 * Este componente NÃO faz query nenhuma. Todo dado e toda mutation chegam por
 * props, vindos do Chat.tsx — assim não duplicamos queries nem estado (a busca,
 * por exemplo, escreve direto no `searchInChannel` que já existe lá).
 */

export interface ChannelInfoMember {
  user_id: string;
  full_name: string;
  avatar_url?: string | null;
  position_title?: string | null;
  /** Papel dentro do canal, quando a linha de chat_channel_members traz. */
  role?: string | null;
}

export interface ChannelInfoAttachment {
  url: string;
  name?: string | null;
  type?: string | null;
}

export interface ChannelInfoMuteOption {
  label: string;
  h: number | null;
}

export interface ChannelInfoPresence {
  online: boolean;
  lastSeenAt: string | null;
}

export interface ChannelInfoDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  /** Identidade da conversa — já resolvida pelo Chat.tsx (DM usa display_name). */
  title: string;
  /** Avatar do grupo (channel.avatar_url) ou do contato (display_avatar). */
  avatarUrl?: string | null;
  /** Linha de apoio: cargo/status da DM. Se ausente e for grupo, mostra "N membros". */
  subtitle?: string | null;
  description?: string | null;
  isDm: boolean;
  /** Canal de sistema (#geral etc): não aceita administração. */
  isSystem?: boolean;

  members: ChannelInfoMember[];
  presence?: Map<string, ChannelInfoPresence>;

  /** Busca dentro da conversa — estado mora no Chat.tsx (`searchInChannel`). */
  searchValue: string;
  onSearchChange: (value: string) => void;
  /**
   * Chamado quando o usuário confirma a busca. O Chat.tsx usa para ligar o
   * `searchOpen` do header e (normalmente) fechar o drawer, deixando o
   * resultado filtrado à vista.
   */
  onSearchSubmit?: () => void;

  /**
   * Permissões vindas de usePermissions() no Chat.tsx. Sem default permissivo:
   * se não vierem, o componente trata como SEM permissão.
   */
  isAdmin: boolean;
  isManager: boolean;

  isMuted: boolean;
  muteOptions?: ChannelInfoMuteOption[];
  onToggleMute?: (mute: boolean, durationHours: number | null) => void;

  /** Ações de administração do grupo — só renderizam se o callback existir E houver permissão. */
  onAddMember?: () => void;
  onRemoveMember?: (member: ChannelInfoMember) => void;
  onEditGroup?: () => void;
  onChangePhoto?: () => void;
  onDeleteGroup?: () => void;

  /** Toque em um membro (abrir DM/perfil). Opcional. */
  onSelectMember?: (member: ChannelInfoMember) => void;

  attachments?: ChannelInfoAttachment[];
  linksCount?: number;
  starredCount?: number;
}

export function ChannelInfoDrawer({
  open,
  onOpenChange,
  title,
  avatarUrl,
  subtitle,
  description,
  isDm,
  isSystem = false,
  members,
  presence,
  searchValue,
  onSearchChange,
  onSearchSubmit,
  isAdmin,
  isManager,
  isMuted,
  muteOptions,
  onToggleMute,
  onAddMember,
  onRemoveMember,
  onEditGroup,
  onChangePhoto,
  onDeleteGroup,
  onSelectMember,
  attachments,
  linksCount = 0,
  starredCount = 0,
}: ChannelInfoDrawerProps) {
  const [memberFilter, setMemberFilter] = useState("");
  const [muteMenuOpen, setMuteMenuOpen] = useState(false);

  /**
   * Mesma condição do painel do desktop (Chat.tsx:2797 e 3096): administração de
   * grupo exige `isAdmin` e só existe fora de DM e de canal de sistema.
   * `isManager` é aceito apenas para adicionar membro, espelhando o que a
   * sidebar já libera para gestores — nunca para remover ou apagar.
   * Nada aqui defaulta para `true`.
   */
  const isGroup = !isDm && !isSystem;
  const canAdministrate = isGroup && isAdmin === true;
  const canAddMember = isGroup && (isAdmin === true || isManager === true);

  const filteredMembers = useMemo(() => {
    const q = memberFilter.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => (m.full_name || "").toLowerCase().includes(q));
  }, [members, memberFilter]);

  const headerSubtitle =
    subtitle ??
    (isDm ? "Mensagem direta" : `${members.length} membro${members.length !== 1 ? "s" : ""}`);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        /* h-[88vh] + flex-col: o cabeçalho fica fixo e só a lista rola.
           p-0 anula o padding padrão do SheetContent (p-6), grande demais aqui. */
        className="h-[88vh] rounded-t-xl border-t border-border p-0 flex flex-col gap-0"
        aria-label="Detalhes da conversa"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Detalhes da conversa</SheetTitle>
          <SheetDescription>
            Membros, busca e configurações de {title}
          </SheetDescription>
        </SheetHeader>

        {/* ── Identidade da conversa ── */}
        <div className="flex flex-col items-center gap-2 px-4 pt-8 pb-4 border-b border-border">
          <AvatarBadge name={title || "?"} avatarUrl={avatarUrl ?? undefined} size="xl" />
          <h2
            className={cn(
              "text-base font-semibold text-foreground text-center mt-1",
              !isDm && "capitalize",
            )}
          >
            {title}
          </h2>
          <p className="text-xs text-muted-foreground text-center">{headerSubtitle}</p>
          {description && (
            <p className="text-xs text-muted-foreground/80 text-center px-4">{description}</p>
          )}
        </div>

        {/* ── Conteúdo rolável ── */}
        <div
          className="flex-1 overflow-y-auto overscroll-contain"
          /* Respeita a barra de gestos do iOS: o último item não pode ficar
             embaixo do indicador de home. */
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)" }}
        >
          {/* Busca dentro da conversa — o botão do header é hidden md: */}
          <div className="px-4 py-3 border-b border-border">
            <label htmlFor="channel-info-search" className="sr-only">
              Buscar nesta conversa
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                id="channel-info-search"
                value={searchValue}
                onChange={(e) => onSearchChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onSearchSubmit?.();
                  }
                  if (e.key === "Escape") onSearchChange("");
                }}
                placeholder="Buscar nesta conversa..."
                className="h-12 pl-9 pr-10 text-sm"
                aria-label="Buscar nesta conversa"
              />
              {searchValue && (
                <button
                  type="button"
                  onClick={() => onSearchChange("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Limpar busca"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {searchValue.trim() && onSearchSubmit && (
              <Button
                variant="secondary"
                className="mt-2 w-full h-11 text-sm"
                onClick={() => onSearchSubmit()}
              >
                Ver resultados na conversa
              </Button>
            )}
          </div>

          {/* Notificações */}
          {onToggleMute && (
            <div className="px-2 py-2 border-b border-border">
              {isMuted ? (
                <button
                  type="button"
                  onClick={() => onToggleMute(false, null)}
                  className="w-full min-h-[48px] flex items-center gap-3 px-3 rounded-md hover:bg-muted text-sm text-foreground transition-colors text-left"
                >
                  <BellOff className="w-5 h-5 flex-shrink-0 text-primary" />
                  <span className="flex-1">Silenciado · toque para reativar</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setMuteMenuOpen((v) => !v)}
                    aria-expanded={muteMenuOpen}
                    className="w-full min-h-[48px] flex items-center gap-3 px-3 rounded-md hover:bg-muted text-sm text-foreground transition-colors text-left"
                  >
                    <Bell className="w-5 h-5 flex-shrink-0 text-primary" />
                    <span className="flex-1">Silenciar conversa</span>
                    <ChevronRight
                      className={cn(
                        "w-4 h-4 text-muted-foreground transition-transform",
                        muteMenuOpen && "rotate-90",
                      )}
                    />
                  </button>
                  {muteMenuOpen && (
                    <div className="flex flex-col pl-11 pr-3 pb-1">
                      {(muteOptions ?? []).map((opt) => (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => {
                            onToggleMute(true, opt.h ?? null);
                            setMuteMenuOpen(false);
                          }}
                          className="min-h-[48px] flex items-center text-left text-sm rounded-md px-2 hover:bg-muted text-foreground"
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Atalhos informativos (mesmos contadores do painel desktop) */}
          <div className="px-2 py-2 border-b border-border">
            <div className="min-h-[48px] flex items-center gap-3 px-3 text-sm text-foreground">
              <Star className="w-5 h-5 text-primary flex-shrink-0" />
              <span className="flex-1">Mensagens favoritas</span>
              <span className="text-2xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground tabular-nums">
                {starredCount}
              </span>
            </div>
            <div className="min-h-[48px] flex items-center gap-3 px-3 text-sm text-foreground">
              <Link2 className="w-5 h-5 text-primary flex-shrink-0" />
              <span className="flex-1">Todos os links</span>
              <span className="text-2xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground tabular-nums">
                {linksCount}
              </span>
            </div>
          </div>

          {/* ── Membros (só grupo/canal) ── */}
          {!isDm && (
            <div className="px-4 py-3 border-b border-border">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> Membros · {members.length}
                </span>
                {canAddMember && onAddMember && (
                  <button
                    type="button"
                    onClick={onAddMember}
                    className="min-h-[40px] flex items-center gap-1 px-2 text-xs text-primary hover:underline"
                    aria-label="Adicionar membros ao grupo"
                  >
                    <Plus className="w-4 h-4" /> Adicionar
                  </button>
                )}
              </div>

              {members.length > 8 && (
                <Input
                  value={memberFilter}
                  onChange={(e) => setMemberFilter(e.target.value)}
                  placeholder="Filtrar membros..."
                  className="h-11 text-sm mb-2"
                  aria-label="Filtrar membros"
                />
              )}

              <ul className="flex flex-col" role="list">
                {filteredMembers.map((m) => {
                  const online = presence?.get(m.user_id)?.online ?? false;
                  const roleLabel =
                    m.role && m.role !== "member" ? m.role : null;
                  return (
                    <li key={m.user_id} className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={!onSelectMember}
                        onClick={() => onSelectMember?.(m)}
                        className="flex-1 min-w-0 min-h-[56px] flex items-center gap-3 px-2 rounded-md text-left hover:bg-muted transition-colors disabled:cursor-default disabled:hover:bg-transparent"
                      >
                        <span className="relative flex-shrink-0">
                          <AvatarBadge
                            name={m.full_name}
                            avatarUrl={m.avatar_url ?? undefined}
                            size="md"
                          />
                          {online && (
                            <span
                              className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-success ring-2 ring-card"
                              aria-label="online"
                            />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-foreground truncate">
                            {m.full_name}
                          </span>
                          {(m.position_title || roleLabel) && (
                            <span className="block text-2xs text-muted-foreground truncate">
                              {m.position_title}
                              {m.position_title && roleLabel && " · "}
                              {roleLabel}
                            </span>
                          )}
                        </span>
                      </button>
                      {canAdministrate && onRemoveMember && (
                        <button
                          type="button"
                          onClick={() => onRemoveMember(m)}
                          className="w-12 h-12 flex items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex-shrink-0"
                          aria-label={`Remover ${m.full_name} do grupo`}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </li>
                  );
                })}
                {filteredMembers.length === 0 && (
                  <li className="text-xs text-muted-foreground italic px-2 py-3">
                    Nenhum membro encontrado.
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* ── Arquivos e mídia ── */}
          {attachments && attachments.length > 0 && (
            <div className="px-4 py-3 border-b border-border">
              <div className="text-2xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Arquivos e mídia
              </div>
              <div className="grid grid-cols-3 gap-2">
                {attachments.map((a, i) => (
                  <a
                    key={`${a.url}-${i}`}
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="aspect-square rounded-md bg-muted hover:bg-muted/70 flex flex-col items-center justify-center gap-1 p-2 transition-colors"
                  >
                    <FileText className="w-5 h-5 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground truncate w-full text-center">
                      {a.name || "arquivo"}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* ── Administração do grupo — mesmas condições do painel desktop ── */}
          {canAdministrate && (onEditGroup || onChangePhoto || onDeleteGroup) && (
            <div className="px-2 py-2">
              <div className="text-2xs font-medium text-muted-foreground uppercase tracking-wide px-3 mb-1">
                Administração
              </div>
              {onEditGroup && (
                <button
                  type="button"
                  onClick={onEditGroup}
                  className="w-full min-h-[48px] flex items-center gap-3 px-3 rounded-md hover:bg-muted text-sm text-foreground text-left"
                >
                  <Settings className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  Editar grupo
                </button>
              )}
              {onChangePhoto && (
                <button
                  type="button"
                  onClick={onChangePhoto}
                  className="w-full min-h-[48px] flex items-center gap-3 px-3 rounded-md hover:bg-muted text-sm text-foreground text-left"
                >
                  <ImageIcon className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  Trocar foto
                </button>
              )}
              {onDeleteGroup && (
                <button
                  type="button"
                  onClick={onDeleteGroup}
                  className="w-full min-h-[48px] flex items-center gap-3 px-3 rounded-md hover:bg-destructive/10 text-sm text-destructive text-left"
                >
                  <Trash2 className="w-5 h-5 flex-shrink-0" />
                  Apagar grupo
                </button>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default ChannelInfoDrawer;
