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

-- Sessions table
CREATE TABLE sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  session_token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX idx_sessions_token ON sessions(session_token);
CREATE INDEX idx_sales_history_date ON sales_history(recorded_at);
