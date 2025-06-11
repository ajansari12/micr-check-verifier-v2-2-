/*
  # Batch Cheque Processing Tables

  1. New Tables
    - `batch_cheques` - Individual cheques within batch operations
    
  2. Security
    - Enable RLS on new tables
    - Add policies for authentication and service role
    
  3. Changes
    - Updates to batch_processing table structure for enhanced tracking
*/

-- Individual Cheques within Batches
CREATE TABLE IF NOT EXISTS public.batch_cheques (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id text NOT NULL,
    cheque_id text NOT NULL,
    original_filename text,
    status text CHECK (status IN ('pending', 'processing', 'completed', 'error', 'rejected')),
    processing_start timestamp with time zone,
    processing_end timestamp with time zone,
    processing_time_ms integer,
    transit_number text,
    institution_number text,
    amount numeric(12,2),
    payee_name text,
    verification_result text CHECK (status IN ('APPROVE', 'REVIEW', 'REJECT', 'INVESTIGATE')),
    risk_score integer CHECK (risk_score >= 0 AND risk_score <= 100),
    osfi_reportable boolean DEFAULT false,
    error_message text,
    result_data jsonb,
    metadata jsonb DEFAULT '{}',
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Enhance batch_processing table with additional fields (if it already exists)
DO $$ 
BEGIN
    -- Add columns if they don't exist
    BEGIN
        ALTER TABLE public.batch_processing ADD COLUMN success_count integer DEFAULT 0;
    EXCEPTION
        WHEN duplicate_column THEN -- Column already exists
    END;
    
    BEGIN
        ALTER TABLE public.batch_processing ADD COLUMN error_count integer DEFAULT 0;
    EXCEPTION
        WHEN duplicate_column THEN -- Column already exists
    END;
    
    BEGIN
        ALTER TABLE public.batch_processing ADD COLUMN osfi_reportable_count integer DEFAULT 0;
    EXCEPTION
        WHEN duplicate_column THEN -- Column already exists
    END;
    
    BEGIN
        ALTER TABLE public.batch_processing ADD COLUMN high_risk_count integer DEFAULT 0;
    EXCEPTION
        WHEN duplicate_column THEN -- Column already exists
    END;
    
    BEGIN
        ALTER TABLE public.batch_processing ADD COLUMN total_amount numeric(14,2);
    EXCEPTION
        WHEN duplicate_column THEN -- Column already exists
    END;
    
    BEGIN
        ALTER TABLE public.batch_processing ADD COLUMN processing_start timestamp with time zone;
    EXCEPTION
        WHEN duplicate_column THEN -- Column already exists
    END;
    
    BEGIN
        ALTER TABLE public.batch_processing ADD COLUMN processing_end timestamp with time zone;
    EXCEPTION
        WHEN duplicate_column THEN -- Column already exists
    END;
    
    BEGIN
        ALTER TABLE public.batch_processing ADD COLUMN average_item_time_ms integer;
    EXCEPTION
        WHEN duplicate_column THEN -- Column already exists
    END;
    
    BEGIN
        ALTER TABLE public.batch_processing ADD COLUMN report_url text;
    EXCEPTION
        WHEN duplicate_column THEN -- Column already exists
    END;
    
    BEGIN
        ALTER TABLE public.batch_processing 
          ALTER COLUMN status TYPE text,
          ALTER COLUMN status SET DEFAULT 'queued';
    EXCEPTION
        WHEN others THEN -- Failed to alter (might not exist or other issue)
    END;
END $$;

-- Enable RLS
ALTER TABLE batch_cheques ENABLE ROW LEVEL SECURITY;

-- Policies for batch_cheques
CREATE POLICY "Allow service role full access to batch_cheques"
    ON batch_cheques
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow authenticated users to read batch_cheques"
    ON batch_cheques
    FOR SELECT
    TO authenticated
    USING (true);

-- Add update policy for authenticated users (for systems where operators can override/update results)
CREATE POLICY "Allow authenticated users to update their batch cheques"
    ON batch_cheques
    FOR UPDATE
    TO authenticated
    USING (EXISTS (
      SELECT 1 
      FROM batch_processing bp 
      WHERE bp.batch_id = batch_cheques.batch_id 
      AND bp.metadata->>'userId' = auth.uid()::text
    ))
    WITH CHECK (EXISTS (
      SELECT 1 
      FROM batch_processing bp 
      WHERE bp.batch_id = batch_cheques.batch_id 
      AND bp.metadata->>'userId' = auth.uid()::text
    ));

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_batch_cheques_batch_id ON batch_cheques(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_cheques_cheque_id ON batch_cheques(cheque_id);
CREATE INDEX IF NOT EXISTS idx_batch_cheques_status ON batch_cheques(status);
CREATE INDEX IF NOT EXISTS idx_batch_cheques_institution_number ON batch_cheques(institution_number) 
  WHERE institution_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_batch_cheques_risk_score ON batch_cheques(risk_score);
CREATE INDEX IF NOT EXISTS idx_batch_cheques_osfi_reportable ON batch_cheques(osfi_reportable) 
  WHERE osfi_reportable = true;
CREATE INDEX IF NOT EXISTS idx_batch_cheques_amount ON batch_cheques(amount);
CREATE INDEX IF NOT EXISTS idx_batch_cheques_created_at ON batch_cheques(created_at);

-- Trigger for updated_at
CREATE TRIGGER update_batch_cheques_updated_at
    BEFORE UPDATE ON batch_cheques
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();