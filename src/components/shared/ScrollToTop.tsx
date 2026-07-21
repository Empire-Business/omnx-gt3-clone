import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Scrolls the main content area to the top on route change.
 */
export function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    // Scroll the main element to top
    const main = document.querySelector("main");
    if (main) {
      main.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    } else {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }
  }, [pathname]);

  return null;
}
