import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  // Valor correto JÁ no primeiro render. Antes começava `undefined` (→ `false`
  // pelo `!!` do retorno), ou seja, todo componente que usa este hook renderiza
  // uma vez como se fosse desktop antes do efeito corrigir. Além do flash
  // visual, isso monta componentes "só de desktop" por um frame no celular —
  // tempo suficiente para o React Query disparar as queries deles.
  const [isMobile, setIsMobile] = React.useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth < MOBILE_BREAKPOINT : false,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
