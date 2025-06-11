// Shared utilities for Canadian financial institution operations
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface CanadianInstitution {
  institutionNumber: string
  name: string
  commonName: string
  shortName: string
  type: 'Bank' | 'Credit Union' | 'Trust Company' | 'Caisse Populaire' | 'Government'
  regulatoryBody: 'OSFI' | 'Provincial' | 'CUDIC' | 'DICO'
  status: 'Active' | 'Merged' | 'Closed' | 'Acquired'
  cdic: boolean
  assets: string
  depositInsurance: string
  headquarters: string
  website: string
  customerService: string
  primaryProvinces: string[]
  branches: number
  founded: number
  swiftCode?: string
  cdicCode: string
  specialNotes?: string
  riskProfile: 'Low' | 'Medium' | 'High'
  complianceLevel: 'Standard' | 'Enhanced' | 'Special'
  verificationPhone?: string
  fraudReportingPhone?: string
}

export interface InstitutionValidationResult {
  isValid: boolean
  institution: CanadianInstitution | null
  message: string
  riskLevel: 'low' | 'medium' | 'high'
  complianceNotes: string[]
  bankingGuidance: string[]
}

// Initialize Supabase client
function createSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration for institution lookup')
  }
  
  return createClient(supabaseUrl, supabaseServiceKey)
}

// Canadian institution codes mapping
export const CANADIAN_INSTITUTION_CODES: Record<string, string> = {
  '001': 'Bank of Montreal (BMO)',
  '002': 'The Bank of Nova Scotia (Scotiabank)',
  '003': 'Royal Bank of Canada (RBC)',
  '004': 'The Toronto-Dominion Bank (TD)',
  '006': 'National Bank of Canada',
  '010': 'Canadian Imperial Bank of Commerce (CIBC)',
  '016': 'HSBC Bank Canada',
  '030': 'Canadian Western Bank',
  '039': 'Laurentian Bank of Canada',
  '117': 'Government of Canada (Receiver General)',
  '177': 'Bank of Canada',
  '540': 'Manitoba Credit Unions',
  '614': 'Tangerine Bank',
  '809': 'PC Financial',
  '815': 'Desjardins Group',
  '828': 'Vancouver City Savings Credit Union',
  '829': 'Meridian Credit Union',
  '837': 'Servus Credit Union'
}

// Province codes for branch location determination
export const PROVINCE_BRANCH_MAP: Record<string, string> = {
  '0': 'British Columbia & Yukon',
  '1': 'Western Canada (Alberta, Saskatchewan, Manitoba)',
  '2': 'Ontario (Toronto & Central Ontario)',
  '3': 'Ontario (Southwestern & Eastern Ontario)',
  '4': 'Ontario (Northern Ontario & other regions)',
  '5': 'Quebec',
  '6': 'Atlantic Canada (Nova Scotia, New Brunswick)',
  '7': 'Atlantic Canada (PEI, Newfoundland & Labrador)',
  '8': 'Atlantic Canada (Other regions)',
  '9': 'Territories (NWT, Nunavut) & specialized branches'
}

/**
 * Validates a Canadian transit number using CPA Standard 006 checksum algorithm
 */
export function validateCanadianTransitNumber(transitNumber: string): {
  valid: boolean
  errors: string[]
  branchCode?: string
  institutionCode?: string
  checkDigit?: string
} {
  const errors: string[] = []
  
  if (!transitNumber || typeof transitNumber !== 'string') {
    errors.push('Transit number is required')
    return { valid: false, errors }
  }
  
  if (!/^\d{9}$/.test(transitNumber)) {
    errors.push('Transit number must be exactly 9 digits')
    return { valid: false, errors }
  }
  
  const branchCode = transitNumber.substring(0, 5)
  const institutionCode = transitNumber.substring(5, 8)
  const checkDigit = transitNumber.substring(8, 9)
  
  // CPA checksum validation
  const digits = transitNumber.split('').map(Number)
  const weights = [1, 7, 3, 1, 7, 3, 1, 7, 3]
  const sum = digits.reduce((acc, digit, index) => acc + digit * weights[index], 0)
  
  if (sum % 10 !== 0) {
    errors.push('Invalid transit number checksum per CPA Standard 006')
  }
  
  return {
    valid: errors.length === 0,
    errors,
    branchCode,
    institutionCode,
    checkDigit
  }
}

/**
 * Looks up institution details from database
 */
export async function lookupInstitution(institutionCode: string): Promise<CanadianInstitution | null> {
  try {
    const supabase = createSupabaseClient()
    
    const { data, error } = await supabase
      .from('financial_institutions')
      .select('*')
      .eq('institution_number', institutionCode)
      .single()

    if (error) {
      console.warn(`Institution lookup failed for code ${institutionCode}:`, error)
      return null
    }

    // Transform database result to CanadianInstitution interface
    return {
      institutionNumber: data.institution_number,
      name: data.name,
      commonName: data.common_name,
      shortName: data.short_name || data.common_name,
      type: data.type,
      regulatoryBody: data.regulatory_body,
      status: data.status,
      cdic: data.cdic_insured,
      assets: data.assets,
      depositInsurance: data.deposit_insurance,
      headquarters: data.headquarters,
      website: data.website,
      customerService: data.customer_service,
      primaryProvinces: data.primary_provinces || [],
      branches: data.branches || 0,
      founded: data.founded,
      swiftCode: data.swift_code,
      cdicCode: data.cdic_code,
      specialNotes: data.special_notes,
      riskProfile: data.risk_profile,
      complianceLevel: data.compliance_level,
      verificationPhone: data.verification_phone,
      fraudReportingPhone: data.fraud_reporting_phone
    }
  } catch (error) {
    console.error('Error looking up institution:', error)
    return null
  }
}

/**
 * Validates institution status and generates compliance guidance
 */
export function validateInstitutionStatus(institution: CanadianInstitution): InstitutionValidationResult {
  const complianceNotes: string[] = []
  const bankingGuidance: string[] = []
  let riskLevel: 'low' | 'medium' | 'high' = 'low'

  // Check institution status
  if (institution.status === 'Closed') {
    return {
      isValid: false,
      institution,
      message: `Institution ${institution.commonName} is CLOSED and no longer operational`,
      riskLevel: 'high',
      complianceNotes: ["Institution permanently closed", "Do not process items"],
      bankingGuidance: ["Reject item immediately", "Contact customer for alternative payment"]
    }
  }

  if (institution.status === 'Acquired' || institution.status === 'Merged') {
    riskLevel = 'medium'
    complianceNotes.push(`Institution ${institution.status.toLowerCase()} - verify current processing arrangements`)
    bankingGuidance.push('Confirm current processing channels with acquiring institution')
  }

  // CDIC insurance status
  if (institution.cdic) {
    complianceNotes.push('CDIC insured institution')
  } else {
    riskLevel = 'medium'
    complianceNotes.push(`Non-CDIC institution - insured by ${institution.depositInsurance}`)
    bankingGuidance.push(`Verify ${institution.depositInsurance} coverage limits`)
  }

  // Regulatory oversight
  complianceNotes.push(`Regulated by ${institution.regulatoryBody}`)
  if (institution.regulatoryBody === 'Provincial') {
    bankingGuidance.push('Apply provincial regulatory requirements as applicable')
  }

  // Risk profile assessment
  if (institution.riskProfile === 'High') {
    riskLevel = 'high'
    complianceNotes.push('High-risk institution - enhanced due diligence required')
  } else if (institution.riskProfile === 'Medium') {
    riskLevel = riskLevel === 'high' ? 'high' : 'medium'
    complianceNotes.push('Medium-risk institution - standard enhanced monitoring')
  }

  // Compliance level requirements
  if (institution.complianceLevel === 'Enhanced' || institution.complianceLevel === 'Special') {
    riskLevel = riskLevel === 'low' ? 'medium' : riskLevel
    complianceNotes.push(`Requires ${institution.complianceLevel.toLowerCase()} compliance monitoring`)
    bankingGuidance.push(`Apply ${institution.complianceLevel.toLowerCase()} due diligence procedures`)
  }

  return {
    isValid: institution.status === 'Active' || institution.status === 'Acquired' || institution.status === 'Merged',
    institution,
    message: `Institution validated: ${institution.commonName} (${institution.institutionNumber})`,
    riskLevel,
    complianceNotes,
    bankingGuidance
  }
}

/**
 * Searches institutions by name or code
 */
export async function searchInstitutions(query: string, limit: number = 10): Promise<CanadianInstitution[]> {
  try {
    const supabase = createSupabaseClient()
    
    const { data, error } = await supabase
      .from('financial_institutions')
      .select('*')
      .or(`common_name.ilike.%${query}%, name.ilike.%${query}%, institution_number.eq.${query}`)
      .eq('status', 'Active')
      .limit(limit)

    if (error) {
      console.error('Institution search error:', error)
      return []
    }

    return data.map(transformDbToInstitution)
  } catch (error) {
    console.error('Error searching institutions:', error)
    return []
  }
}

/**
 * Gets branch location from branch code
 */
export function getBranchLocation(branchCode: string): string | null {
  if (!branchCode || branchCode.length !== 5) return null
  
  const firstDigit = branchCode.substring(0, 1)
  return PROVINCE_BRANCH_MAP[firstDigit] || 'Region Undetermined / Specialized Branch'
}

/**
 * Maps institution name to institution code
 */
export function mapInstitutionNameToCode(institutionName: string | null): string | null {
  if (!institutionName) return null
  
  const nameToCode: Record<string, string> = {
    'royal bank': '003',
    'rbc': '003',
    'td': '004',
    'toronto-dominion': '004',
    'bmo': '001',
    'bank of montreal': '001',
    'scotiabank': '002',
    'scotia': '002',
    'cibc': '010',
    'national bank': '006',
    'hsbc': '016',
    'tangerine': '614',
    'desjardins': '815'
  }
  
  const lowerName = institutionName.toLowerCase()
  for (const [key, code] of Object.entries(nameToCode)) {
    if (lowerName.includes(key)) {
      return code
    }
  }
  
  return null
}

/**
 * Updates institution detection statistics
 */
export async function updateInstitutionStatistics(
  institutionNumber: string,
  detectionData: {
    confidence: string
    riskAssessment: string
    successful: boolean
  }
): Promise<void> {
  try {
    const supabase = createSupabaseClient()
    
    // Get current statistics
    const { data: existing } = await supabase
      .from('institution_statistics')
      .select('*')
      .eq('institution_number', institutionNumber)
      .single()

    const now = new Date().toISOString()
    
    if (existing) {
      // Update existing record
      const newTotalDetections = existing.total_detections + 1
      const newSuccessfulDetections = existing.successful_detections + (detectionData.successful ? 1 : 0)
      
      await supabase
        .from('institution_statistics')
        .update({
          total_detections: newTotalDetections,
          successful_detections: newSuccessfulDetections,
          last_detection: now,
          confidence_scores: [...(existing.confidence_scores || []), detectionData.confidence],
          risk_assessments: [...(existing.risk_assessments || []), detectionData.riskAssessment]
        })
        .eq('institution_number', institutionNumber)
    } else {
      // Create new record
      await supabase
        .from('institution_statistics')
        .insert({
          institution_number: institutionNumber,
          total_detections: 1,
          successful_detections: detectionData.successful ? 1 : 0,
          last_detection: now,
          confidence_scores: [detectionData.confidence],
          risk_assessments: [detectionData.riskAssessment]
        })
    }
  } catch (error) {
    console.error('Failed to update institution statistics:', error)
    // Don't throw - this is non-critical
  }
}

// Helper function to transform database record to CanadianInstitution
function transformDbToInstitution(data: any): CanadianInstitution {
  return {
    institutionNumber: data.institution_number,
    name: data.name,
    commonName: data.common_name,
    shortName: data.short_name || data.common_name,
    type: data.type,
    regulatoryBody: data.regulatory_body,
    status: data.status,
    cdic: data.cdic_insured,
    assets: data.assets,
    depositInsurance: data.deposit_insurance,
    headquarters: data.headquarters,
    website: data.website,
    customerService: data.customer_service,
    primaryProvinces: data.primary_provinces || [],
    branches: data.branches || 0,
    founded: data.founded,
    swiftCode: data.swift_code,
    cdicCode: data.cdic_code,
    specialNotes: data.special_notes,
    riskProfile: data.risk_profile,
    complianceLevel: data.compliance_level,
    verificationPhone: data.verification_phone,
    fraudReportingPhone: data.fraud_reporting_phone
  }
}