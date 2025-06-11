import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders, handleCorsPreflightRequest, createCorsResponse, createErrorResponse, createSecureResponse } from '../_shared/cors.ts'
import { initializeGemini, parseJsonResponse, BankingPrompts } from '../_shared/gemini.ts'
import { logComplianceActivity, generateComplianceId, createSupabaseClient } from '../_shared/compliance.ts'
import { performSecurityCheck, getSecurityContext } from '../_shared/security.ts'
import { validateRequest, institutionDetectionSchema, sanitizeChequeInput } from '../_shared/validation.ts'
import { ApiError } from '../_shared/utils.ts'

interface InstitutionDetectionRequest {
  imageBase64: string
  transitNumber?: string
  institutionHint?: string // Optional hint about expected institution
  userId?: string
  sessionId?: string
  includeDatabaseLookup?: boolean // Whether to perform database validation
}

interface CanadianInstitution {
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

interface InstitutionValidationResult {
  isValid: boolean
  institution: CanadianInstitution | null
  message: string
  riskLevel: 'low' | 'medium' | 'high'
  complianceNotes: string[]
  bankingGuidance: string[]
}

interface InstitutionDetectionResult {
  // AI Visual Detection Results
  visualDetection: {
    recognizedInstitutionName: string | null
    confidenceScore: number | null
    institutionTypeGuess: 'Bank' | 'Credit Union' | 'Government' | 'Other' | null
    countryOfOrigin: 'Canada' | 'USA' | 'Other' | 'Unknown' | null
    visualElementsUsed: string[]
    logoDetected: boolean
    brandingElements: string[]
  }

  // MICR-Based Validation
  micrValidation: {
    institutionCode: string | null
    transitNumber: string | null
    micrInstitutionName: string | null
    validationMatch: boolean
    checksumValid: boolean | null
  } | null

  // Database Validation Results
  databaseValidation: InstitutionValidationResult | null

  // Overall Assessment
  overallAssessment: {
    institutionConfirmed: boolean
    finalInstitutionName: string | null
    finalInstitutionNumber: string | null
    confidenceLevel: 'High' | 'Medium' | 'Low'
    riskAssessment: 'Low' | 'Medium' | 'High' | 'Critical'
    recommendedActions: string[]
  }

  // Regulatory Compliance
  regulatoryStatus: {
    osfiRegulated: boolean | null
    cdicInsured: boolean | null
    provincialRegulation: string | null
    complianceLevel: 'Standard' | 'Enhanced' | 'Special' | null
    specialConsiderations: string[]
  }

  // Operational Guidance
  operationalGuidance: {
    verificationRequired: boolean
    manualReviewRecommended: boolean
    contactInformation: {
      customerService?: string
      verificationPhone?: string
      fraudReporting?: string
    }
    processingRecommendations: string[]
  }

  // Metadata
  detectionId: string
  processingTime: number
  timestamp: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest()
  }

  const startTime = Date.now()
  let detectionId: string | null = null
  
  try {
    if (req.method !== 'POST') {
      return createErrorResponse('Method not allowed', 405, 'METHOD_NOT_ALLOWED')
    }

    // Parse and validate request
    const requestData: InstitutionDetectionRequest = await req.json()
    detectionId = generateComplianceId()

    // Security and validation checks
    const securityCheck = await performSecurityCheck(req, requestData, {
      endpoint: 'detect-institution',
      rateLimit: { windowMs: 60000, maxRequests: 30 },
      allowedOrigins: ['*']
    })

    if (!securityCheck.passed) {
      return createErrorResponse(securityCheck.reason || 'Security check failed', 403, 'SECURITY_CHECK_FAILED')
    }

    validateRequest(req, requestData, institutionDetectionSchema, {
      maxSize: 50 * 1024 * 1024 // 50MB
    })

    // Sanitize input data
    const sanitizedData = {
      ...requestData,
      institutionHint: requestData.institutionHint ? sanitizeString(requestData.institutionHint) : undefined
    }

    // Perform comprehensive institution detection
    const result = await performInstitutionDetection(sanitizedData, detectionId)
    
    const processingTime = Date.now() - startTime
    result.processingTime = processingTime

    // Determine risk level for compliance logging
    const riskLevel = mapRiskAssessmentToCompliance(result.overallAssessment.riskAssessment)

    // Log compliance activity
    await logComplianceActivity({
      operation: 'detect-institution-enhanced',
      user_id: sanitizedData.userId,
      request_data: { 
        detectionId,
        hasImageData: !!sanitizedData.imageBase64,
        hasTransitNumber: !!sanitizedData.transitNumber,
        hasInstitutionHint: !!sanitizedData.institutionHint,
        sessionId: sanitizedData.sessionId
      },
      response_data: { 
        institutionConfirmed: result.overallAssessment.institutionConfirmed,
        finalInstitutionName: result.overallAssessment.finalInstitutionName || 'Unknown',
        confidenceLevel: result.overallAssessment.confidenceLevel,
        osfiRegulated: result.regulatoryStatus.osfiRegulated,
        verificationRequired: result.operationalGuidance.verificationRequired
      },
      processing_time_ms: processingTime,
      risk_level: riskLevel,
      osfi_reportable: result.overallAssessment.riskAssessment === 'Critical',
      created_at: new Date().toISOString()
    })

    // Update institution statistics in database
    if (result.databaseValidation?.institution) {
      await updateInstitutionStatistics(result.databaseValidation.institution.institutionNumber, result)
    }

    return createSecureResponse(result, 200, {
      customHeaders: {
        'X-Detection-ID': detectionId,
        'X-Confidence-Level': result.overallAssessment.confidenceLevel,
        'X-Risk-Assessment': result.overallAssessment.riskAssessment
      },
      includeSecurityHeaders: true
    })

  } catch (error) {
    console.error('Error in detect-institution function:', error)
    
    const processingTime = Date.now() - startTime
    
    // Log error for compliance tracking
    if (detectionId) {
      await logComplianceActivity({
        operation: 'detect-institution-enhanced',
        request_data: { error: true, detectionId },
        response_data: { error: error instanceof Error ? error.message : 'Unknown error' },
        processing_time_ms: processingTime,
        risk_level: 'High', // Errors are high risk
        osfi_reportable: true, // System errors may require reporting
        created_at: new Date().toISOString()
      })
    }

    if (error instanceof ApiError) {
      return createErrorResponse(error.message, error.statusCode, error.code)
    }

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error occurred',
      500,
      'INSTITUTION_DETECTION_ERROR'
    )
  }
})

async function performInstitutionDetection(
  requestData: InstitutionDetectionRequest, 
  detectionId: string
): Promise<InstitutionDetectionResult> {
  
  const result: InstitutionDetectionResult = {
    visualDetection: {
      recognizedInstitutionName: null,
      confidenceScore: null,
      institutionTypeGuess: null,
      countryOfOrigin: null,
      visualElementsUsed: [],
      logoDetected: false,
      brandingElements: []
    },
    micrValidation: null,
    databaseValidation: null,
    overallAssessment: {
      institutionConfirmed: false,
      finalInstitutionName: null,
      finalInstitutionNumber: null,
      confidenceLevel: 'Low',
      riskAssessment: 'Medium',
      recommendedActions: []
    },
    regulatoryStatus: {
      osfiRegulated: null,
      cdicInsured: null,
      provincialRegulation: null,
      complianceLevel: null,
      specialConsiderations: []
    },
    operationalGuidance: {
      verificationRequired: true,
      manualReviewRecommended: false,
      contactInformation: {},
      processingRecommendations: []
    },
    detectionId,
    processingTime: 0,
    timestamp: new Date().toISOString()
  }

  // 1. Perform AI-based visual institution detection
  if (requestData.imageBase64) {
    const visualResults = await performVisualInstitutionDetection(requestData.imageBase64, requestData.institutionHint)
    result.visualDetection = visualResults
  }

  // 2. Perform MICR-based validation if transit number provided
  if (requestData.transitNumber) {
    result.micrValidation = await performMicrInstitutionValidation(requestData.transitNumber)
  }

  // 3. Database validation and cross-referencing
  if (requestData.includeDatabaseLookup !== false) {
    result.databaseValidation = await performDatabaseValidation(result.visualDetection, result.micrValidation)
  }

  // 4. Synthesize results and generate overall assessment
  generateOverallAssessment(result)

  // 5. Generate regulatory status assessment
  assessRegulatoryStatus(result)

  // 6. Generate operational guidance
  generateOperationalGuidance(result)

  return result
}

async function performVisualInstitutionDetection(imageBase64: string, institutionHint?: string) {
  const model = initializeGemini()
  
  const prompt = `
    ${BankingPrompts.institutionDetection}
    
    Analyze this Canadian cheque image to identify the financial institution using visual elements.
    Focus on logos, branding, design patterns, and institutional identifiers.
    ${institutionHint ? `Hint: Expected institution might be "${institutionHint}"` : ''}
    
    Return ONLY a JSON object with this enhanced structure:
    {
      "recognizedInstitutionName": "string | null",
      "confidenceScore": "number (0-100) | null",
      "institutionTypeGuess": "'Bank' | 'Credit Union' | 'Government' | 'Other' | null",
      "countryOfOrigin": "'Canada' | 'USA' | 'Other' | 'Unknown' | null",
      "visualElementsUsed": ["string"],
      "logoDetected": "boolean",
      "brandingElements": ["string"],
      "designCharacteristics": {
        "colorScheme": "string | null",
        "layoutStyle": "string | null",
        "securityFeatures": ["string"],
        "qualityIndicators": ["string"]
      },
      "riskAssessment": "'Low' | 'Medium' | 'High' | null",
      "osfiRegulated": "boolean | null",
      "institutionWebsite": "string | null",
      "additionalObservations": ["string"]
    }

    Focus on:
    1. **Institution Identification**: Major Canadian banks (RBC, TD, BMO, Scotiabank, CIBC, National Bank)
    2. **Credit Unions**: Provincial credit unions and caisses populaires
    3. **Government**: Federal and provincial government cheques
    4. **Visual Quality**: Assess image quality for reliable identification
    5. **Security Features**: Note any visible security elements that confirm authenticity
    6. **Risk Indicators**: Flag any suspicious visual elements
  `

  const result = await model.generateContent({
    prompt,
    imageBase64
  })

  return parseJsonResponse(result.text, {
    recognizedInstitutionName: null,
    confidenceScore: null,
    institutionTypeGuess: null,
    countryOfOrigin: 'Unknown',
    visualElementsUsed: [],
    logoDetected: false,
    brandingElements: [],
    designCharacteristics: {
      colorScheme: null,
      layoutStyle: null,
      securityFeatures: [],
      qualityIndicators: []
    },
    riskAssessment: 'Medium',
    osfiRegulated: null,
    institutionWebsite: null,
    additionalObservations: []
  }, "performVisualInstitutionDetection")
}

async function performMicrInstitutionValidation(transitNumber: string) {
  if (!/^\d{9}$/.test(transitNumber)) {
    return {
      institutionCode: null,
      transitNumber,
      micrInstitutionName: null,
      validationMatch: false,
      checksumValid: false
    }
  }

  const institutionCode = transitNumber.substring(5, 8)
  const branchCode = transitNumber.substring(0, 5)
  
  // Validate CPA checksum
  const digits = transitNumber.split('').map(Number)
  const weights = [1, 7, 3, 1, 7, 3, 1, 7, 3]
  const sum = digits.reduce((acc, digit, index) => acc + digit * weights[index], 0)
  const checksumValid = sum % 10 === 0

  // Canadian financial institution codes
  const institutionCodes: Record<string, string> = {
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

  const micrInstitutionName = institutionCodes[institutionCode] || null

  return {
    institutionCode,
    transitNumber,
    micrInstitutionName,
    validationMatch: true, // This will be determined during synthesis
    checksumValid
  }
}

async function performDatabaseValidation(
  visualDetection: any,
  micrValidation: any
): Promise<InstitutionValidationResult> {
  
  // Use institution code from MICR if available, otherwise try to map from visual detection
  const institutionCode = micrValidation?.institutionCode || 
    mapInstitutionNameToCode(visualDetection.recognizedInstitutionName)

  if (!institutionCode) {
    return {
      isValid: false,
      institution: null,
      message: "Institution could not be identified for database validation",
      riskLevel: 'high',
      complianceNotes: ["Institution identification failed", "Manual verification required"],
      bankingGuidance: ["Verify institution through alternative methods", "Contact customer for clarification"]
    }
  }

  // Simulate database lookup (in real implementation, this would query the institutions table)
  const institution = await lookupInstitutionInDatabase(institutionCode)
  
  if (!institution) {
    return {
      isValid: false,
      institution: null,
      message: `Institution code ${institutionCode} not found in database`,
      riskLevel: 'high',
      complianceNotes: ["Unknown institution code", "May require special handling"],
      bankingGuidance: ["Verify institution with payments association", "Check for recent institutional changes"]
    }
  }

  // Validate institution status
  const validation = validateInstitutionStatus(institution)
  
  return validation
}

async function lookupInstitutionInDatabase(institutionCode: string): Promise<CanadianInstitution | null> {
  try {
    const supabase = createSupabaseClient()
    
    const { data, error } = await supabase
      .from('financial_institutions')
      .select('*')
      .eq('institution_number', institutionCode)
      .single()

    if (error || !data) {
      // Fallback to hardcoded data for major institutions
      return getHardcodedInstitutionData(institutionCode)
    }

    return data as CanadianInstitution
  } catch (error) {
    console.error('Database lookup error:', error)
    return getHardcodedInstitutionData(institutionCode)
  }
}

function getHardcodedInstitutionData(institutionCode: string): CanadianInstitution | null {
  const institutions: Record<string, CanadianInstitution> = {
    '001': {
      institutionNumber: '001',
      name: 'Bank of Montreal',
      commonName: 'BMO Financial Group',
      shortName: 'BMO',
      type: 'Bank',
      regulatoryBody: 'OSFI',
      status: 'Active',
      cdic: true,
      assets: '$1.3T+',
      depositInsurance: 'CDIC',
      headquarters: 'Montreal, QC',
      website: 'https://www.bmo.com',
      customerService: '1-877-225-5266',
      primaryProvinces: ['All Provinces'],
      branches: 900,
      founded: 1817,
      swiftCode: 'BOFMCAM2',
      cdicCode: 'BMOA',
      riskProfile: 'Low',
      complianceLevel: 'Standard',
      verificationPhone: '1-800-363-9992',
      fraudReportingPhone: '1-877-225-5266',
      specialNotes: "Canada's oldest bank. Strong commercial banking presence."
    },
    '003': {
      institutionNumber: '003',
      name: 'Royal Bank of Canada',
      commonName: 'RBC Royal Bank',
      shortName: 'RBC',
      type: 'Bank',
      regulatoryBody: 'OSFI',
      status: 'Active',
      cdic: true,
      assets: '$2.0T+',
      depositInsurance: 'CDIC',
      headquarters: 'Toronto, ON',
      website: 'https://www.rbcroyalbank.com',
      customerService: '1-800-769-2511',
      primaryProvinces: ['All Provinces'],
      branches: 1200,
      founded: 1864,
      swiftCode: 'ROYCCAT2',
      cdicCode: 'RBCA',
      riskProfile: 'Low',
      complianceLevel: 'Standard',
      verificationPhone: '1-800-769-2566',
      fraudReportingPhone: '1-800-769-2511',
      specialNotes: "Canada's largest bank by market capitalization."
    }
    // Add more institutions as needed
  }

  return institutions[institutionCode] || null
}

function validateInstitutionStatus(institution: CanadianInstitution): InstitutionValidationResult {
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

function generateOverallAssessment(result: InstitutionDetectionResult) {
  let confidence: 'High' | 'Medium' | 'Low' = 'Low'
  let riskAssessment: 'Low' | 'Medium' | 'High' | 'Critical' = 'Medium'
  let institutionConfirmed = false
  let finalInstitutionName: string | null = null
  let finalInstitutionNumber: string | null = null
  const recommendedActions: string[] = []

  // Determine confidence based on multiple validation sources
  const hasVisualDetection = result.visualDetection.recognizedInstitutionName && 
    (result.visualDetection.confidenceScore || 0) > 60

  const hasMicrValidation = result.micrValidation?.checksumValid && 
    result.micrValidation.micrInstitutionName

  const hasDatabaseValidation = result.databaseValidation?.isValid && 
    result.databaseValidation.institution

  if (hasVisualDetection && hasMicrValidation && hasDatabaseValidation) {
    // Check for consistency between sources
    const visualName = result.visualDetection.recognizedInstitutionName?.toLowerCase()
    const micrName = result.micrValidation?.micrInstitutionName?.toLowerCase()
    const dbName = result.databaseValidation?.institution?.commonName?.toLowerCase()

    if (visualName && micrName && dbName && 
        (visualName.includes(dbName) || dbName.includes(visualName))) {
      confidence = 'High'
      institutionConfirmed = true
      finalInstitutionName = result.databaseValidation.institution?.commonName || null
      finalInstitutionNumber = result.databaseValidation.institution?.institutionNumber || null
      riskAssessment = 'Low'
    } else {
      confidence = 'Medium'
      recommendedActions.push('Manual verification required - conflicting institution data')
      riskAssessment = 'Medium'
    }
  } else if ((hasVisualDetection && hasMicrValidation) || 
             (hasVisualDetection && hasDatabaseValidation) || 
             (hasMicrValidation && hasDatabaseValidation)) {
    confidence = 'Medium'
    if (hasDatabaseValidation) {
      finalInstitutionName = result.databaseValidation?.institution?.commonName || null
      finalInstitutionNumber = result.databaseValidation?.institution?.institutionNumber || null
      institutionConfirmed = result.databaseValidation?.isValid || false
    } else if (hasMicrValidation) {
      finalInstitutionName = result.micrValidation?.micrInstitutionName || null
      finalInstitutionNumber = result.micrValidation?.institutionCode || null
    }
    recommendedActions.push('Additional verification recommended')
  } else if (hasVisualDetection || hasMicrValidation || hasDatabaseValidation) {
    confidence = 'Low'
    recommendedActions.push('Manual review required - limited validation data')
    riskAssessment = 'High'
  } else {
    confidence = 'Low'
    riskAssessment = 'Critical'
    recommendedActions.push('Institution could not be identified - reject or investigate')
  }

  // Apply risk factors from database validation
  if (result.databaseValidation?.riskLevel === 'high') {
    riskAssessment = 'Critical'
    recommendedActions.push('High-risk institution - enhanced due diligence required')
  } else if (result.databaseValidation?.riskLevel === 'medium') {
    riskAssessment = riskAssessment === 'Low' ? 'Medium' : riskAssessment
  }

  // Apply visual risk factors
  if (result.visualDetection.riskAssessment === 'High') {
    riskAssessment = 'High'
    recommendedActions.push('Visual analysis indicates elevated risk')
  }

  result.overallAssessment = {
    institutionConfirmed,
    finalInstitutionName,
    finalInstitutionNumber,
    confidenceLevel: confidence,
    riskAssessment,
    recommendedActions
  }
}

function assessRegulatoryStatus(result: InstitutionDetectionResult) {
  const institution = result.databaseValidation?.institution
  
  if (institution) {
    result.regulatoryStatus = {
      osfiRegulated: institution.regulatoryBody === 'OSFI',
      cdicInsured: institution.cdic,
      provincialRegulation: institution.regulatoryBody === 'Provincial' ? 
        institution.headquarters.split(', ')[1] : null,
      complianceLevel: institution.complianceLevel,
      specialConsiderations: institution.specialNotes ? [institution.specialNotes] : []
    }
  } else {
    result.regulatoryStatus = {
      osfiRegulated: result.visualDetection.osfiRegulated,
      cdicInsured: null,
      provincialRegulation: null,
      complianceLevel: null,
      specialConsiderations: ['Institution regulatory status could not be determined']
    }
  }
}

function generateOperationalGuidance(result: InstitutionDetectionResult) {
  const institution = result.databaseValidation?.institution
  let verificationRequired = false
  let manualReviewRecommended = false
  const processingRecommendations: string[] = []
  const contactInformation: any = {}

  // Determine verification requirements
  if (result.overallAssessment.confidenceLevel === 'Low' || 
      result.overallAssessment.riskAssessment === 'High' ||
      result.overallAssessment.riskAssessment === 'Critical') {
    verificationRequired = true
    manualReviewRecommended = true
    processingRecommendations.push('Manual verification required before processing')
  }

  if (result.overallAssessment.confidenceLevel === 'Medium') {
    processingRecommendations.push('Enhanced verification recommended')
  }

  // Add institution-specific guidance
  if (institution) {
    contactInformation.customerService = institution.customerService
    contactInformation.verificationPhone = institution.verificationPhone
    contactInformation.fraudReporting = institution.fraudReportingPhone

    if (institution.status === 'Acquired' || institution.status === 'Merged') {
      processingRecommendations.push('Verify current processing arrangements due to institutional changes')
    }

    if (institution.complianceLevel === 'Enhanced' || institution.complianceLevel === 'Special') {
      manualReviewRecommended = true
      processingRecommendations.push(`Apply ${institution.complianceLevel.toLowerCase()} due diligence procedures`)
    }

    if (!institution.cdic) {
      processingRecommendations.push(`Verify ${institution.depositInsurance} coverage and limits`)
    }
  }

  // Add general guidance based on risk assessment
  if (result.overallAssessment.riskAssessment === 'Critical') {
    processingRecommendations.push('Consider rejecting item pending investigation')
    processingRecommendations.push('Document all findings for compliance review')
  }

  result.operationalGuidance = {
    verificationRequired,
    manualReviewRecommended,
    contactInformation,
    processingRecommendations
  }
}

async function updateInstitutionStatistics(institutionNumber: string, result: InstitutionDetectionResult) {
  try {
    const supabase = createSupabaseClient()
    
    // Update detection statistics
    await supabase
      .from('institution_statistics')
      .upsert({
        institution_number: institutionNumber,
        total_detections: 1, // This would be incremented in real implementation
        last_detection: new Date().toISOString(),
        confidence_scores: [result.overallAssessment.confidenceLevel],
        risk_assessments: [result.overallAssessment.riskAssessment]
      }, {
        onConflict: 'institution_number',
        ignoreDuplicates: false
      })
  } catch (error) {
    console.error('Failed to update institution statistics:', error)
    // Don't throw - this is non-critical
  }
}

// Utility functions
function mapInstitutionNameToCode(institutionName: string | null): string | null {
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
    'hsbc': '016'
  }
  
  const lowerName = institutionName.toLowerCase()
  for (const [key, code] of Object.entries(nameToCode)) {
    if (lowerName.includes(key)) {
      return code
    }
  }
  
  return null
}

function mapRiskAssessmentToCompliance(riskAssessment: string): 'Low' | 'Medium' | 'High' | 'Critical' {
  switch (riskAssessment) {
    case 'Low': return 'Low'
    case 'Medium': return 'Medium'
    case 'High': return 'High'
    case 'Critical': return 'Critical'
    default: return 'Medium'
  }
}

function sanitizeString(input: string, maxLength: number = 100): string {
  return input
    .replace(/[<>]/g, '')
    .replace(/['"]/g, '')
    .trim()
    .substring(0, maxLength)
}