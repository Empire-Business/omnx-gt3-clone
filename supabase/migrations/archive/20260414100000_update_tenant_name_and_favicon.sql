-- Atualiza nome do tenant de "GT3" para "OMNX GT3"
-- e define favicon_url apontando para o logotipo05 em public/
UPDATE tenants
SET
  name        = 'OMNX GT3',
  favicon_url = '/logotipo05.png'
WHERE name = 'GT3';
