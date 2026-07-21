import { useEffect } from "react";
import { BRAND } from "@/config/brand";

const PAGE_TITLES: Record<string, { title: string; description?: string }> = {
  "/dashboard": { title: "Dashboard", description: "Visão geral de KPIs, projetos e produtividade da equipe" },
  "/organograma": { title: "Organograma", description: "Estrutura hierárquica da organização" },
  "/areas-cargos": { title: "Áreas e Cargos", description: "Gestão de áreas, subáreas e cargos da empresa" },
  "/colaboradores": { title: "Colaboradores", description: "Gestão de colaboradores e equipes" },
  "/projetos": { title: "Projetos", description: "Gestão de projetos e acompanhamento de progresso" },
  "/processos": { title: "Processos", description: "Gestão de processos organizacionais com IA" },
  "/tarefas": { title: "Tarefas", description: "Quadro Kanban de tarefas e atividades" },
  "/configuracoes": { title: "Configurações", description: "Configurações do sistema e integrações" },
  "/perfil": { title: "Meu Perfil", description: "Configurações da conta e perfil do usuário" },
  "/faq": { title: "FAQ & Tutoriais", description: "Perguntas frequentes e guias de uso" },
  "/api-docs": { title: "Documentação da API", description: "Documentação técnica da API REST" },
  "/auth": { title: "Login", description: `Acesse sua conta no ${BRAND.appName}` },
  "/forgot-password": { title: "Recuperar Senha", description: "Recupere o acesso à sua conta" },
  "/reset-password": { title: "Redefinir Senha", description: "Crie uma nova senha para sua conta" },
};

function setMetaTag(name: string, content: string) {
  let meta = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = name;
    document.head.appendChild(meta);
  }
  meta.content = content;
}

function setCanonical(href: string) {
  let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }
  link.href = href;
}

function withNotificationCount(title: string, unreadCount?: number) {
  if (!unreadCount || unreadCount <= 0) return title;
  return `${title} (${unreadCount})`;
}

export function usePageTitle(pathname: string, appName?: string, unreadCount?: number) {
  useEffect(() => {
    const brand = appName || BRAND.appName;
    const setTitle = (pageTitle: string) => {
      document.title = withNotificationCount(`${pageTitle} | ${brand}`, unreadCount);
    };

    const exact = PAGE_TITLES[pathname];
    if (exact) {
      setTitle(exact.title);
      if (exact.description) setMetaTag("description", exact.description);
      setCanonical(`${window.location.origin}${pathname}`);
      return;
    }

    if (pathname.startsWith("/projetos/")) {
      setTitle("Detalhes do Projeto");
      setMetaTag("description", "Detalhes do projeto, membros e tarefas");
      setCanonical(`${window.location.origin}${pathname}`);
      return;
    }

    if (pathname.startsWith("/processos/")) {
      setTitle("Detalhes do Processo");
      setMetaTag("description", "Detalhes do processo, diagrama e documentação");
      setCanonical(`${window.location.origin}${pathname}`);
      return;
    }

    const match = Object.entries(PAGE_TITLES).find(([path]) => pathname.startsWith(path));
    const entry = match ? match[1] : null;
    document.title = withNotificationCount(entry ? `${entry.title} | ${brand}` : brand, unreadCount);
    if (entry?.description) setMetaTag("description", entry.description);
    setCanonical(`${window.location.origin}${pathname}`);
  }, [pathname, appName, unreadCount]);
}
