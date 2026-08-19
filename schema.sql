CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS employees (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  owner_id UUID NOT NULL DEFAULT auth.uid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  role TEXT NOT NULL CHECK (char_length(role) BETWEEN 2 AND 160),
  max_hours INTEGER NOT NULL CHECK (max_hours BETWEEN 1 AND 60),
  availability JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_history (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  owner_id UUID NOT NULL DEFAULT auth.uid(),
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
  sales JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employees_owner_created ON employees(owner_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sales_history_owner_recorded ON sales_history(owner_id, recorded_at DESC);

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_history ENABLE ROW LEVEL SECURITY;

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
