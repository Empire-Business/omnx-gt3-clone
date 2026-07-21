-- Diagnóstico v2: mostra os últimos posts brutos do tenant, sem filtro de visibilidade
CREATE OR REPLACE FUNCTION public.diagnostico_feed_posts_raw()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid := public.get_user_tenant_id();
  v_posts     jsonb;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',                  fp.id,
      'visibility_type',     fp.visibility_type,
      'visibility_targets',  fp.visibility_targets,
      'tenant_id',           fp.tenant_id,
      'created_at',          fp.created_at
    )
    ORDER BY fp.created_at DESC
  )
  INTO v_posts
  FROM public.feed_posts fp
  WHERE fp.tenant_id = v_tenant_id
  LIMIT 5;

  RETURN jsonb_build_object(
    'tenant_id', v_tenant_id,
    'posts',     COALESCE(v_posts, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.diagnostico_feed_posts_raw() TO authenticated;
