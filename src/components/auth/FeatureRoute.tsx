import { Navigate } from "react-router-dom";
import { useIntegrations, type FeatureKey } from "@/hooks/useIntegrations";

// Guard de rota por integração: se a chave de API da feature não estiver
// conectada no clone, a rota não é acessível nem por URL direta — redireciona
// para o dashboard. Fail-open: enquanto o status carrega ou em caso de erro,
// `isActive` retorna true, então a produção atual (com todas as chaves) nunca
// é bloqueada.
export function FeatureRoute({
  feature,
  children,
}: {
  feature: FeatureKey;
  children: React.ReactNode;
}) {
  const { isActive } = useIntegrations();
  if (!isActive(feature)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
