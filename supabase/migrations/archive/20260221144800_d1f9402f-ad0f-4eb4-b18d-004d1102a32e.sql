
-- Fix security definer view by setting it to SECURITY INVOKER (default, uses querying user's permissions)
ALTER VIEW public.organograma_view SET (security_invoker = on);
