-- Migration: Add branding and attachments buckets
-- Created: 2026-02-20

-- 1. BRANDING BUCKET (logo da empresa)
INSERT INTO storage.buckets (id, name, public) VALUES ('branding', 'branding', true);

-- Políticas para branding (qualquer usuário autenticado do tenant pode ver)
CREATE POLICY "Brand assets are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'branding');

-- Admin do tenant pode fazer upload/update/delete logos
CREATE POLICY "Admins can upload branding"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'branding'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE p.tenant_id = (SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid())
    AND ur.role = 'admin'
  )
);

CREATE POLICY "Admins can update branding"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'branding'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE p.tenant_id = (SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid())
    AND ur.role = 'admin'
  )
);

CREATE POLICY "Admins can delete branding"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'branding'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE p.tenant_id = (SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid())
    AND ur.role = 'admin'
  )
);


-- 2. ATTACHMENTS BUCKET (anexos do kanban/tarefas)
INSERT INTO storage.buckets (id, name, public) VALUES ('attachments', 'attachments', true);

-- Políticas para attachments (qualquer usuário autenticado pode ver)
CREATE POLICY "Attachments are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'attachments');

-- Usuários autenticados podem fazer upload de anexos
CREATE POLICY "Authenticated users can upload attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'attachments'
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Authenticated users can update attachments"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'attachments'
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Authenticated users can delete attachments"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'attachments'
  AND auth.uid() IS NOT NULL
);
