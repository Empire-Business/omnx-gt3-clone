-- Fix user_roles: ensure only ONE role per user
-- Remove duplicates and add UNIQUE(user_id) constraint

-- 1. Create temp table with one role per user (prioritizing admin)
CREATE TEMP TABLE user_roles_dedup AS
WITH ranked_roles AS (
  SELECT
    id,
    user_id,
    role,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END, id) as rn
  FROM user_roles
)
SELECT id FROM ranked_roles WHERE rn = 1;

-- 2. Delete rows not in the dedup list
DELETE FROM user_roles
WHERE id NOT IN (SELECT id FROM user_roles_dedup);

-- 3. Drop old composite constraint
ALTER TABLE user_roles
DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;

-- 4. Add single-column UNIQUE constraint
ALTER TABLE user_roles
ADD CONSTRAINT user_roles_user_id_key UNIQUE (user_id);
