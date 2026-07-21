-- Data de nascimento no perfil do usuário.
-- Usada para exibir "🎉 Hoje é meu aniversário!" no card do DM na sidebar do chat
-- (apenas mês/dia importam; o ano não é exibido).
--
-- Segurança: nenhuma policy nova é necessária.
--  - UPDATE: o dono já pode atualizar o próprio perfil (policy `profiles_update_own`),
--    que trava apenas o `tenant_id` (WITH CHECK) — demais colunas seguem editáveis.
--  - SELECT: a leitura de perfis de outros usuários do mesmo tenant já é permitida
--    (o chat já lê full_name/avatar_url dos participantes), então birth_date segue a
--    mesma regra.

alter table public.profiles
  add column if not exists birth_date date;

comment on column public.profiles.birth_date is
  'Data de nascimento do usuário. Mês/dia usados para indicar aniversário no chat.';
