import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders, handleCorsPreflightRequest, createCorsResponse, createErrorResponse } from '../_shared/cors.ts'
import { initializeGemini, parseJsonResponse } from '../_shared/gemini.ts'
import { logComplianceActivity, generateComplianceId, assessOSFIReportability, createSupabaseClient } from '../_shared/compliance.ts'
import { performSecurityCheck, getSecurityContext } from '../_shared/security.ts'
import { validateRequest, complianceAnalysisSchema, sanitizeChequeInput } from '../_shared/validation.ts'

interface ComplianceRequest {
  imageBase64?: string
  chequeData?: {
    transitNumber?: string
    accountNumber?: string
    payeeName?: string
    amountNumerals?: string
    amountWords?: string
    chequeDate?: string
    institutionName?: string
  }
  transactionContext?: {
    customerProfile?: 'individual' | 'business' | 'government'
    transactionType?: 'deposit' | 'withdrawal' | 'transfer'
    channelType?: 'branch' | 'atm' | 'mobile' | 'online'
    relationshipDuration?: number // months
  }
  userId?: string
  sessionId?: string
}

interface ComplianceReport {
  complianceId: string
  overallRiskScore: number // 0-100
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical'
  
  // Specific compliance checks
  osfiCompliance: {
    status: 'compliant' | 'non-compliant' | 'requires-review'
    flags: string[]
    reportingRequired: boolean
    riskScore: number
  }
  
  pipedaCompliance: {
    status: 'compliant' | 'non-compliant' | 'requires-review'
    dataHandlingRequirements: string[]
    consentRequirements: string[]
    riskScore: number
  }
  
  cpaStandard006Compliance: {
    status: 'compliant' | 'non-compliant' | 'requires-review'
    imageQualityFlags: string[]
    micrComplianceFlags: string[]
    riskScore: number
  }
  
  amlChecks: {
    status: 'clear' | 'flagged' | 'requires-investigation'
    suspiciousActivityIndicators: string[]
    thresholdBreaches: string[]
    riskScore: number
  }
  
  // Recommendations
  recommendations: {
    immediateActions: string[]
    documentationRequired: string[]
    escalationPath?: string
    reviewTimeframe: 'immediate' | 'within-24h' | 'within-7d' | 'routine'
  }
  
  // Monitoring flags
  monitoringFlags: {
    requiresManualReview: boolean
    requiresSupervisorApproval: boolean
    requiresComplianceOfficerReview: boolean
    osfiReportingDeadline?: string
  }
  
  processingTime: number
  timestamp: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest()
  }

  const startTime = Date.now()
  let complianceId: string | null = null
  
  try {
    if (req.method !== 'POST') {
      return createErrorResponse('Method not allowed', 405, 'METHOD_NOT_ALLOWED')
    }

    // Parse and validate request
    const requestData: ComplianceRequest = await req.json()
    complianceId = generateComplianceId()

    // Security and validation checks
    const securityCheck = await performSecurityCheck(req, requestData, {
      endpoint: 'analyze-compliance',
      rateLimit: { windowMs: 60000, maxRequests: 50 },
      allowedOrigins: ['*'] // Configure based on your needs
    })

    if (!securityCheck.passed) {
      return createErrorResponse(securityCheck.reason || 'Security check failed', 403, 'SECURITY_CHECK_FAILED')
    }

    validateRequest(req, requestData, complianceAnalysisSchema, {
      maxSize: 50 * 1024 * 1024 // 50MB
    })

    // Sanitize input data
    const sanitizedData = {
      ...requestData,
      chequeData: requestData.chequeData ? sanitizeChequeInput(requestData.chequeData) : undefined
    }

    // Generate comprehensive compliance report
    const complianceReport = await generateComplianceReport(sanitizedData, complianceId)
    
    const processingTime = Date.now() - startTime
    complianceReport.processingTime = processingTime

    // Log compliance activity with enhanced details
    await logComplianceActivity({
      operation: 'analyze-compliance-enhanced',
      user_id: sanitizedData.userId,
      request_data: { 
        complianceId,
        hasImageData: !!sanitizedData.imageBase64,
        hasChequeData: !!sanitizedData.chequeData,
        hasTransactionContext: !!sanitizedData.transactionContext,
        sessionId: sanitizedData.sessionId
      },
      response_data: { 
        overallRiskScore: complianceReport.overallRiskScore,
        riskLevel: complianceReport.riskLevel,
        osfiReportingRequired: complianceReport.osfiCompliance.reportingRequired,
        amlStatus: complianceReport.amlChecks.status,
        requiresManualReview: complianceReport.monitoringFlags.requiresManualReview
      },
      processing_time_ms: processingTime,
      risk_level: complianceReport.riskLevel,
      osfi_reportable: complianceReport.osfiCompliance.reportingRequired,
      created_at: new Date().toISOString()
    })

    // Create audit session entry if sessionId provided
    if (sanitizedData.sessionId) {
      await createAuditSession(sanitizedData.sessionId, sanitizedData.userId, complianceReport)
    }

    return createCorsResponse(complianceReport)

  } catch (error) {
    console.error('Error in analyze-compliance function:', error)
    
    const processingTime = Date.now() - startTime
    
    // Log error for compliance tracking
    if (complianceId) {
      await logComplianceActivity({
        operation: 'analyze-compliance-enhanced',
        request_data: { error: true, complianceId },
        response_data: { error: error instanceof Error ? error.message : 'Unknown error' },
        processing_time_ms: processingTime,
        risk_level: 'High', // Error conditions are high risk
        osfi_reportable: true, // System errors may require reporting
        created_at: new Date().toISOString()
      })
    }

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error occurred',
      500,
      'COMPLIANCE_ANALYSIS_ERROR'
    )
  }
})

async function generateComplianceReport(
  requestData: ComplianceRequest, 
  complianceId: string
): Promise<ComplianceReport> {
  
  const report: ComplianceReport = {
    complianceId,
    overallRiskScore: 0,
    riskLevel: 'Low',
    osfiCompliance: {
      status: 'compliant',
      flags: [],
      reportingRequired: false,
      riskScore: 0
    },
    pipedaCompliance: {
      status: 'compliant',
      dataHandlingRequirements: [],
      consentRequirements: [],
      riskScore: 0
    },
    cpaStandard006Compliance: {
      status: 'compliant',
      imageQualityFlags: [],
      micrComplianceFlags: [],
      riskScore: 0
    },
    amlChecks: {
      status: 'clear',
      suspiciousActivityIndicators: [],
      thresholdBreaches: [],
      riskScore: 0
    },
    recommendations: {
      immediateActions: [],
      documentationRequired: [],
      reviewTimeframe: 'routine'
    },
    monitoringFlags: {
      requiresManualReview: false,
      requiresSupervisorApproval: false,
      requiresComplianceOfficerReview: false
    },
    processingTime: 0,
    timestamp: new Date().toISOString()
  }

  // 1. Perform AI-based image analysis if image provided
  if (requestData.imageBase64) {
    const imageAnalysis = await performImageCompliance(requestData.imageBase64)
    applyImageAnalysisResults(report, imageAnalysis)
  }

  // 2. Perform cheque data analysis
  if (requestData.chequeData) {
    await performChequeDataCompliance(report, requestData.chequeData)
  }

  // 3. Perform AML checks
  await performAMLAnalysis(report, requestData)

  // 4. Apply transaction context analysis
  if (requestData.transactionContext) {
    applyTransactionContextAnalysis(report, requestData.transactionContext)
  }

  // 5. Calculate overall risk score and determine final status
  calculateOverallRisk(report)

  // 6. Generate recommendations based on findings
  generateRecommendations(report)

  return report
}

async function performImageCompliance(imageBase64: string) {
  const model = initializeGemini()
  
  const prompt = `
    Analyze this Canadian cheque image for comprehensive regulatory compliance including OSFI, PIPEDA, and CPA Standard 006.
    Return ONLY a JSON object with detailed compliance assessment:
    {
      "osfiCompliance": {
        "riskLevel": "'Low' | 'Medium' | 'High' | 'Critical'",
        "regulatoryFlags": ["string"],
        "reportingTriggers": ["string"],
        "riskScore": "number (0-100)"
      },
      "pipedaCompliance": {
        "personalDataVisible": "boolean",
        "dataTypes": ["string"],
        "privacyRiskLevel": "'Low' | 'Medium' | 'High'",
        "handlingRequirements": ["string"]
      },
      "cpaStandard006": {
        "imageQualityCompliant": "boolean",
        "micrCompliant": "boolean", 
        "dimensionsCompliant": "boolean",
        "qualityIssues": ["string"],
        "riskScore": "number (0-100)"
      },
      "securityConcerns": {
        "alterationSuspected": "boolean",
        "counterfeitRisk": "'Low' | 'Medium' | 'High'",
        "securityFeatures": ["string"],
        "concerns": ["string"]
      },
      "complianceNotes": ["string"],
      "overallRiskAssessment": "number (0-100)"
    }

    Focus on Canadian banking regulatory requirements and provide specific, actionable compliance insights.
  `

  const result = await model.generateContent([
    { text: prompt },
    {
      inlineData: {
        mimeType: "image/jpeg",
        data: imageBase64
      }
    }
  ])

  const response = await result.response
  const text = response.text()
  
  return parseJsonResponse(text, {
    osfiCompliance: { riskLevel: 'Medium', regulatoryFlags: [], reportingTriggers: [], riskScore: 50 },
    pipedaCompliance: { personalDataVisible: true, dataTypes: [], privacyRiskLevel: 'Medium', handlingRequirements: [] },
    cpaStandard006: { imageQualityCompliant: false, micrCompliant: false, dimensionsCompliant: false, qualityIssues: [], riskScore: 50 },
    securityConcerns: { alterationSuspected: false, counterfeitRisk: 'Medium', securityFeatures: [], concerns: [] },
    complianceNotes: [],
    overallRiskAssessment: 50
  }, "performImageCompliance")
}

function applyImageAnalysisResults(report: ComplianceReport, imageAnalysis: any) {
  // Apply OSFI compliance results
  report.osfiCompliance.riskScore = imageAnalysis.osfiCompliance?.riskScore || 0
  report.osfiCompliance.flags = imageAnalysis.osfiCompliance?.regulatoryFlags || []
  
  if (imageAnalysis.osfiCompliance?.reportingTriggers?.length > 0) {
    report.osfiCompliance.reportingRequired = true
    report.osfiCompliance.status = 'requires-review'
  }

  // Apply PIPEDA compliance results
  if (imageAnalysis.pipedaCompliance?.personalDataVisible) {
    report.pipedaCompliance.dataHandlingRequirements.push('Personal data detected - apply PIPEDA safeguards')
    report.pipedaCompliance.consentRequirements.push('Ensure explicit consent for data processing')
    
    if (imageAnalysis.pipedaCompliance.privacyRiskLevel === 'High') {
      report.pipedaCompliance.status = 'requires-review'
      report.pipedaCompliance.riskScore = 75
    }
  }

  // Apply CPA Standard 006 results
  if (!imageAnalysis.cpaStandard006?.imageQualityCompliant) {
    report.cpaStandard006Compliance.status = 'non-compliant'
    report.cpaStandard006Compliance.imageQualityFlags.push('Image quality below CPA Standard 006 requirements')
  }
  
  if (!imageAnalysis.cpaStandard006?.micrCompliant) {
    report.cpaStandard006Compliance.micrComplianceFlags.push('MICR line quality issues detected')
  }
  
  report.cpaStandard006Compliance.riskScore = imageAnalysis.cpaStandard006?.riskScore || 0
}

async function performChequeDataCompliance(report: ComplianceReport, chequeData: any) {
  // Validate transit number compliance
  if (chequeData.transitNumber) {
    const transitValidation = validateCanadianTransitNumber(chequeData.transitNumber)
    if (!transitValidation.valid) {
      report.cpaStandard006Compliance.micrComplianceFlags.push(...transitValidation.errors)
      report.cpaStandard006Compliance.riskScore += 25
    }
  }

  // Check for suspicious patterns in payee name
  if (chequeData.payeeName) {
    const suspiciousPatterns = [
      /cash/i,
      /bearer/i,
      /\$\$\$/,
      /xxx/i,
      /test/i
    ]
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(chequeData.payeeName)) {
        report.amlChecks.suspiciousActivityIndicators.push(`Suspicious payee name pattern: ${chequeData.payeeName}`)
        report.amlChecks.riskScore += 30
      }
    }
  }

  // Amount validation and AML thresholds
  if (chequeData.amountNumerals) {
    const amount = parseFloat(chequeData.amountNumerals.replace(/[^0-9.]/g, ''))
    
    // Canadian AML reporting thresholds
    if (amount >= 10000) {
      report.amlChecks.thresholdBreaches.push(`Amount exceeds $10,000 CAD reporting threshold`)
      report.amlChecks.riskScore += 40
      report.monitoringFlags.requiresComplianceOfficerReview = true
    }
    
    if (amount >= 3000) {
      report.amlChecks.suspiciousActivityIndicators.push(`Large cash equivalent transaction`)
      report.amlChecks.riskScore += 20
    }
  }

  // Date compliance checks
  if (chequeData.chequeDate) {
    const dateCheck = validateChequeDate(chequeData.chequeDate)
    if (!dateCheck.valid) {
      report.cpaStandard006Compliance.imageQualityFlags.push(...dateCheck.errors)
      report.cpaStandard006Compliance.riskScore += 15
    }
  }
}

async function performAMLAnalysis(report: ComplianceReport, requestData: ComplianceRequest) {
  // Check against known risk indicators
  const riskFactors = []

  // High-value transaction monitoring
  if (requestData.chequeData?.amountNumerals) {
    const amount = parseFloat(requestData.chequeData.amountNumerals.replace(/[^0-9.]/g, ''))
    
    // Structured transaction detection
    if (amount >= 9000 && amount < 10000) {
      riskFactors.push('Potential structuring - amount just below reporting threshold')
      report.amlChecks.riskScore += 50
    }
  }

  // Customer profile risk assessment
  if (requestData.transactionContext?.customerProfile === 'business') {
    // Enhanced due diligence for business accounts
    report.amlChecks.suspiciousActivityIndicators.push('Business account - enhanced monitoring required')
    report.amlChecks.riskScore += 10
  }

  // Transaction pattern analysis
  if (requestData.transactionContext?.relationshipDuration && requestData.transactionContext.relationshipDuration < 6) {
    riskFactors.push('New customer relationship - enhanced monitoring')
    report.amlChecks.riskScore += 15
  }

  // Apply risk factors
  if (riskFactors.length > 0) {
    report.amlChecks.suspiciousActivityIndicators.push(...riskFactors)
  }

  // Determine AML status
  if (report.amlChecks.riskScore >= 70) {
    report.amlChecks.status = 'requires-investigation'
    report.monitoringFlags.requiresComplianceOfficerReview = true
  } else if (report.amlChecks.riskScore >= 40) {
    report.amlChecks.status = 'flagged'
    report.monitoringFlags.requiresManualReview = true
  }
}

function applyTransactionContextAnalysis(report: ComplianceReport, context: any) {
  // Channel-based risk assessment
  if (context.channelType === 'online' || context.channelType === 'mobile') {
    report.osfiCompliance.riskScore += 10
    report.osfiCompliance.flags.push('Digital channel transaction - enhanced verification required')
  }

  // Transaction type risk
  if (context.transactionType === 'withdrawal' && context.channelType !== 'branch') {
    report.amlChecks.riskScore += 15
    report.amlChecks.suspiciousActivityIndicators.push('Non-branch withdrawal - verify identity')
  }
}

function calculateOverallRisk(report: ComplianceReport) {
  // Weight different compliance areas
  const weights = {
    osfi: 0.4,      // 40% - Most critical for Canadian banking
    aml: 0.3,       // 30% - Critical for regulatory compliance  
    cpa: 0.2,       // 20% - Important for operational compliance
    pipeda: 0.1     // 10% - Important for privacy compliance
  }

  report.overallRiskScore = Math.round(
    (report.osfiCompliance.riskScore * weights.osfi) +
    (report.amlChecks.riskScore * weights.aml) +
    (report.cpaStandard006Compliance.riskScore * weights.cpa) +
    (report.pipedaCompliance.riskScore * weights.pipeda)
  )

  // Determine overall risk level
  if (report.overallRiskScore >= 80) {
    report.riskLevel = 'Critical'
  } else if (report.overallRiskScore >= 60) {
    report.riskLevel = 'High'
  } else if (report.overallRiskScore >= 30) {
    report.riskLevel = 'Medium'
  } else {
    report.riskLevel = 'Low'
  }

  // OSFI reporting requirement (scores >= 70)
  if (report.overallRiskScore >= 70) {
    report.osfiCompliance.reportingRequired = true
    report.monitoringFlags.osfiReportingDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
  }
}

function generateRecommendations(report: ComplianceReport) {
  // Critical risk actions
  if (report.riskLevel === 'Critical') {
    report.recommendations.immediateActions.push('IMMEDIATE: Hold transaction pending investigation')
    report.recommendations.immediateActions.push('Notify compliance officer immediately')
    report.recommendations.reviewTimeframe = 'immediate'
    report.monitoringFlags.requiresComplianceOfficerReview = true
  }

  // High risk actions
  if (report.riskLevel === 'High') {
    report.recommendations.immediateActions.push('Route to supervisor for approval')
    report.recommendations.reviewTimeframe = 'within-24h'
    report.monitoringFlags.requiresSupervisorApproval = true
  }

  // OSFI reporting requirements
  if (report.osfiCompliance.reportingRequired) {
    report.recommendations.immediateActions.push('Prepare OSFI incident report')
    report.recommendations.documentationRequired.push('Document all risk factors and mitigation steps')
    report.recommendations.escalationPath = 'Compliance Officer → OSFI Reporting'
  }

  // AML-specific recommendations
  if (report.amlChecks.status === 'requires-investigation') {
    report.recommendations.immediateActions.push('Initiate AML investigation procedures')
    report.recommendations.documentationRequired.push('Complete enhanced due diligence documentation')
  }

  // CPA compliance recommendations
  if (report.cpaStandard006Compliance.status === 'non-compliant') {
    report.recommendations.immediateActions.push('Request higher quality image or physical cheque verification')
    report.recommendations.documentationRequired.push('Note image quality issues in transaction record')
  }

  // PIPEDA recommendations
  if (report.pipedaCompliance.status === 'requires-review') {
    report.recommendations.documentationRequired.push('Verify customer consent for data processing')
    report.recommendations.documentationRequired.push('Apply enhanced data protection measures')
  }

  // General monitoring flags
  if (report.overallRiskScore >= 50) {
    report.monitoringFlags.requiresManualReview = true
  }
}

// Helper functions
function validateCanadianTransitNumber(transitNumber: string): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (!/^\d{9}$/.test(transitNumber)) {
    errors.push('Transit number must be exactly 9 digits')
    return { valid: false, errors }
  }
  
  // CPA checksum validation
  const digits = transitNumber.split('').map(Number)
  const weights = [1, 7, 3, 1, 7, 3, 1, 7, 3]
  const sum = digits.reduce((acc, digit, index) => acc + digit * weights[index], 0)
  
  if (sum % 10 !== 0) {
    errors.push('Invalid transit number checksum per CPA Standard 006')
  }
  
  return { valid: errors.length === 0, errors }
}

function validateChequeDate(dateString: string): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  try {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) {
      errors.push('Invalid date format')
      return { valid: false, errors }
    }
    
    const now = new Date()
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate())
    const oneYearFromNow = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())
    
    if (date < sixMonthsAgo) {
      errors.push('Cheque is stale-dated (over 6 months old)')
    }
    
    if (date > oneYearFromNow) {
      errors.push('Cheque date is too far in the future')
    }
  } catch {
    errors.push('Unable to parse cheque date')
  }
  
  return { valid: errors.length === 0, errors }
}

async function createAuditSession(sessionId: string, userId?: string, report?: ComplianceReport) {
  try {
    const supabase = createSupabaseClient()
    
    await supabase
      .from('audit_sessions')
      .upsert({
        session_id: sessionId,
        user_id: userId,
        metadata: {
          complianceAnalysis: {
            overallRiskScore: report?.overallRiskScore,
            riskLevel: report?.riskLevel,
            osfiReportingRequired: report?.osfiCompliance.reportingRequired
          }
        }
      })
  } catch (error) {
    console.error('Failed to create audit session:', error)
  }
}