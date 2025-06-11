/*
  # Create Financial Institutions Tables

  1. New Tables
    - `financial_institutions`
      - `id` (uuid, primary key)
      - `institution_number` (text, unique)
      - `name` (text)
      - `common_name` (text)
      - `type` (text)
      - `status` (text)
      - `regulatory_body` (text)
      - `cdic_insured` (boolean)
      - `headquarters` (text)
      - `website` (text)
      - `customer_service` (text)
      - `risk_profile` (text)
      - `compliance_level` (text)
      - `metadata` (jsonb)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

    - `institution_statistics`
      - `id` (uuid, primary key)
      - `institution_number` (text, unique)
      - `total_detections` (integer)
      - `successful_detections` (integer)
      - `last_detection` (timestamp)
      - `confidence_scores` (jsonb)
      - `risk_assessments` (jsonb)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users and service role

  3. Indexes
    - Performance indexes for lookups
    - Indexes for statistics tracking
*/

-- Financial Institutions Table
CREATE TABLE IF NOT EXISTS public.financial_institutions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_number text UNIQUE NOT NULL,
    name text NOT NULL,
    common_name text NOT NULL,
    short_name text,
    type text CHECK (type IN ('Bank', 'Credit Union', 'Trust Company', 'Caisse Populaire', 'Government')),
    status text CHECK (status IN ('Active', 'Merged', 'Closed', 'Acquired')),
    regulatory_body text CHECK (regulatory_body IN ('OSFI', 'Provincial', 'CUDIC', 'DICO')),
    cdic_insured boolean DEFAULT false,
    assets text,
    deposit_insurance text,
    headquarters text,
    website text,
    customer_service text,
    primary_provinces jsonb DEFAULT '[]',
    branches integer DEFAULT 0,
    founded integer,
    swift_code text,
    cdic_code text,
    risk_profile text CHECK (risk_profile IN ('Low', 'Medium', 'High')),
    compliance_level text CHECK (compliance_level IN ('Standard', 'Enhanced', 'Special')),
    verification_phone text,
    fraud_reporting_phone text,
    special_notes text,
    metadata jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Institution Statistics Table
CREATE TABLE IF NOT EXISTS public.institution_statistics (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_number text UNIQUE NOT NULL,
    total_detections integer DEFAULT 0,
    successful_detections integer DEFAULT 0,
    last_detection timestamptz,
    confidence_scores jsonb DEFAULT '[]',
    risk_assessments jsonb DEFAULT '[]',
    monthly_stats jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE financial_institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_statistics ENABLE ROW LEVEL SECURITY;

-- Policies for financial_institutions
CREATE POLICY "Allow service role full access to financial_institutions"
    ON financial_institutions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow authenticated users to read financial_institutions"
    ON financial_institutions
    FOR SELECT
    TO authenticated
    USING (true);

-- Policies for institution_statistics
CREATE POLICY "Allow service role full access to institution_statistics"
    ON institution_statistics
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow authenticated users to read institution_statistics"
    ON institution_statistics
    FOR SELECT
    TO authenticated
    USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_financial_institutions_number ON financial_institutions(institution_number);
CREATE INDEX IF NOT EXISTS idx_financial_institutions_name ON financial_institutions(common_name);
CREATE INDEX IF NOT EXISTS idx_financial_institutions_type ON financial_institutions(type);
CREATE INDEX IF NOT EXISTS idx_financial_institutions_status ON financial_institutions(status);
CREATE INDEX IF NOT EXISTS idx_financial_institutions_regulatory_body ON financial_institutions(regulatory_body);

CREATE INDEX IF NOT EXISTS idx_institution_statistics_number ON institution_statistics(institution_number);
CREATE INDEX IF NOT EXISTS idx_institution_statistics_last_detection ON institution_statistics(last_detection);
CREATE INDEX IF NOT EXISTS idx_institution_statistics_total_detections ON institution_statistics(total_detections);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to automatically update updated_at
CREATE TRIGGER update_financial_institutions_updated_at
    BEFORE UPDATE ON financial_institutions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_institution_statistics_updated_at
    BEFORE UPDATE ON institution_statistics
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert sample Canadian financial institutions
INSERT INTO financial_institutions (
    institution_number, name, common_name, short_name, type, status, regulatory_body,
    cdic_insured, assets, deposit_insurance, headquarters, website, customer_service,
    primary_provinces, branches, founded, swift_code, cdic_code, risk_profile,
    compliance_level, verification_phone, fraud_reporting_phone, special_notes
) VALUES 
    ('001', 'Bank of Montreal', 'BMO Financial Group', 'BMO', 'Bank', 'Active', 'OSFI',
     true, '$1.3T+', 'CDIC', 'Montreal, QC', 'https://www.bmo.com', '1-877-225-5266',
     '["All Provinces"]', 900, 1817, 'BOFMCAM2', 'BMOA', 'Low', 'Standard',
     '1-800-363-9992', '1-877-225-5266', 'Canada''s oldest bank. Strong commercial banking presence.'),
     
    ('002', 'The Bank of Nova Scotia', 'Scotiabank', 'Scotia', 'Bank', 'Active', 'OSFI',
     true, '$1.4T+', 'CDIC', 'Toronto, ON', 'https://www.scotiabank.com', '1-800-472-6842',
     '["All Provinces"]', 900, 1832, 'NOSCCATT', 'BNSA', 'Low', 'Standard',
     '1-800-4SCOTIA', '1-800-472-6842', 'Significant international presence, particularly in Latin America.'),
     
    ('003', 'Royal Bank of Canada', 'RBC Royal Bank', 'RBC', 'Bank', 'Active', 'OSFI',
     true, '$2.0T+', 'CDIC', 'Toronto, ON', 'https://www.rbcroyalbank.com', '1-800-769-2511',
     '["All Provinces"]', 1200, 1864, 'ROYCCAT2', 'RBCA', 'Low', 'Standard',
     '1-800-769-2566', '1-800-769-2511', 'Canada''s largest bank by market capitalization.'),
     
    ('004', 'The Toronto-Dominion Bank', 'TD Canada Trust', 'TD', 'Bank', 'Active', 'OSFI',
     true, '$1.9T+', 'CDIC', 'Toronto, ON', 'https://www.td.com', '1-866-222-3456',
     '["All Provinces"]', 1000, 1955, 'TDOMCATTTOR', 'TDBA', 'Low', 'Standard',
     '1-800-983-2265', '1-866-222-3456', 'Large U.S. retail presence. Known for customer service hours.'),
     
    ('006', 'National Bank of Canada', 'National Bank', 'NBC', 'Bank', 'Active', 'OSFI',
     true, '$400B+', 'CDIC', 'Montreal, QC', 'https://www.nbc.ca', '1-888-483-5628',
     '["QC", "ON", "NB", "MB", "AB", "BC"]', 370, 1859, 'BNDCCAMMINT', 'NABC', 'Low', 'Standard',
     '1-844-394-8043', '1-888-483-5628', 'Sixth largest bank in Canada. Strong presence in Quebec.'),
     
    ('010', 'Canadian Imperial Bank of Commerce', 'CIBC', 'CIBC', 'Bank', 'Active', 'OSFI',
     true, '$950B+', 'CDIC', 'Toronto, ON', 'https://www.cibc.com', '1-800-465-2422',
     '["All Provinces"]', 1000, 1961, 'CIBCCATT', 'CIBC', 'Low', 'Standard',
     '1-800-465-2422', '1-800-465-2422', 'Strong focus on technology and innovation.'),
     
    ('016', 'HSBC Bank Canada', 'HSBC Canada (Acquired by RBC)', 'HSBC CA', 'Bank', 'Acquired', 'OSFI',
     true, '$120B+', 'CDIC (Transferred to RBC)', 'Vancouver, BC', 'https://www.hsbc.ca', 'Refer to RBC',
     '["BC", "ON", "AB", "QC"]', 0, 1981, 'HKBCCATT', 'HSBC', 'Medium', 'Enhanced',
     null, null, 'Operations fully merged into Royal Bank of Canada as of March 2024.'),
     
    ('030', 'Canadian Western Bank', 'CWB Financial Group', 'CWB', 'Bank', 'Active', 'OSFI',
     true, '$40B+', 'CDIC', 'Edmonton, AB', 'https://www.cwbank.com', '1-866-441-2921',
     '["BC", "AB", "SK", "MB", "ON"]', 40, 1984, 'CWCBCATT', 'CWBA', 'Medium', 'Standard',
     null, null, 'Focused on business banking in Western Canada.'),
     
    ('614', 'Tangerine Bank', 'Tangerine', 'Tangerine', 'Bank', 'Active', 'OSFI',
     true, '$45B+', 'CDIC', 'Toronto, ON', 'https://www.tangerine.ca', '1-888-826-4374',
     '["All Provinces"]', 0, 1997, 'INGCDSM1', 'TNGT', 'Low', 'Standard',
     '1-888-826-4374', '1-888-826-4374', 'Direct bank, subsidiary of Scotiabank. No physical branches.'),
     
    ('815', 'La Caisse Centrale Desjardins du Québec', 'Desjardins Group', 'Desjardins', 'Caisse Populaire', 'Active', 'Provincial',
     false, '$420B+', 'AMF (Quebec)', 'Lévis, QC', 'https://www.desjardins.com', '1-800-224-7737',
     '["QC", "ON"]', 200, 1900, 'CCDQCAMM', 'DESJ', 'Low', 'Enhanced',
     null, null, 'Largest cooperative financial group in Canada. Quebec provincial regulation.')

ON CONFLICT (institution_number) DO NOTHING;