-- Decision Intelligence and Notifications Tables

-- Decision Notifications Table
CREATE TABLE IF NOT EXISTS public.decision_notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    decision_id text NOT NULL,
    notify_roles jsonb DEFAULT '[]',
    urgency text CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
    method text CHECK (method IN ('email', 'sms', 'system-alert', 'immediate-call')),
    status text CHECK (status IN ('pending', 'sent', 'failed', 'acknowledged')),
    sent_at timestamptz,
    acknowledged_at timestamptz,
    error_message text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Batch Processing Status Table  
CREATE TABLE IF NOT EXISTS public.batch_processing (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id text UNIQUE NOT NULL,
    status text CHECK (status IN ('continue', 'hold', 'escalate', 'completed', 'failed')),
    total_items integer DEFAULT 0,
    processed_items integer DEFAULT 0,
    last_decision text,
    risk_summary jsonb DEFAULT '{}',
    metadata jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Decision Audit Trail Table
CREATE TABLE IF NOT EXISTS public.decision_audit_trail (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    decision_id text NOT NULL,
    decision_type text NOT NULL, -- 'APPROVE', 'REVIEW', 'REJECT', 'INVESTIGATE'
    risk_score integer CHECK (risk_score >= 0 AND risk_score <= 100),
    confidence_score integer CHECK (confidence_score >= 0 AND confidence_score <= 100),
    key_factors jsonb DEFAULT '[]',
    regulatory_flags jsonb DEFAULT '[]',
    ai_reasoning jsonb DEFAULT '{}',
    human_override boolean DEFAULT false,
    override_reason text,
    processing_time_ms integer DEFAULT 0,
    user_id uuid,
    session_id text,
    batch_id text,
    operator_id text,
    branch_code text,
    created_at timestamptz DEFAULT now()
);

-- Security Logs Table (for enhanced security monitoring)
CREATE TABLE IF NOT EXISTS public.security_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type text NOT NULL,
    ip_address text,
    user_id uuid,
    session_id text,
    reason text,
    context jsonb DEFAULT '{}',
    severity text CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    resolved boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE decision_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_processing ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_audit_trail ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_logs ENABLE ROW LEVEL SECURITY;

-- Policies for decision_notifications
CREATE POLICY "Allow service role full access to decision_notifications"
    ON decision_notifications
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow authenticated users to read relevant notifications"
    ON decision_notifications
    FOR SELECT
    TO authenticated
    USING (true); -- Could be more restrictive based on roles

-- Policies for batch_processing
CREATE POLICY "Allow service role full access to batch_processing"
    ON batch_processing
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow authenticated users to read batch_processing"
    ON batch_processing
    FOR SELECT
    TO authenticated
    USING (true);

-- Policies for decision_audit_trail  
CREATE POLICY "Allow service role full access to decision_audit_trail"
    ON decision_audit_trail
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow authenticated users to read their decision trails"
    ON decision_audit_trail
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Policies for security_logs
CREATE POLICY "Allow service role full access to security_logs"
    ON security_logs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow authenticated users to read their security logs"
    ON security_logs
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_decision_notifications_decision_id ON decision_notifications(decision_id);
CREATE INDEX IF NOT EXISTS idx_decision_notifications_status ON decision_notifications(status);
CREATE INDEX IF NOT EXISTS idx_decision_notifications_urgency ON decision_notifications(urgency);
CREATE INDEX IF NOT EXISTS idx_decision_notifications_created_at ON decision_notifications(created_at);

CREATE INDEX IF NOT EXISTS idx_batch_processing_batch_id ON batch_processing(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_processing_status ON batch_processing(status);
CREATE INDEX IF NOT EXISTS idx_batch_processing_updated_at ON batch_processing(updated_at);

CREATE INDEX IF NOT EXISTS idx_decision_audit_trail_decision_id ON decision_audit_trail(decision_id);
CREATE INDEX IF NOT EXISTS idx_decision_audit_trail_decision_type ON decision_audit_trail(decision_type);
CREATE INDEX IF NOT EXISTS idx_decision_audit_trail_user_id ON decision_audit_trail(user_id);
CREATE INDEX IF NOT EXISTS idx_decision_audit_trail_created_at ON decision_audit_trail(created_at);
CREATE INDEX IF NOT EXISTS idx_decision_audit_trail_risk_score ON decision_audit_trail(risk_score);
CREATE INDEX IF NOT EXISTS idx_decision_audit_trail_batch_id ON decision_audit_trail(batch_id) WHERE batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_security_logs_event_type ON security_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_security_logs_ip_address ON security_logs(ip_address);
CREATE INDEX IF NOT EXISTS idx_security_logs_severity ON security_logs(severity);
CREATE INDEX IF NOT EXISTS idx_security_logs_created_at ON security_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_security_logs_resolved ON security_logs(resolved) WHERE resolved = false;

-- Triggers to automatically update updated_at
CREATE TRIGGER update_decision_notifications_updated_at
    BEFORE UPDATE ON decision_notifications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_batch_processing_updated_at
    BEFORE UPDATE ON batch_processing
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically create audit trail entries
CREATE OR REPLACE FUNCTION create_decision_audit_entry()
RETURNS TRIGGER AS $$
BEGIN
    -- This would be called by the application when decisions are made
    -- For now, it's a placeholder for future automated audit trail creation
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Sample data for testing (optional)
INSERT INTO batch_processing (batch_id, status, total_items, processed_items, last_decision)
VALUES 
    ('BATCH-DEMO-001', 'continue', 100, 25, 'APPROVE'),
    ('BATCH-DEMO-002', 'hold', 50, 30, 'INVESTIGATE')
ON CONFLICT (batch_id) DO NOTHING;