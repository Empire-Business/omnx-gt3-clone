import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTenantByDomain } from "@/hooks/useTenantByDomain";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export function ProtectedRoute() {
  const { user, profile, loading } = useAuth();
  const { data: domainTenant, isLoading: domainLoading } = useTenantByDomain();
  const [kickedOut, setKickedOut] = useState(false);

  // Trava: se o app foi acessado por um domínio próprio (custom_domain),
  // o usuário logado precisa pertencer ao tenant correspondente.
  // Caso contrário, faz signOut e manda pra tela de login.
  useEffect(() => {
    if (loading || domainLoading) return;
    if (!user || !profile || !domainTenant) return;

    if (profile.tenant_id !== domainTenant.id) {
      setKickedOut(true);
      toast.error("Este domínio não pertence à sua conta.");
      supabase.auth.signOut();
    }
  }, [user, profile, domainTenant, loading, domainLoading]);

  if (loading || domainLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user || kickedOut) {
    return <Navigate to="/auth" replace />;
  }

  return <Outlet />;
}
