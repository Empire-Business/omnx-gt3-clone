import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  className?: string;
  variant?: "fullscreen" | "inline";
}

interface State {
  hasError: boolean;
  error: Error | null;
}

const CHUNK_ERROR_KEY = "chunk_reload_at";
const CHUNK_RELOAD_PARAM = "chunk-reload";

function isChunkLoadError(error: Error): boolean {
  return (
    error.message.includes("Failed to fetch dynamically imported module") ||
    error.message.includes("Importing a module script failed") ||
    error.name === "ChunkLoadError"
  );
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, error: null };

  private forceChunkReload = () => {
    const url = new URL(window.location.href);
    url.searchParams.set(CHUNK_RELOAD_PARAM, String(Date.now()));
    window.location.replace(url.toString());
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);

    if (isChunkLoadError(error)) {
      // Recarrega automaticamente após novo deploy, evitando loop com cooldown de 10s
      const lastReload = Number(sessionStorage.getItem(CHUNK_ERROR_KEY) || 0);
      const now = Date.now();
      if (now - lastReload > 10_000) {
        sessionStorage.setItem(CHUNK_ERROR_KEY, String(now));
        this.forceChunkReload();
      }
    }
  }

  private handleReset = () => {
    if (this.state.error && isChunkLoadError(this.state.error)) {
      this.forceChunkReload();
    } else {
      this.setState({ hasError: false, error: null });
    }
  };

  public render() {
    if (this.state.hasError) {
      const isInline = this.props.variant === "inline";
      const wrapperCls = isInline
        ? "flex items-center justify-center py-12 px-4"
        : "min-h-screen flex items-center justify-center bg-background p-6";
      const iconWrapCls = isInline
        ? "w-12 h-12 rounded-xl bg-danger/10 flex items-center justify-center mb-3"
        : "w-16 h-16 rounded-2xl bg-danger/10 flex items-center justify-center mb-4";
      const iconCls = isInline ? "w-6 h-6 text-danger" : "w-8 h-8 text-danger";
      const titleCls = isInline
        ? "text-sm font-semibold text-foreground mb-1"
        : "text-lg font-semibold text-foreground mb-2";
      return (
        <div className={wrapperCls}>
          <div className="flex flex-col items-center text-center max-w-md">
            <div className={iconWrapCls}>
              <AlertTriangle className={iconCls} />
            </div>
            <h2 className={titleCls}>Não foi possível carregar</h2>
            <p className="text-xs text-muted-foreground mb-3">
              {isInline ? "Ocorreu um erro ao carregar este conteúdo." : "Ocorreu um erro inesperado. Tente recarregar a página."}
            </p>
            {this.state.error && (
              <pre className="text-2xs text-muted-foreground bg-muted rounded-lg p-2 mb-3 max-w-full overflow-auto text-left">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Tentar novamente
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
