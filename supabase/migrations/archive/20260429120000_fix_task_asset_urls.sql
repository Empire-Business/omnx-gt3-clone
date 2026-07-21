-- Fix: cover_url e attachments[].url de tarefas foram corrompidos por
-- normalizeSupabaseAssetUrl ser aplicado no estado do TaskDetailModal e
-- persistido pelo auto-save. URLs viraram same-origin (ex.: gt3.omnx.pro)
-- e quebravam quando lidas em outros hosts/proxies.
-- Esta migration reverte URLs same-origin para o domínio canônico do projeto.

DO $$
DECLARE
  canonical_origin text := 'https://opbdoulspzlabxzevffc.supabase.co';
  bad_hosts text[] := ARRAY[
    'https://gt3.omnx.pro',
    'https://gt3.empirebusiness.com.br',
    'https://t3.empirebusiness.com.br'
  ];
  h text;
BEGIN
  FOREACH h IN ARRAY bad_hosts LOOP
    -- cover_url
    UPDATE public.tasks
    SET cover_url = REPLACE(cover_url, h, canonical_origin)
    WHERE cover_url LIKE h || '/storage/v1/%';

    -- attachments JSONB array: reescreve url de cada item
    UPDATE public.tasks t
    SET attachments = (
      SELECT jsonb_agg(
        CASE
          WHEN (item->>'url') LIKE h || '/storage/v1/%'
            THEN jsonb_set(item, '{url}', to_jsonb(REPLACE(item->>'url', h, canonical_origin)))
          ELSE item
        END
      )
      FROM jsonb_array_elements(t.attachments) AS item
    )
    WHERE t.attachments IS NOT NULL
      AND jsonb_typeof(t.attachments) = 'array'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(t.attachments) AS item
        WHERE (item->>'url') LIKE h || '/storage/v1/%'
      );
  END LOOP;
END $$;
