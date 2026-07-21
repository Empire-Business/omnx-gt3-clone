-- ══════════════════════════════════════════════════════════════
-- Cron (1 min) → edge function email-unread-chat.
-- Envia digest por email de conversas com mensagens não lidas há >= 5 min.
-- O segredo compartilhado vem do Vault (name='email_cron_secret') e é
-- enviado no header x-cron-secret; a function valida contra a env CRON_SECRET.
-- ══════════════════════════════════════════════════════════════

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  CREATE EXTENSION IF NOT EXISTS pg_net;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'extensions skip: %', SQLERRM;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('email-unread-chat-every-minute')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'email-unread-chat-every-minute');

  PERFORM cron.schedule(
    'email-unread-chat-every-minute',
    '* * * * *',
    $q$
      SELECT net.http_post(
        url := 'https://opbdoulspzlabxzevffc.supabase.co/functions/v1/email-unread-chat',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_cron_secret')
        ),
        body := '{}'::jsonb
      );
    $q$
  );
EXCEPTION WHEN others THEN
  RAISE NOTICE 'cron schedule skip: %', SQLERRM;
END $$;
