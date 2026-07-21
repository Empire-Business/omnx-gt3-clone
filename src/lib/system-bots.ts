// Utilitário central para identificar colaboradores que, na verdade, são bots
// de sistema (Empire Bot, OMNX Bot).
//
// Esses usuários existem de propósito como "remetentes" de mensagens
// automáticas (lembretes de reunião, assistente OMNX). Eles NÃO devem aparecer
// em nenhuma lista de seleção de pessoas (diretório/organograma, pickers de
// responsável, "nova conversa", etc.).
//
// Padrões de e-mail:
//   - Empire Bot: bot+{tenant_id}@empire.system
//   - OMNX Bot:   omnx-bot+{tenant_id}@omnx.system
//
// IMPORTANTE: mapas de resolução de nome (id -> nome/avatar) NÃO devem usar
// este filtro, pois ainda precisamos renderizar o nome dos bots quando eles
// enviam mensagens.
export function isSystemBotEmployee(e: { work_email?: string | null; full_name?: string | null }) {
  const email = (e.work_email || "").toLowerCase();
  if (email.endsWith("@empire.system") || email.endsWith("@omnx.system")) return true;
  if (email.startsWith("bot+") || email.startsWith("omnx-bot+")) return true;
  const name = (e.full_name || "").toLowerCase();
  return name === "empire bot" || name === "omnx bot";
}
