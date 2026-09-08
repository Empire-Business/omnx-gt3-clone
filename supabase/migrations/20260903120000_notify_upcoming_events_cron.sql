-- ══════════════════════════════════════════════════════════════
-- Cron (1 min) → edge function notify-upcoming-events.
-- Dispara os lembretes de eventos internos próximos (janelas t24h e t15m).
-- O segredo compartilhado vem do Vault (name='email_cron_secret') e é
-- enviado no header x-cron-secret; a function valida contra a env CRON_SECRET.
--
-- POR QUE ESTA MIGRATION EXISTE: a função `notify-upcoming-events` foi
-- entregue sem NENHUM agendamento versionado — o repositório não tinha como
-- dizer se ela roda em produção, nem com que frequência. Sem isso, um banco
-- replicado do zero (ver docs/SETUP-DATABASE.md) sobe com a função no ar e
-- nenhum lembrete saindo.
--
-- ANTES DE APLICAR, CONFIRME EM PRODUÇÃO:
--     SELECT jobid, jobname, schedule, command FROM cron.job;
-- Se já existir um job criado à mão apontando para esta function com OUTRO
-- nome, remova-o (cron.unschedule(<jobname>)) antes de aplicar — senão passam
-- a existir dois agendamentos disparando a mesma função no mesmo minuto. O
-- unschedule abaixo só cobre o nome canônico daqui.
--
-- Reenvio duplicado é improvável mesmo com dois jobs (a UNIQUE de
-- internal_event_notifications trava), mas o custo dobra e os logs ficam
-- ilegíveis.
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
  PERFORM cron.unschedule('notify-upcoming-events-every-minute')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-upcoming-events-every-minute');

  PERFORM cron.schedule(
    'notify-upcoming-events-every-minute',
    '* * * * *',
    $q$
      SELECT net.http_post(
        url := 'https://opbdoulspzlabxzevffc.supabase.co/functions/v1/notify-upcoming-events',
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
