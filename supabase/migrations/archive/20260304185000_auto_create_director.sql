-- =====================================================
-- Migration: Auto-create Director position for each area
-- =====================================================
-- Requires: 20260304184000_add_area_id_to_positions.sql
-- Verify area_id column exists before proceeding
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'positions' AND column_name = 'area_id'
  ) THEN
    RAISE EXCEPTION 'Migration prerequisite missing: area_id column does not exist in positions table';
  END IF;
END $$;

-- Function to auto-create director position when area is created
CREATE OR REPLACE FUNCTION create_director_position()
RETURNS TRIGGER AS $$
BEGIN
  -- Only insert if a director position doesn't already exist for this area
  INSERT INTO positions (title, area_id, subarea_id, tenant_id, level, sort_order, created_at, updated_at)
  SELECT 'Diretor', NEW.id, NULL, NEW.tenant_id, 1, 0, NOW(), NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM positions
    WHERE area_id = NEW.id
    AND title = 'Diretor'
    AND subarea_id IS NULL
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on company_areas table
DROP TRIGGER IF EXISTS trigger_create_director ON company_areas;
CREATE TRIGGER trigger_create_director
AFTER INSERT ON company_areas
FOR EACH ROW
EXECUTE FUNCTION create_director_position();

-- Create director positions for existing areas (if they don't exist)
INSERT INTO positions (title, area_id, subarea_id, tenant_id, level, sort_order, created_at, updated_at)
SELECT 'Diretor', a.id, NULL, a.tenant_id, 1, 0, NOW(), NOW()
FROM company_areas a
WHERE NOT EXISTS (
  SELECT 1 FROM positions p 
  WHERE p.area_id = a.id 
  AND p.title = 'Diretor'
  AND p.subarea_id IS NULL
);

-- =====================================================
-- Rollback Steps (for documentation):
-- =====================================================
-- DROP TRIGGER IF EXISTS trigger_create_director ON company_areas;
-- DROP FUNCTION IF EXISTS create_director_position();
-- DELETE FROM positions WHERE title = 'Diretor' AND subarea_id IS NULL AND area_id IS NOT NULL;