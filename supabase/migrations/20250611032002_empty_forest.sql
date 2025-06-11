/*
  # Compliance and Audit Infrastructure

  1. New Tables
    - `compliance_logs`
      - `id` (uuid, primary key)
      - `operation` (text)
      - `user_id` (uuid, optional)
      - `request_data` (jsonb)
      - `response_data` (jsonb)
      - `processing_time_ms` (integer)
      - `risk_level` (text)
      - `osfi_reportable` (boolean)
      - `created_at` (timestamp)
    
    - `audit_sessions`
      - `id` (uuid, primary key)  
      - `session_id` (text)
      - `user_id` (uuid, optional)
      - `start_time` (timestamp)
      - `end_time` (timestamp, optional)
      - `total_operations` (integer, default 0)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Add policies for service role access

  3. Indexes
    - Add indexes for common queries
*/

-- Compliance Logs Table
CREATE TABLE IF NOT EXISTS public.compliance_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operation text NOT NULL,
    user_id uuid,
    request_data jsonb DEFAULT '{}',
    response_data jsonb DEFAULT '{}',
    processing_time_ms integer DEFAULT 0,
    risk_level text CHECK (risk_level IN ('Low', 'Medium', 'High', 'Critical')),
    osfi_reportable boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);

-- Audit Sessions Table
CREATE TABLE IF NOT EXISTS public.audit_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id text UNIQUE NOT NULL,
    user_id uuid,
    start_time timestamptz DEFAULT now(),
    end_time timestamptz,
    total_operations integer DEFAULT 0,
    metadata jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE compliance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_sessions ENABLE ROW LEVEL SECURITY;

-- Policies for compliance_logs
CREATE POLICY "Allow service role full access to compliance_logs"
    ON compliance_logs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow authenticated users to read their own logs"
    ON compliance_logs
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Policies for audit_sessions
CREATE POLICY "Allow service role full access to audit_sessions"
    ON audit_sessions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow authenticated users to read their own sessions"
    ON audit_sessions
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_compliance_logs_operation ON compliance_logs(operation);
CREATE INDEX IF NOT EXISTS idx_compliance_logs_user_id ON compliance_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_compliance_logs_created_at ON compliance_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_compliance_logs_osfi_reportable ON compliance_logs(osfi_reportable) WHERE osfi_reportable = true;
CREATE INDEX IF NOT EXISTS idx_compliance_logs_risk_level ON compliance_logs(risk_level);

CREATE INDEX IF NOT EXISTS idx_audit_sessions_session_id ON audit_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_sessions_user_id ON audit_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_sessions_created_at ON audit_sessions(created_at);

-- Function to automatically update total_operations in audit_sessions
CREATE OR REPLACE FUNCTION update_session_operations()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE audit_sessions 
    SET total_operations = total_operations + 1,
        end_time = now()
    WHERE session_id = NEW.request_data->>'sessionId'
    AND end_time IS NULL;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update session operations count
CREATE TRIGGER trigger_update_session_operations
    AFTER INSERT ON compliance_logs
    FOR EACH ROW
    WHEN (NEW.request_data ? 'sessionId')
    EXECUTE FUNCTION update_session_operations();