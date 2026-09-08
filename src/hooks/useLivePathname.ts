import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

/**
 * Caminho REAL da barra de endereços — inclusive quando ele muda por
 * `history.replaceState`, que o React Router não enxerga.
 *
 * Por que isso existe: o Chat troca de conversa com `replaceState`
 * (`Chat.tsx`, `selectChannel`) de propósito. Navegar pelo router mudaria
 * `location.pathname`, que é a `key` do `PageTransition` no `AppLayout` — e a
 * página inteira remontaria a cada troca de canal, perdendo estado e
 * refazendo as queries.
 *
 * O efeito colateral era que `useLocation()` nunca via `/chat/:id`. Dentro de
 * uma conversa, o layout continuava achando que estava na LISTA: a BottomNav
 * seguia renderizada por cima do chat e o `<main>` seguia reservando a altura
 * dela. Somado ao respiro que o próprio composer já aplicava, sobrava um vão
 * de ~112px (mais duas safe-areas) embaixo do campo de digitação.
 *
 * Este hook devolve o pathname corrente reagindo às três origens possíveis:
 * navegação do router, `popstate` (botão voltar) e o evento `gt3:pathchange`
 * que o Chat dispara logo após o `replaceState`.
 *
 * Use-o para decisões de LAYOUT. Para a `key` do `PageTransition` continue
 * usando o `location.pathname` do router — é justamente o que evita o
 * remount.
 */
export function useLivePathname(): string {
  const location = useLocation();
  const [pathname, setPathname] = useState(() =>
    typeof window === "undefined" ? location.pathname : window.location.pathname
  );

  // Navegação normal do router.
  //
  // A dependência é `location.key` — NÃO `location.pathname`. Motivo: dentro do
  // Chat a conversa é aberta com `replaceState` (invisível ao router), então o
  // router continua achando que está em "/chat". Quando o botão "Voltar" da
  // conversa chama `navigate("/chat")`, o `pathname` do router não MUDA de
  // valor ("/chat" → "/chat") e um efeito dependente dele não roda — a URL real
  // volta para "/chat", mas este hook seguia devolvendo "/chat/:id" e a
  // BottomNav continuava escondida na lista de conversas. O `key` é novo a cada
  // navegação, inclusive para o mesmo caminho, então a sincronização sempre
  // acontece.
  useEffect(() => {
    setPathname(window.location.pathname);
  }, [location.key, location.pathname, location.search]);

  // `replaceState`/`pushState` manuais e botão voltar do navegador.
  useEffect(() => {
    const sync = () => setPathname(window.location.pathname);
    window.addEventListener("gt3:pathchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("gt3:pathchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  return pathname;
}

/**
 * Avisa o app de que a URL mudou por `history.replaceState`/`pushState`.
 * Chame logo depois de trocar a URL na mão.
 */
export function notifyPathChange() {
  window.dispatchEvent(new Event("gt3:pathchange"));
}
