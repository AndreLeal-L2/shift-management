-- This migration locks rows to an owner and removes broad authenticated access.
-- Relleno Shifts uses a single application admin, so legacy rows without owner_id
-- are assigned to the application admin owner used by the serverless API.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

ALTER TABLE employees
ADD COLUMN IF NOT EXISTS owner_id UUID;

ALTER TABLE sales_history
ADD COLUMN IF NOT EXISTS owner_id UUID;

WITH app_admin AS (
  SELECT '00000000-0000-0000-0000-000000000001'::uuid AS id
)
UPDATE employees
SET owner_id = (SELECT id FROM app_admin)
WHERE owner_id IS NULL;

WITH app_admin AS (
  SELECT '00000000-0000-0000-0000-000000000001'::uuid AS id
)
UPDATE sales_history
SET owner_id = (SELECT id FROM app_admin)
WHERE owner_id IS NULL;

ALTER TABLE employees
ALTER COLUMN owner_id SET DEFAULT auth.uid();

ALTER TABLE sales_history
ALTER COLUMN owner_id SET DEFAULT auth.uid();

ALTER TABLE employees
ALTER COLUMN owner_id SET NOT NULL;

ALTER TABLE sales_history
ALTER COLUMN owner_id SET NOT NULL;

ALTER TABLE employees
ADD CONSTRAINT employees_name_len CHECK (char_length(name) BETWEEN 2 AND 80) NOT VALID;

ALTER TABLE employees
DROP CONSTRAINT IF EXISTS employees_role_len;

ALTER TABLE employees
ADD CONSTRAINT employees_role_len CHECK (char_length(role) BETWEEN 2 AND 160) NOT VALID;

ALTER TABLE employees
ADD CONSTRAINT employees_max_hours_range CHECK (max_hours BETWEEN 1 AND 60) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_employees_owner_created ON employees(owner_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sales_history_owner_recorded ON sales_history(owner_id, recorded_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON employees TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON sales_history TO authenticated, service_role;

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to manage employees" ON employees;
DROP POLICY IF EXISTS "Allow authenticated users to manage sales_history" ON sales_history;
DROP POLICY IF EXISTS "employees_owner_select" ON employees;
DROP POLICY IF EXISTS "employees_owner_insert" ON employees;
DROP POLICY IF EXISTS "employees_owner_update" ON employees;
DROP POLICY IF EXISTS "employees_owner_delete" ON employees;
DROP POLICY IF EXISTS "sales_history_owner_select" ON sales_history;
DROP POLICY IF EXISTS "sales_history_owner_insert" ON sales_history;

CREATE POLICY "employees_owner_select"
ON employees FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = owner_id);

CREATE POLICY "employees_owner_insert"
ON employees FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) = owner_id);

CREATE POLICY "employees_owner_update"
ON employees FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = owner_id)
WITH CHECK ((SELECT auth.uid()) = owner_id);

CREATE POLICY "employees_owner_delete"
ON employees FOR DELETE
TO authenticated
USING ((SELECT auth.uid()) = owner_id);

CREATE POLICY "sales_history_owner_select"
ON sales_history FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = owner_id);

CREATE POLICY "sales_history_owner_insert"
ON sales_history FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) = owner_id);
