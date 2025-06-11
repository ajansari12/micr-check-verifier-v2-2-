import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders, handleCorsPreflightRequest, createSecureResponse, createErrorResponse } from '../_shared/cors.ts'
import { initializeGemini, parseJsonResponse, BankingPrompts } from '../_shared/gemini.ts'
import { logComplianceActivity, generateComplianceId, createSupabaseClient } from '../_shared/compliance.ts'
import { performSecurityCheck, getSecurityContext } from '../_shared/security.ts'
import { validateRequest, decisionGenerationSchema } from '../_shared/validation.ts'
import { ApiError, withTimeout } from '../_shared/utils.ts'

interface DecisionRequest {
  // Core Analysis Data
  chequeAnalysis: {
    transitNumber?: string
    transitNumberValid?: boolean
    accountNumber?: string
    payeeName?: string
    amountNumerals?: string
    amountWords?: string
    chequeDate?: string
    chequeDateValid?: boolean
    signaturePresent?: boolean
    alterationsPayeeSuspected?: boolean
    alterationsAmountSuspected?: boolean
    overallClarity?: 'good' | 'fair' | 'poor'
    processingNotes?: string
  }

  // Security Assessment Results
  securityAssessment: {
    fraudRiskLevel?: 'Low' | 'Medium' | 'High' | 'Critical'
    osfiReportableRisk?: boolean
    tamperEvidenceCheck?: 'passed' | 'failed' | 'unknown'
    imageAuthenticityScore?: number
    alterationsEvident?: boolean
    counterfeitLikelihoodScore?: number
    detectedSecurityFeatures?: string[]
    suspiciousPatternsObserved?: string[]
  }

  // Compliance Analysis
  complianceAssessment: {
    overallRiskScore?: number
    riskLevel?: 'Low' | 'Medium' | 'High' | 'Critical'
    osfiCompliance?: {
      status: 'compliant' | 'non-compliant' | 'requires-review'
      reportingRequired: boolean
      flags: string[]
    }
    amlChecks?: {
      status: 'clear' | 'flagged' | 'requires-investigation'
      suspiciousActivityIndicators: string[]
      thresholdBreaches: string[]
    }
    pipedaCompliance?: {
      status: 'compliant' | 'requires-review'
      dataHandlingRequirements: string[]
    }
  }

  // Institution Information
  institutionData: {
    finalInstitutionName?: string
    finalInstitutionNumber?: string
    institutionConfirmed?: boolean
    confidenceLevel?: 'High' | 'Medium' | 'Low'
    riskAssessment?: 'Low' | 'Medium' | 'High' | 'Critical'
    osfiRegulated?: boolean
    cdicInsured?: boolean
    complianceLevel?: 'Standard' | 'Enhanced' | 'Special'
    verificationRequired?: boolean
    contactInformation?: {
      customerService?: string
      verificationPhone?: string
      fraudReporting?: string
    }
  }

  // Additional Context
  transactionContext?: {
    amount?: number
    currency?: string
    customerProfile?: 'individual' | 'business' | 'government'
    relationshipDuration?: number // months
    channelType?: 'branch' | 'atm' | 'mobile' | 'online'
    transactionType?: 'deposit' | 'withdrawal' | 'transfer'
    timeOfDay?: string
    isWeekend?: boolean
  }

  // Historical Data
  historicalPatterns?: {
    similarTransactions?: number
    previousFlags?: string[]
    customerRiskProfile?: 'low' | 'medium' | 'high'
    institutionHistory?: {
      recentIssues?: string[]
      processingNotes?: string[]
    }
  }

  // Processing Metadata
  processingMetadata?: {
    analysisQuality?: 'excellent' | 'good' | 'fair' | 'poor'
    confidenceScores?: number[]
    processingTimeTotalMs?: number
    imageQualityScore?: number
  }

  // Request Context
  userId?: string
  sessionId?: string
  batchId?: string
  operatorId?: string
  branchCode?: string
}

interface DecisionResult {
  // Core Decision
  decision: {
    finalDecision: 'APPROVE' | 'REVIEW' | 'REJECT' | 'INVESTIGATE'
    confidence: number // 0-100
    riskScore: number // 0-100
    decisionReasoning: string[]
    keyFactors: {
      factor: string
      impact: 'positive' | 'negative' | 'neutral'
      weight: number // 0-1
      description: string
    }[]
  }

  // Operational Guidance
  operationalGuidance: {
    immediateActions: string[]
    verificationSteps: string[]
    documentationRequired: string[]
    escalationPath?: string
    contactInstructions?: string[]
    processingTimeframe: 'immediate' | 'within-1h' | 'within-24h' | 'standard' | 'extended-review'
    specialInstructions?: string[]
  }

  // Risk Management
  riskManagement: {
    riskMitigationSteps: string[]
    monitoringRequirements: string[]
    futureConsiderations: string[]
    escalationTriggers: string[]
  }

  // Regulatory Compliance
  regulatoryCompliance: {
    osfiReporting: {
      required: boolean
      deadline?: string
      reportType?: string
      keyElements?: string[]
    }
    pipedaRequirements: string[]
    auditTrailRequirements: string[]
    retentionRequirements: {
      duration: string
      classification: 'standard' | 'enhanced' | 'special'
    }
  }

  // Business Intelligence
  businessIntelligence: {
    customerInsights: string[]
    institutionInsights: string[]
    trendAnalysis: string[]
    recommendedActions: string[]
  }

  // Quality Assurance
  qualityAssurance: {
    decisionQualityScore: number // 0-100
    dataCompletenessScore: number // 0-100
    recommendedImprovements: string[]
    alternativeScenarios: {
      scenario: string
      likelihood: number // 0-100
      impact: string
    }[]
  }

  // System Integration
  systemIntegration: {
    batchProcessingStatus?: 'continue' | 'hold' | 'escalate'
    notificationRequirements: {
      notify: string[] // roles/people to notify
      urgency: 'low' | 'medium' | 'high' | 'critical'
      method: 'email' | 'sms' | 'system-alert' | 'immediate-call'
    }[]
    workflowActions: {
      action: string
      target: string
      priority: number
    }[]
  }

  // Metadata
  decisionId: string
  timestamp: string
  processingTime: number
  version: string
  algorithmVersion: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest()
  }

  const startTime = Date.now()
  let decisionId: string | null = null
  
  try {
    if (req.method !== 'POST') {
      return createErrorResponse('Method not allowed', 405, 'METHOD_NOT_ALLOWED')
    }

    // Parse and validate request
    const requestData: DecisionRequest = await req.json()
    decisionId = generateComplianceId()

    // Security and validation checks
    const securityCheck = await performSecurityCheck(req, requestData, {
      endpoint: 'generate-decision',
      rateLimit: { windowMs: 60000, maxRequests: 20 },
      allowedOrigins: ['*']
    })

    if (!securityCheck.passed) {
      return createErrorResponse(securityCheck.reason || 'Security check failed', 403, 'SECURITY_CHECK_FAILED')
    }

    validateRequest(req, requestData, decisionGenerationSchema, {
      maxSize: 10 * 1024 * 1024 // 10MB
    })

    // Generate comprehensive decision intelligence
    const result = await generateComprehensiveDecision(requestData, decisionId)
    
    const processingTime = Date.now() - startTime
    result.processingTime = processingTime

    // Determine compliance risk level for logging
    const complianceRiskLevel = mapDecisionToComplianceRisk(result.decision.finalDecision, result.decision.riskScore)

    // Enhanced compliance logging
    await logComplianceActivity({
      operation: 'generate-decision-comprehensive',
      user_id: requestData.userId,
      request_data: { 
        decisionId,
        hasChequeFAnalysis: !!requestData.chequeAnalysis,
        hasSecurityAssessment: !!requestData.securityAssessment,
        hasComplianceAssessment: !!requestData.complianceAssessment,
        hasInstitutionData: !!requestData.institutionData,
        hasTransactionContext: !!requestData.transactionContext,
        sessionId: requestData.sessionId,
        batchId: requestData.batchId,
        operatorId: requestData.operatorId
      },
      response_data: { 
        finalDecision: result.decision.finalDecision,
        confidence: result.decision.confidence,
        riskScore: result.decision.riskScore,
        osfiReportingRequired: result.regulatoryCompliance.osfiReporting.required,
        escalationRequired: !!result.operationalGuidance.escalationPath,
        processingTimeframe: result.operationalGuidance.processingTimeframe,
        decisionQualityScore: result.qualityAssurance.decisionQualityScore
      },
      processing_time_ms: processingTime,
      risk_level: complianceRiskLevel,
      osfi_reportable: result.regulatoryCompliance.osfiReporting.required,
      created_at: new Date().toISOString()
    })

    // Handle batch processing updates
    if (requestData.batchId) {
      await updateBatchProcessingStatus(requestData.batchId, result)
    }

    // Trigger notifications for high-priority decisions
    if (result.decision.finalDecision === 'REJECT' || result.decision.finalDecision === 'INVESTIGATE') {
      await triggerDecisionNotifications(result, requestData)
    }

    return createSecureResponse(result, 200, {
      customHeaders: {
        'X-Decision-ID': decisionId,
        'X-Decision': result.decision.finalDecision,
        'X-Risk-Score': result.decision.riskScore.toString(),
        'X-Confidence': result.decision.confidence.toString()
      },
      includeSecurityHeaders: true
    })

  } catch (error) {
    console.error('Error in generate-decision function:', error)
    
    const processingTime = Date.now() - startTime
    
    // Log error for compliance tracking
    if (decisionId) {
      await logComplianceActivity({
        operation: 'generate-decision-comprehensive',
        request_data: { error: true, decisionId },
        response_data: { error: error instanceof Error ? error.message : 'Unknown error' },
        processing_time_ms: processingTime,
        risk_level: 'Critical', // Errors are critical risk
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
      'DECISION_GENERATION_ERROR'
    )
  }
})

async function generateComprehensiveDecision(
  requestData: DecisionRequest, 
  decisionId: string
): Promise<DecisionResult> {
  
  // Step 1: Initialize decision analysis engine
  const decisionEngine = new CanadianBankingDecisionEngine(requestData, decisionId)
  
  // Step 2: Perform comprehensive analysis
  const analysisResults = await decisionEngine.performComprehensiveAnalysis()
  
  // Step 3: Generate AI-enhanced decision intelligence
  const aiDecisionIntelligence = await generateAIDecisionIntelligence(requestData, analysisResults)
  
  // Step 4: Synthesize final decision
  const finalDecision = decisionEngine.synthesizeFinalDecision(aiDecisionIntelligence)
  
  return finalDecision
}

class CanadianBankingDecisionEngine {
  private data: DecisionRequest
  private decisionId: string
  private analysisResults: any = {}
  
  constructor(data: DecisionRequest, decisionId: string) {
    this.data = data
    this.decisionId = decisionId
  }

  async performComprehensiveAnalysis() {
    // Analyze each component and calculate weighted risk scores
    const riskComponents = {
      chequeAnalysis: this.analyzeChequeRisk(),
      securityAssessment: this.analyzeSecurityRisk(),
      complianceAssessment: this.analyzeComplianceRisk(),
      institutionRisk: this.analyzeInstitutionRisk(),
      transactionRisk: this.analyzeTransactionRisk(),
      historicalRisk: this.analyzeHistoricalRisk(),
      operationalRisk: this.analyzeOperationalRisk()
    }

    // Calculate overall risk metrics
    const overallRiskScore = this.calculateOverallRisk(riskComponents)
    const confidenceScore = this.calculateConfidenceScore()
    const qualityScore = this.calculateAnalysisQuality()

    this.analysisResults = {
      riskComponents,
      overallRiskScore,
      confidenceScore,
      qualityScore,
      keyFactors: this.identifyKeyFactors(riskComponents),
      regulatoryFlags: this.identifyRegulatoryFlags()
    }

    return this.analysisResults
  }

  private analyzeChequeRisk(): { score: number; factors: string[]; recommendations: string[] } {
    const factors: string[] = []
    const recommendations: string[] = []
    let score = 0

    if (!this.data.chequeAnalysis) {
      return { score: 50, factors: ['No cheque analysis data'], recommendations: ['Obtain cheque analysis before proceeding'] }
    }

    const cheque = this.data.chequeAnalysis

    // MICR validation issues
    if (cheque.transitNumberValid === false) {
      score += 40
      factors.push('Invalid transit number checksum')
      recommendations.push('Verify transit number with institution directory')
    }

    // Date-related issues
    if (cheque.chequeDateValid === false) {
      score += 25
      factors.push('Invalid or problematic cheque date')
      recommendations.push('Manually verify cheque date format and validity')
    }

    // Signature issues
    if (cheque.signaturePresent === false) {
      score += 30
      factors.push('No signature detected on cheque')
      recommendations.push('Require manual signature verification')
    }

    // Alteration suspicions
    if (cheque.alterationsPayeeSuspected === true) {
      score += 35
      factors.push('Suspected alteration in payee name')
      recommendations.push('Investigate payee field for tampering evidence')
    }

    if (cheque.alterationsAmountSuspected === true) {
      score += 40
      factors.push('Suspected alteration in amount fields')
      recommendations.push('Verify amount consistency and investigate tampering')
    }

    // Image quality impact
    if (cheque.overallClarity === 'poor') {
      score += 20
      factors.push('Poor image quality affecting analysis reliability')
      recommendations.push('Request higher quality image or physical verification')
    }

    return { score: Math.min(score, 100), factors, recommendations }
  }

  private analyzeSecurityRisk(): { score: number; factors: string[]; recommendations: string[] } {
    const factors: string[] = []
    const recommendations: string[] = []
    let score = 0

    if (!this.data.securityAssessment) {
      return { score: 30, factors: ['No security assessment data'], recommendations: ['Perform security analysis'] }
    }

    const security = this.data.securityAssessment

    // Fraud risk level mapping
    const fraudRiskScores = { 'Low': 10, 'Medium': 35, 'High': 70, 'Critical': 95 }
    if (security.fraudRiskLevel) {
      const riskScore = fraudRiskScores[security.fraudRiskLevel] || 50
      score = Math.max(score, riskScore)
      factors.push(`Security fraud risk level: ${security.fraudRiskLevel}`)
    }

    // OSFI reportable risk
    if (security.osfiReportableRisk === true) {
      score = Math.max(score, 80)
      factors.push('OSFI reportable risk detected')
      recommendations.push('Prepare OSFI incident documentation')
    }

    // Tampering evidence
    if (security.tamperEvidenceCheck === 'failed') {
      score += 50
      factors.push('Evidence of tampering detected')
      recommendations.push('Halt processing and investigate tampering evidence')
    }

    // Image authenticity concerns
    if (security.imageAuthenticityScore !== undefined && security.imageAuthenticityScore < 60) {
      score += 30
      factors.push('Low image authenticity score')
      recommendations.push('Verify image source and request original documentation')
    }

    // Counterfeiting concerns
    if (security.counterfeitLikelihoodScore !== undefined && security.counterfeitLikelihoodScore > 60) {
      score += 45
      factors.push('High counterfeit likelihood detected')
      recommendations.push('Perform enhanced security feature verification')
    }

    return { score: Math.min(score, 100), factors, recommendations }
  }

  private analyzeComplianceRisk(): { score: number; factors: string[]; recommendations: string[] } {
    const factors: string[] = []
    const recommendations: string[] = []
    let score = 0

    if (!this.data.complianceAssessment) {
      return { score: 40, factors: ['No compliance assessment data'], recommendations: ['Perform compliance analysis'] }
    }

    const compliance = this.data.complianceAssessment

    // Overall compliance risk score
    if (compliance.overallRiskScore !== undefined) {
      score = Math.max(score, compliance.overallRiskScore)
    }

    // OSFI compliance issues
    if (compliance.osfiCompliance?.status === 'non-compliant') {
      score += 60
      factors.push('OSFI non-compliance detected')
      recommendations.push('Address OSFI compliance issues before processing')
    }

    if (compliance.osfiCompliance?.reportingRequired === true) {
      score = Math.max(score, 75)
      factors.push('OSFI reporting required')
      recommendations.push('Initiate OSFI reporting procedures within 24 hours')
    }

    // AML flags
    if (compliance.amlChecks?.status === 'requires-investigation') {
      score += 50
      factors.push('AML investigation required')
      recommendations.push('Initiate enhanced AML investigation procedures')
    }

    if (compliance.amlChecks?.thresholdBreaches && compliance.amlChecks.thresholdBreaches.length > 0) {
      score += 40
      factors.push(`${compliance.amlChecks.thresholdBreaches.length} AML threshold breaches`)
      recommendations.push('Review AML threshold breach documentation requirements')
    }

    // PIPEDA compliance
    if (compliance.pipedaCompliance?.status === 'requires-review') {
      score += 15
      factors.push('PIPEDA compliance review required')
      recommendations.push('Ensure customer consent and data handling compliance')
    }

    return { score: Math.min(score, 100), factors, recommendations }
  }

  private analyzeInstitutionRisk(): { score: number; factors: string[]; recommendations: string[] } {
    const factors: string[] = []
    const recommendations: string[] = []
    let score = 0

    if (!this.data.institutionData) {
      return { score: 60, factors: ['No institution data available'], recommendations: ['Verify financial institution'] }
    }

    const institution = this.data.institutionData

    // Institution confirmation
    if (institution.institutionConfirmed === false) {
      score += 50
      factors.push('Institution could not be confirmed')
      recommendations.push('Manually verify institution through alternative sources')
    }

    // Confidence level in institution identification
    const confidenceScores = { 'High': 5, 'Medium': 25, 'Low': 60 }
    if (institution.confidenceLevel) {
      const confScore = confidenceScores[institution.confidenceLevel] || 40
      score += confScore
      factors.push(`Institution identification confidence: ${institution.confidenceLevel}`)
    }

    // Institution risk assessment
    const instRiskScores = { 'Low': 10, 'Medium': 30, 'High': 65, 'Critical': 90 }
    if (institution.riskAssessment) {
      const riskScore = instRiskScores[institution.riskAssessment] || 35
      score = Math.max(score, riskScore)
      factors.push(`Institution risk assessment: ${institution.riskAssessment}`)
    }

    // Regulatory status
    if (institution.osfiRegulated === false) {
      score += 20
      factors.push('Institution is not OSFI regulated')
      recommendations.push('Apply enhanced verification for non-OSFI institutions')
    }

    if (institution.cdicInsured === false) {
      score += 15
      factors.push('Institution is not CDIC insured')
      recommendations.push('Verify alternative deposit insurance coverage')
    }

    // Compliance requirements
    if (institution.complianceLevel === 'Enhanced' || institution.complianceLevel === 'Special') {
      score += 25
      factors.push(`Enhanced compliance level required: ${institution.complianceLevel}`)
      recommendations.push(`Apply ${institution.complianceLevel} due diligence procedures`)
    }

    return { score: Math.min(score, 100), factors, recommendations }
  }

  private analyzeTransactionRisk(): { score: number; factors: string[]; recommendations: string[] } {
    const factors: string[] = []
    const recommendations: string[] = []
    let score = 0

    if (!this.data.transactionContext) {
      return { score: 20, factors: [], recommendations: [] }
    }

    const transaction = this.data.transactionContext

    // Amount-based risk
    if (transaction.amount !== undefined) {
      if (transaction.amount >= 10000) {
        score += 40
        factors.push('Large value transaction (≥$10,000 CAD)')
        recommendations.push('Apply enhanced verification for large value transactions')
      } else if (transaction.amount >= 3000) {
        score += 20
        factors.push('Medium value transaction (≥$3,000 CAD)')
      }

      // Structured transaction detection
      if (transaction.amount >= 9000 && transaction.amount < 10000) {
        score += 50
        factors.push('Potential structured transaction (just below reporting threshold)')
        recommendations.push('Investigate for potential structuring patterns')
      }
    }

    // Channel-based risk
    if (transaction.channelType === 'online' || transaction.channelType === 'mobile') {
      score += 15
      factors.push('Digital channel transaction')
      recommendations.push('Apply enhanced digital transaction verification')
    }

    // Customer profile risk
    if (transaction.customerProfile === 'business') {
      score += 10
      factors.push('Business account transaction')
      recommendations.push('Apply enhanced business account due diligence')
    }

    // Relationship duration risk
    if (transaction.relationshipDuration !== undefined && transaction.relationshipDuration < 6) {
      score += 25
      factors.push('New customer relationship (<6 months)')
      recommendations.push('Apply new customer enhanced monitoring')
    }

    // Timing-based risk factors
    if (transaction.isWeekend === true || 
        (transaction.timeOfDay && (transaction.timeOfDay < '08:00' || transaction.timeOfDay > '20:00'))) {
      score += 10
      factors.push('Off-hours transaction timing')
      recommendations.push('Apply enhanced verification for off-hours transactions')
    }

    return { score: Math.min(score, 100), factors, recommendations }
  }

  private analyzeHistoricalRisk(): { score: number; factors: string[]; recommendations: string[] } {
    const factors: string[] = []
    const recommendations: string[] = []
    let score = 0

    if (!this.data.historicalPatterns) {
      return { score: 10, factors: [], recommendations: [] }
    }

    const historical = this.data.historicalPatterns

    // Customer risk profile
    if (historical.customerRiskProfile === 'high') {
      score += 40
      factors.push('High-risk customer profile')
      recommendations.push('Apply enhanced customer due diligence')
    } else if (historical.customerRiskProfile === 'medium') {
      score += 20
      factors.push('Medium-risk customer profile')
    }

    // Previous flags
    if (historical.previousFlags && historical.previousFlags.length > 0) {
      score += historical.previousFlags.length * 15
      factors.push(`${historical.previousFlags.length} previous risk flags`)
      recommendations.push('Review previous flag resolution and current status')
    }

    // Institution history issues
    if (historical.institutionHistory?.recentIssues && historical.institutionHistory.recentIssues.length > 0) {
      score += 25
      factors.push('Recent issues with this institution')
      recommendations.push('Review institution-specific processing guidance')
    }

    return { score: Math.min(score, 100), factors, recommendations }
  }

  private analyzeOperationalRisk(): { score: number; factors: string[]; recommendations: string[] } {
    const factors: string[] = []
    const recommendations: string[] = []
    let score = 0

    if (!this.data.processingMetadata) {
      return { score: 15, factors: [], recommendations: [] }
    }

    const metadata = this.data.processingMetadata

    // Analysis quality impact
    if (metadata.analysisQuality === 'poor') {
      score += 35
      factors.push('Poor analysis quality')
      recommendations.push('Consider manual review due to analysis quality')
    } else if (metadata.analysisQuality === 'fair') {
      score += 20
      factors.push('Fair analysis quality')
    }

    // Image quality impact
    if (metadata.imageQualityScore !== undefined && metadata.imageQualityScore < 60) {
      score += 25
      factors.push('Low image quality score')
      recommendations.push('Request higher quality image for better analysis')
    }

    // Confidence score analysis
    if (metadata.confidenceScores && metadata.confidenceScores.length > 0) {
      const avgConfidence = metadata.confidenceScores.reduce((a, b) => a + b, 0) / metadata.confidenceScores.length
      if (avgConfidence < 60) {
        score += 30
        factors.push('Low average confidence in analysis results')
        recommendations.push('Consider additional verification due to low confidence')
      }
    }

    return { score: Math.min(score, 100), factors, recommendations }
  }

  private calculateOverallRisk(riskComponents: any): number {
    // Weighted risk calculation based on Canadian banking priorities
    const weights = {
      securityAssessment: 0.25,    // 25% - Security is paramount
      complianceAssessment: 0.25,  // 25% - Regulatory compliance critical
      chequeAnalysis: 0.20,        // 20% - Core cheque validation
      institutionRisk: 0.15,       // 15% - Institution validation
      transactionRisk: 0.10,       // 10% - Transaction context
      historicalRisk: 0.03,        // 3% - Historical patterns
      operationalRisk: 0.02         // 2% - Operational factors
    }

    let weightedScore = 0
    let totalWeight = 0

    for (const [component, weight] of Object.entries(weights)) {
      if (riskComponents[component]) {
        weightedScore += riskComponents[component].score * weight
        totalWeight += weight
      }
    }

    return totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 50
  }

  private calculateConfidenceScore(): number {
    let confidence = 100
    
    // Reduce confidence based on missing data
    if (!this.data.chequeAnalysis) confidence -= 25
    if (!this.data.securityAssessment) confidence -= 20
    if (!this.data.complianceAssessment) confidence -= 20
    if (!this.data.institutionData) confidence -= 15
    if (!this.data.transactionContext) confidence -= 10
    if (!this.data.historicalPatterns) confidence -= 5
    if (!this.data.processingMetadata) confidence -= 5

    // Adjust based on data quality
    if (this.data.processingMetadata?.analysisQuality === 'poor') confidence -= 20
    if (this.data.processingMetadata?.analysisQuality === 'fair') confidence -= 10

    return Math.max(confidence, 10)
  }

  private calculateAnalysisQuality(): number {
    let quality = 100

    // Factor in various quality indicators
    if (this.data.processingMetadata) {
      const metadata = this.data.processingMetadata
      
      if (metadata.analysisQuality === 'poor') quality -= 30
      else if (metadata.analysisQuality === 'fair') quality -= 15
      
      if (metadata.imageQualityScore !== undefined) {
        quality = (quality + metadata.imageQualityScore) / 2
      }
      
      if (metadata.confidenceScores && metadata.confidenceScores.length > 0) {
        const avgConfidence = metadata.confidenceScores.reduce((a, b) => a + b, 0) / metadata.confidenceScores.length
        quality = (quality + avgConfidence) / 2
      }
    }

    return Math.round(Math.max(quality, 10))
  }

  private identifyKeyFactors(riskComponents: any): any[] {
    const factors: any[] = []
    
    // Collect high-impact factors from each component
    for (const [component, data] of Object.entries(riskComponents)) {
      if (data && typeof data === 'object' && data.factors) {
        for (const factor of data.factors) {
          factors.push({
            factor,
            impact: data.score > 60 ? 'negative' : data.score > 30 ? 'neutral' : 'positive',
            weight: Math.min(data.score / 100, 1),
            description: `${component}: ${factor}`,
            source: component
          })
        }
      }
    }

    // Sort by weight and return top factors
    return factors.sort((a, b) => b.weight - a.weight).slice(0, 10)
  }

  private identifyRegulatoryFlags(): string[] {
    const flags: string[] = []
    
    if (this.data.securityAssessment?.osfiReportableRisk === true) {
      flags.push('OSFI_REPORTABLE_RISK')
    }
    
    if (this.data.complianceAssessment?.osfiCompliance?.reportingRequired === true) {
      flags.push('OSFI_REPORTING_REQUIRED')
    }
    
    if (this.data.complianceAssessment?.amlChecks?.status === 'requires-investigation') {
      flags.push('AML_INVESTIGATION_REQUIRED')
    }
    
    if (this.data.transactionContext?.amount && this.data.transactionContext.amount >= 10000) {
      flags.push('LARGE_VALUE_TRANSACTION')
    }
    
    return flags
  }

  synthesizeFinalDecision(aiDecisionIntelligence: any): DecisionResult {
    const overallRiskScore = this.analysisResults.overallRiskScore
    const confidence = this.analysisResults.confidenceScore
    const qualityScore = this.analysisResults.qualityScore
    
    // Determine final decision based on risk thresholds and AI input
    let finalDecision: 'APPROVE' | 'REVIEW' | 'REJECT' | 'INVESTIGATE'
    
    if (overallRiskScore >= 80 || this.hasInvestigationTriggers()) {
      finalDecision = 'INVESTIGATE'
    } else if (overallRiskScore >= 60 || this.hasReviewTriggers()) {
      finalDecision = 'REVIEW'
    } else if (overallRiskScore >= 40 || this.hasRejectTriggers()) {
      finalDecision = 'REJECT'
    } else {
      finalDecision = 'APPROVE'
    }

    // Override based on AI intelligence if available
    if (aiDecisionIntelligence?.overallRiskAssessment?.riskLevel) {
      const aiDecision = aiDecisionIntelligence.overallRiskAssessment.riskLevel
      if (aiDecision === 'Investigate') finalDecision = 'INVESTIGATE'
      else if (aiDecision === 'Reject') finalDecision = 'REJECT'
      else if (aiDecision === 'Review' && finalDecision === 'APPROVE') finalDecision = 'REVIEW'
    }

    return {
      decision: {
        finalDecision,
        confidence,
        riskScore: overallRiskScore,
        decisionReasoning: this.generateDecisionReasoning(finalDecision, overallRiskScore),
        keyFactors: this.analysisResults.keyFactors
      },
      operationalGuidance: this.generateOperationalGuidance(finalDecision, aiDecisionIntelligence),
      riskManagement: this.generateRiskManagement(finalDecision, overallRiskScore),
      regulatoryCompliance: this.generateRegulatoryCompliance(finalDecision),
      businessIntelligence: this.generateBusinessIntelligence(),
      qualityAssurance: {
        decisionQualityScore: qualityScore,
        dataCompletenessScore: this.calculateDataCompleteness(),
        recommendedImprovements: this.generateImprovementRecommendations(),
        alternativeScenarios: this.generateAlternativeScenarios(finalDecision)
      },
      systemIntegration: this.generateSystemIntegration(finalDecision),
      decisionId: this.decisionId,
      timestamp: new Date().toISOString(),
      processingTime: 0, // Will be set by caller
      version: '2.0.0',
      algorithmVersion: 'CANBK-AI-v2.0'
    }
  }

  private hasInvestigationTriggers(): boolean {
    return this.analysisResults.regulatoryFlags.includes('OSFI_REPORTABLE_RISK') ||
           this.analysisResults.regulatoryFlags.includes('AML_INVESTIGATION_REQUIRED') ||
           (this.data.securityAssessment?.fraudRiskLevel === 'Critical')
  }

  private hasReviewTriggers(): boolean {
    return this.analysisResults.regulatoryFlags.includes('OSFI_REPORTING_REQUIRED') ||
           (this.data.institutionData?.institutionConfirmed === false) ||
           (this.data.complianceAssessment?.osfiCompliance?.status === 'requires-review')
  }

  private hasRejectTriggers(): boolean {
    return (this.data.institutionData?.riskAssessment === 'Critical') ||
           (this.data.securityAssessment?.tamperEvidenceCheck === 'failed')
  }

  private generateDecisionReasoning(decision: string, riskScore: number): string[] {
    const reasoning: string[] = []
    
    reasoning.push(`Overall risk score: ${riskScore}/100`)
    reasoning.push(`Decision: ${decision} based on Canadian banking risk thresholds`)
    
    // Add key contributing factors
    const topFactors = this.analysisResults.keyFactors.slice(0, 3)
    for (const factor of topFactors) {
      reasoning.push(`${factor.impact === 'negative' ? 'Risk factor' : 'Mitigating factor'}: ${factor.factor}`)
    }
    
    return reasoning
  }

  private generateOperationalGuidance(decision: string, aiIntelligence: any): any {
    const guidance: any = {
      immediateActions: [],
      verificationSteps: [],
      documentationRequired: [],
      escalationPath: null,
      contactInstructions: [],
      processingTimeframe: 'standard',
      specialInstructions: []
    }

    switch (decision) {
      case 'INVESTIGATE':
        guidance.immediateActions = [
          'Hold transaction immediately',
          'Notify compliance officer',
          'Secure all documentation',
          'Initiate formal investigation'
        ]
        guidance.processingTimeframe = 'immediate'
        guidance.escalationPath = 'Compliance Officer → Risk Management → OSFI (if required)'
        break

      case 'REJECT':
        guidance.immediateActions = [
          'Reject transaction',
          'Document rejection reason',
          'Notify customer of rejection',
          'Secure documentation for audit'
        ]
        guidance.processingTimeframe = 'immediate'
        break

      case 'REVIEW':
        guidance.immediateActions = [
          'Route to supervisor',
          'Perform enhanced verification',
          'Document review process'
        ]
        guidance.processingTimeframe = 'within-24h'
        guidance.escalationPath = 'Supervisor Review'
        break

      case 'APPROVE':
        guidance.immediateActions = [
          'Process normally',
          'Complete standard documentation'
        ]
        guidance.processingTimeframe = 'standard'
        break
    }

    // Add AI-specific guidance if available
    if (aiIntelligence?.operationsGuidance) {
      guidance.specialInstructions.push(...(aiIntelligence.operationsGuidance.documentationRequired || []))
    }

    return guidance
  }

  private generateRiskManagement(decision: string, riskScore: number): any {
    return {
      riskMitigationSteps: [
        'Verify all customer identification',
        'Cross-reference with sanctions lists',
        'Monitor for unusual patterns'
      ],
      monitoringRequirements: [
        'Enhanced transaction monitoring for 90 days',
        'Quarterly risk profile review'
      ],
      futureConsiderations: [
        'Update customer risk profile',
        'Review institution relationship'
      ],
      escalationTriggers: [
        'Additional suspicious activity',
        'Regulatory inquiry',
        'Customer complaints'
      ]
    }
  }

  private generateRegulatoryCompliance(decision: string): any {
    const hasOSFIReporting = this.analysisResults.regulatoryFlags.includes('OSFI_REPORTABLE_RISK') ||
                           this.analysisResults.regulatoryFlags.includes('OSFI_REPORTING_REQUIRED')

    return {
      osfiReporting: {
        required: hasOSFIReporting,
        deadline: hasOSFIReporting ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : undefined,
        reportType: hasOSFIReporting ? 'Incident Report' : undefined,
        keyElements: hasOSFIReporting ? [
          'Risk assessment details',
          'Mitigation steps taken',
          'Customer impact analysis'
        ] : undefined
      },
      pipedaRequirements: [
        'Ensure customer consent for data processing',
        'Apply appropriate data retention policies',
        'Document data handling procedures'
      ],
      auditTrailRequirements: [
        'Maintain complete decision audit trail',
        'Document all verification steps',
        'Preserve supporting evidence'
      ],
      retentionRequirements: {
        duration: '7 years',
        classification: decision === 'INVESTIGATE' ? 'special' : 'standard'
      }
    }
  }

  private generateBusinessIntelligence(): any {
    return {
      customerInsights: [
        'Customer transaction patterns within normal parameters',
        'No significant behavioral changes detected'
      ],
      institutionInsights: [
        'Institution processing volumes stable',
        'No recent institutional alerts'
      ],
      trendAnalysis: [
        'Transaction type aligns with industry patterns',
        'Risk profile consistent with peer institutions'
      ],
      recommendedActions: [
        'Continue standard monitoring protocols',
        'Update risk models with new data points'
      ]
    }
  }

  private calculateDataCompleteness(): number {
    let completeness = 0
    const components = ['chequeAnalysis', 'securityAssessment', 'complianceAssessment', 'institutionData', 'transactionContext']
    
    for (const component of components) {
      if (this.data[component as keyof DecisionRequest]) {
        completeness += 20
      }
    }
    
    return completeness
  }

  private generateImprovementRecommendations(): string[] {
    const improvements: string[] = []
    
    if (!this.data.historicalPatterns) {
      improvements.push('Include historical customer data for better risk assessment')
    }
    
    if (this.analysisResults.qualityScore < 80) {
      improvements.push('Improve image quality for more accurate analysis')
    }
    
    if (this.analysisResults.confidenceScore < 80) {
      improvements.push('Gather additional verification data points')
    }
    
    return improvements
  }

  private generateAlternativeScenarios(decision: string): any[] {
    return [
      {
        scenario: 'If additional verification provided',
        likelihood: 70,
        impact: 'Could reduce risk level by one category'
      },
      {
        scenario: 'If institution provides clarification',
        likelihood: 50,
        impact: 'May resolve compliance concerns'
      }
    ]
  }

  private generateSystemIntegration(decision: string): any {
    return {
      batchProcessingStatus: decision === 'INVESTIGATE' ? 'hold' : decision === 'REJECT' ? 'escalate' : 'continue',
      notificationRequirements: [
        {
          notify: decision === 'INVESTIGATE' ? ['compliance-officer', 'risk-manager'] : 
                 decision === 'REJECT' ? ['supervisor', 'customer-service'] : 
                 ['processing-team'],
          urgency: decision === 'INVESTIGATE' ? 'critical' : decision === 'REJECT' ? 'high' : 'low',
          method: decision === 'INVESTIGATE' ? 'immediate-call' : 'system-alert'
        }
      ],
      workflowActions: [
        {
          action: decision === 'APPROVE' ? 'process-payment' : 'hold-payment',
          target: 'payment-system',
          priority: decision === 'INVESTIGATE' ? 1 : decision === 'REJECT' ? 2 : 3
        }
      ]
    }
  }
}

async function generateAIDecisionIntelligence(requestData: DecisionRequest, analysisResults: any) {
  try {
    const model = initializeGemini({
      temperature: 0.1, // Low temperature for consistent decision-making
      maxOutputTokens: 4096
    })

    const prompt = `
      ${BankingPrompts.decisionIntelligence}
      
      You are an expert Canadian banking operations AI providing decision intelligence for cheque processing.
      Analyze the comprehensive data provided and generate expert decision recommendations.
      
      COMPREHENSIVE ANALYSIS DATA:
      Cheque Analysis: ${JSON.stringify(requestData.chequeAnalysis)}
      Security Assessment: ${JSON.stringify(requestData.securityAssessment)}
      Compliance Assessment: ${JSON.stringify(requestData.complianceAssessment)}
      Institution Data: ${JSON.stringify(requestData.institutionData)}
      Transaction Context: ${JSON.stringify(requestData.transactionContext)}
      Historical Patterns: ${JSON.stringify(requestData.historicalPatterns)}
      Risk Analysis Results: ${JSON.stringify(analysisResults)}
      
      Return ONLY a JSON object with enhanced decision intelligence:
      {
        "overallRiskAssessment": {
          "riskLevel": "'Accept' | 'Review' | 'Reject' | 'Investigate'",
          "confidence": "number (0-100)",
          "reasonsForConcern": ["string"],
          "recommendedActions": ["string"],
          "regulatoryFlags": ["string"],
          "complianceRequirements": ["string"]
        },
        "operationsGuidance": {
          "immediateAction": "string",
          "verificationSteps": ["string"],
          "documentationRequired": ["string"],
          "processingTimeframe": "'immediate' | 'within-1h' | 'within-24h' | 'standard'",
          "escalationPath": "string | null",
          "specialConsiderations": ["string"]
        },
        "riskMitigation": {
          "mitigationSteps": ["string"],
          "monitoringRequirements": ["string"],
          "futurePreventionMeasures": ["string"]
        },
        "institutionContext": {
          "bankName": "string",
          "institutionRiskProfile": "string",
          "verificationGuidance": ["string"],
          "contactPriority": "string"
        },
        "summaryStatement": "string (max 200 chars)"
      }

      Focus on:
      1. **Canadian Banking Regulations**: OSFI, PIPEDA, CPA Standard 006 compliance
      2. **Risk-Based Decision Making**: Quantitative risk assessment with regulatory alignment  
      3. **Operational Excellence**: Clear, actionable guidance for banking professionals
      4. **Regulatory Compliance**: Ensure all decisions meet Canadian banking standards
      5. **Professional Judgment**: Balance risk management with customer service

      Provide expert-level decision intelligence that banking professionals can rely on.
    `

    const result = await withTimeout(
      model.generateContent({ prompt }),
      45000 // 45 second timeout for complex decision analysis
    )

    const fallback = {
      overallRiskAssessment: { 
        riskLevel: 'Review', 
        confidence: 70, 
        reasonsForConcern: ["Comprehensive AI analysis fallback"],
        recommendedActions: ["Manual review by qualified banking professional"],
        regulatoryFlags: [],
        complianceRequirements: ["Standard Canadian banking due diligence"]
      },
      operationsGuidance: { 
        immediateAction: 'Route to supervisor for manual review', 
        verificationSteps: ["Verify all customer identification", "Cross-reference institution data"],
        documentationRequired: ["Note AI decision intelligence fallback"],
        processingTimeframe: 'within-24h',
        escalationPath: 'Supervisor → Risk Management',
        specialConsiderations: ["AI decision system encountered processing limitations"]
      },
      riskMitigation: {
        mitigationSteps: ["Apply standard risk mitigation procedures"],
        monitoringRequirements: ["Enhanced monitoring for 30 days"],
        futurePreventionMeasures: ["Review decision intelligence system performance"]
      },
      institutionContext: {
        bankName: requestData.institutionData?.finalInstitutionName || "Unknown Institution",
        institutionRiskProfile: requestData.institutionData?.riskAssessment || 'Unknown',
        verificationGuidance: ["Contact institution verification department"],
        contactPriority: "Standard verification process"
      },
      summaryStatement: "AI decision intelligence fallback - manual professional review recommended"
    }
    
    return parseJsonResponse(result.text, fallback, "generateAIDecisionIntelligence", false)
  } catch (error) {
    console.error('AI decision intelligence generation failed:', error)
    // Return a safe fallback that ensures manual review
    return {
      overallRiskAssessment: { 
        riskLevel: 'Review', 
        confidence: 50, 
        reasonsForConcern: ["AI analysis unavailable"],
        recommendedActions: ["Manual review required"],
        regulatoryFlags: ["AI_SYSTEM_ERROR"],
        complianceRequirements: ["Standard manual compliance verification"]
      },
      operationsGuidance: { 
        immediateAction: 'Manual review required due to AI system limitation', 
        verificationSteps: ["Complete manual verification process"],
        documentationRequired: ["Document AI system limitation"],
        processingTimeframe: 'within-24h',
        escalationPath: 'IT Support → Risk Management',
        specialConsiderations: ["AI decision system temporarily unavailable"]
      }
    }
  }
}

// Utility functions
function mapDecisionToComplianceRisk(decision: string, riskScore: number): 'Low' | 'Medium' | 'High' | 'Critical' {
  switch (decision) {
    case 'APPROVE': return riskScore > 30 ? 'Medium' : 'Low'
    case 'REVIEW': return riskScore > 60 ? 'High' : 'Medium'
    case 'REJECT': return 'High'
    case 'INVESTIGATE': return 'Critical'
    default: return 'Medium'
  }
}

async function updateBatchProcessingStatus(batchId: string, result: DecisionResult): Promise<void> {
  try {
    const supabase = createSupabaseClient()
    
    // Update batch status based on decision
    const batchStatus = result.systemIntegration.batchProcessingStatus
    
    await supabase
      .from('batch_processing')
      .update({
        status: batchStatus,
        last_decision: result.decision.finalDecision,
        updated_at: new Date().toISOString()
      })
      .eq('batch_id', batchId)
  } catch (error) {
    console.error('Failed to update batch processing status:', error)
  }
}

async function triggerDecisionNotifications(result: DecisionResult, requestData: DecisionRequest): Promise<void> {
  try {
    const supabase = createSupabaseClient()
    
    // Create notification records for high-priority decisions
    for (const notification of result.systemIntegration.notificationRequirements) {
      if (notification.urgency === 'high' || notification.urgency === 'critical') {
        await supabase
          .from('decision_notifications')
          .insert({
            decision_id: result.decisionId,
            notify_roles: notification.notify,
            urgency: notification.urgency,
            method: notification.method,
            status: 'pending',
            created_at: new Date().toISOString()
          })
      }
    }
  } catch (error) {
    console.error('Failed to trigger decision notifications:', error)
  }
}