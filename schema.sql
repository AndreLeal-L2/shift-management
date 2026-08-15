-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Employees table
CREATE TABLE employees (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  max_hours INTEGER NOT NULL,
  availability JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sales history table
CREATE TABLE sales_history (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
  sales JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_sales_history_date ON sales_history(recorded_at);

-- RLS Policies (only for authenticated users via Supabase Auth)
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to manage employees" 
ON employees FOR ALL 
USING (auth.role() = 'authenticated') 
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to manage sales_history" 
ON sales_history FOR ALL 
USING (auth.role() = 'authenticated') 
WITH CHECK (auth.role() = 'authenticated');
