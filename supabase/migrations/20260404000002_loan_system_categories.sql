-- =============================================================================
-- Sprint 121 Session I — Loan System Categories
-- Adds a `system_tag` column to categories so that system-protected categories
-- can be found by their immutable internal tag even if the user renames them.
--
-- System tags: loan_principal | loan_interest | loan_penalty | loan_forgiveness
-- =============================================================================

-- ── 1. Add system_tag column ──────────────────────────────────────────────────
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS system_tag text DEFAULT NULL;

-- ── 2. Add constraint: only known system tags allowed ─────────────────────────
ALTER TABLE categories
  DROP CONSTRAINT IF EXISTS categories_system_tag_check;

ALTER TABLE categories
  ADD CONSTRAINT categories_system_tag_check
  CHECK (
    system_tag IS NULL
    OR system_tag IN (
      'loan_principal',
      'loan_interest',
      'loan_penalty',
      'loan_forgiveness'
    )
  );

-- ── 3. Unique index: at most one system category per business per tag ─────────
CREATE UNIQUE INDEX IF NOT EXISTS categories_system_tag_business_unique
  ON categories (business_id, system_tag)
  WHERE system_tag IS NOT NULL;

-- ── 4. Seed system categories for existing businesses ────────────────────────
-- For each business that does NOT already have a system category with this tag,
-- insert a default one. Uses a cross-join with the tag definitions.
-- Users may rename these; the system_tag column is what code queries against.

WITH tag_defs AS (
  SELECT
    unnest(ARRAY['loan_principal','loan_interest','loan_penalty','loan_forgiveness'])  AS tag,
    unnest(ARRAY['Loan Principal','Loan Interest','Loan Penalty','Loan Forgiveness']) AS label,
    unnest(ARRAY['💰','💹','⚠️','🤝'])                                                AS icon
),
existing AS (
  SELECT DISTINCT business_id, system_tag
  FROM categories
  WHERE system_tag IS NOT NULL
),
businesses_needing AS (
  SELECT b.id AS business_id, t.tag, t.label, t.icon
  FROM businesses b
  CROSS JOIN tag_defs t
  WHERE NOT EXISTS (
    SELECT 1 FROM existing e
    WHERE e.business_id = b.id AND e.system_tag = t.tag
  )
)
INSERT INTO categories (business_id, name, type, icon, color, system_tag, created_at)
SELECT 
  business_id, 
  label as name, 
  'expense' as type, 
  icon, 
  '#6366f1' as color, 
  tag as system_tag, 
  now() as created_at
FROM businesses_needing;

-- ── 5. RLS: system_tag is read-only for non-superadmins ──────────────────────
-- We cannot enforce this purely in RLS for UPDATE (Postgres RLS doesn't allow
-- column-level restrictions on UPDATE). Instead we guard via a trigger.

CREATE OR REPLACE FUNCTION protect_category_system_tag()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Prevent changing system_tag once it has been set
  IF OLD.system_tag IS NOT NULL AND NEW.system_tag IS DISTINCT FROM OLD.system_tag THEN
    RAISE EXCEPTION 'system_tag is immutable once set (category id: %)', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  -- Prevent setting system_tag via a normal UPDATE (only migrations may do so)
  IF OLD.system_tag IS NULL AND NEW.system_tag IS NOT NULL THEN
    RAISE EXCEPTION 'system_tag can only be set by system migrations'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_category_system_tag ON categories;
CREATE TRIGGER trg_protect_category_system_tag
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION protect_category_system_tag();

-- ── 6. Helper function: find system category id by tag + business ─────────────
-- Usage: SELECT get_system_category_id('loan_interest', '<business_uuid>')
CREATE OR REPLACE FUNCTION get_system_category_id(p_tag text, p_business_id uuid)
RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT id FROM categories
  WHERE system_tag = p_tag AND business_id = p_business_id
  LIMIT 1;
$$;

COMMENT ON COLUMN categories.system_tag IS
  'Immutable internal tag for system-owned categories (e.g. loan_interest). '
  'Users may rename the category; code must query by this tag, not by name.';
