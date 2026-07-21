-- ══════════════════════════════════════════════════════════════
-- Cron job para processar mensagens agendadas a cada minuto.
-- Usa a extensão pg_cron + pg_net (chamada HTTP à edge function).
-- Se as extensões não estiverem disponíveis, falha silenciosamente —
-- nesse caso, agende a edge function via Supabase Cron Dashboard.
-- ══════════════════════════════════════════════════════════════

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  CREATE EXTENSION IF NOT EXISTS pg_net;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'extensions skip: %', SQLERRM;
END $$;

DO $$
DECLARE
  v_url   TEXT := current_setting('app.supabase_url', true);
  v_token TEXT := current_setting('app.service_role_key', true);
BEGIN
  -- Os settings acima podem não estar configurados. Se faltar URL, pula.
  IF v_url IS NULL OR v_url = '' THEN
    RAISE NOTICE 'app.supabase_url não definido — pule e agende manualmente via dashboard.';
    RETURN;
  END IF;

  -- Remove agendamento anterior se existir
  PERFORM cron.unschedule('process-scheduled-messages-every-minute')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-scheduled-messages-every-minute');

  PERFORM cron.schedule(
    'process-scheduled-messages-every-minute',
    '* * * * *',
    format($q$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || %L)
      );
    $q$, v_url || '/functions/v1/process-scheduled-messages', v_token)
  );
EXCEPTION WHEN others THEN
  RAISE NOTICE 'cron schedule skip: %', SQLERRM;
END $$;
