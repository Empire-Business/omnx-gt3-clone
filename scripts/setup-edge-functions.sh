#!/usr/bin/env bash
# =============================================================================
# EMPIRE MANAGER — Deploy de Edge Functions
# =============================================================================
# Uso:
#   1. Instale o Supabase CLI: https://supabase.com/docs/guides/cli
#   2. Faça login: supabase login
#   3. Link o projeto: supabase link --project-ref <SEU_PROJECT_REF>
#   4. Execute: bash scripts/setup-edge-functions.sh
# =============================================================================

set -euo pipefail

PROJECT_REF=""

# Verifica se está em um projeto linkado
if [ -f "supabase/.temp/linked-project.json" ]; then
  PROJECT_REF=$(cat supabase/.temp/linked-project.json | grep -o '"ref":"[^"]*"' | cut -d'"' -f4)
fi

if [ -z "$PROJECT_REF" ]; then
  echo "❌ Projeto Supabase não está linkado."
  echo "   Execute primeiro: supabase link --project-ref <SEU_PROJECT_REF>"
  exit 1
fi

echo "🚀 Deployando Edge Functions no projeto: $PROJECT_REF"
echo ""

# Lista de funções a serem deployadas
FUNCTIONS=(
  agent-gateway
  api
  create-chat-conversation
  create-employee
  create-tenant
  dispatch-webhook
  feed-audio-transcribe
  ghl-webhook
  livekit-end-room
  livekit-guest-decision
  livekit-guest-request
  livekit-guest-status
  livekit-guest-token
  livekit-start-huddle
  livekit-token
  livekit-webhook
  manage-access
  meeting-ai
  meeting-approve
  omnx-bot
  process-ai
  process-scheduled-messages
  send-chat-notification
  soniox-temp-key
  system-bot-notify
)

FAILED=()
OK=()

for fn in "${FUNCTIONS[@]}"; do
  echo -n "  📦 $fn ... "
  if supabase functions deploy "$fn" --project-ref "$PROJECT_REF" > /tmp/deploy-${fn}.log 2>&1; then
    echo "✅ OK"
    OK+=("$fn")
  else
    echo "❌ FALHOU"
    FAILED+=("$fn")
    echo "     └─ Log: /tmp/deploy-${fn}.log"
  fi
done

echo ""
echo "============================================================================="
echo "✅ DEPLOY CONCLUÍDO"
echo "============================================================================="
echo "Sucesso: ${#OK[@]}/${#FUNCTIONS[@]}"

if [ ${#FAILED[@]} -gt 0 ]; then
  echo ""
  echo "⚠️  Funções com falha:"
  for fn in "${FAILED[@]}"; do
    echo "   • $fn"
  done
  echo ""
  echo "Possíveis causas:"
  echo "   • Variável de ambiente faltando no Supabase (veja abaixo)"
  echo "   • Erro de compilação TypeScript"
  echo ""
fi

echo ""
echo "============================================================================="
echo "🔐 VARIÁVEIS DE AMBIENTE OBRIGATÓRIAS NO SUPABASE"
echo "============================================================================="
echo "Configure em: Dashboard Supabase → Project Settings → Edge Functions → Secrets"
echo ""
echo "Obrigatórias para TODAS as funções:"
echo "   SUPABASE_URL=https://<ref>.supabase.co"
echo "   SUPABASE_ANON_KEY=<anon-key>"
echo "   SUPABASE_SERVICE_ROLE_KEY=<service-role-key>"
echo ""
echo "Para reuniões (LiveKit):"
echo "   LIVEKIT_URL"
echo "   LIVEKIT_API_KEY"
echo "   LIVEKIT_API_SECRET"
echo ""
echo "Para IA (OpenRouter):"
echo "   OPENROUTER_API_KEY"
echo ""
echo "Para notificações push/email:"
echo "   RESEND_API_KEY"
echo "   VAPID_PUBLIC_KEY"
echo "   VAPID_PRIVATE_KEY"
echo "   VAPID_SUBJECT"
echo ""
echo "Para transcrição de áudio:"
echo "   SONIOX_API_KEY"
echo ""
echo "Para gravações de reunião (S3):"
echo "   S3_ENDPOINT"
echo "   S3_BUCKET"
echo "   S3_ACCESS_KEY"
echo "   S3_SECRET_KEY"
echo "   S3_PUBLIC_URL"
echo ""
echo "Para redirecionamentos:"
echo "   SITE_URL=https://seu-dominio.vercel.app"
echo ""
