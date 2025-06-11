import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders, handleCorsPreflightRequest, createCorsResponse, createErrorResponse } from '../_shared/cors.ts'
import { initializeGemini, parseJsonResponse } from '../_shared/gemini.ts'
import { logComplianceActivity, generateComplianceId, assessOSFIReportability } from '../_shared/compliance.ts'

interface DecisionRequest {
  chequeData: any
  securityAssessment: any
  complianceData: any
  institutionData: any
  userId?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest()
  }

  const startTime = Date.now()
  
  try {
    if (req.method !== 'POST') {
      return createErrorResponse('Method not allowed', 405)
    }

    const { chequeData, securityAssessment, complianceData, institutionData, userId }: DecisionRequest = await req.json()
    const complianceId = generateComplianceId()

    if (!chequeData) {
      return createErrorResponse('chequeData is required', 400)
    }

    const model = initializeGemini()
    const result = await generateDecisionIntelligence(model, {
      chequeData,
      securityAssessment,
      complianceData,
      institutionData
    })
    
    const processingTime = Date.now() - startTime
    const riskLevel = result.overallRiskAssessment?.riskLevel || 'Medium'
    const osfiReportable = assessOSFIReportability(riskLevel)

    // Log compliance activity for decision intelligence
    await logComplianceActivity({
      operation: 'generate-decision',
      user_id: userId,
      request_data: { 
        hasChequeData: !!chequeData,
        hasSecurityData: !!securityAssessment,
        hasComplianceData: !!complianceData,
        hasInstitutionData: !!institutionData
      },
      response_data: { 
        riskLevel: result.overallRiskAssessment?.riskLevel,
        confidence: result.overallRiskAssessment?.confidence,
        immediateAction: result.operationsGuidance?.immediateAction
      },
      processing_time_ms: processingTime,
      risk_level: mapRiskLevelToCompliance(riskLevel),
      osfi_reportable: osfiReportable,
      created_at: new Date().toISOString()
    })

    return createCorsResponse({
      ...result,
      complianceId,
      processingTime
    })

  } catch (error) {
    console.error('Error in generate-decision function:', error)
    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error occurred'
    )
  }
})

async function generateDecisionIntelligence(model: any, analysisData: any) {
  const { chequeData, securityAssessment, complianceData, institutionData } = analysisData

  const prompt = `
    You are an AI assistant for Canadian banking operations, specializing in cheque verification and operational decision support.
    Based on the comprehensive analysis data provided, generate Decision Intelligence for banking operations.
    
    Your response MUST BE ONLY a JSON object matching this structure:
    {
      "overallRiskAssessment": {
        "riskLevel": "'Accept' | 'Review' | 'Reject' | 'Investigate'",
        "confidence": "number (0-100)",
        "reasonsForConcern": ["string"],
        "recommendedActions": ["string"],
        "regulatoryFlags": ["string"]
      },
      "operationsGuidance": {
        "immediateAction": "'Process Normally' | 'Route to Supervisor' | 'Hold for Investigation' | 'Manual Verification Required' | 'Contact Institution' | 'Reject Item'",
        "documentationRequired": ["string"],
        "processingTimeframe": "'Standard' | 'Expedited Review' | 'Immediate Action'",
        "escalationPath": "string | null",
        "complianceRequirements": ["string"]
      },
      "institutionContext": {
        "bankName": "string",
        "institutionRiskProfile": "'Standard' | 'Enhanced Monitoring' | 'High Risk' | 'Unknown'",
        "osfiRegulated": "boolean",
        "keyVerificationContacts": [
          { "type": "string", "method": "string", "details": "string" }
        ]
      },
      "summaryStatement": "string (max 150 chars)"
    }

    ANALYSIS DATA:
    Cheque Data: ${JSON.stringify(chequeData)}
    Security Assessment: ${JSON.stringify(securityAssessment)}
    Compliance Data: ${JSON.stringify(complianceData)}
    Institution Data: ${JSON.stringify(institutionData)}

    Focus on:
    1. **Risk Assessment**: Synthesize ALL findings to determine operational risk level
    2. **Operations Guidance**: Provide clear, actionable next steps
    3. **Regulatory Compliance**: Ensure adherence to OSFI, PIPEDA, CPA standards
    4. **Institution Context**: Leverage institution data for risk assessment
    5. **Summary**: Concise, actionable summary for operators

    Prioritize Canadian banking regulatory compliance and operational efficiency.
  `

  const result = await model.generateContent([{ text: prompt }])
  const response = await result.response
  const text = response.text()
  
  const fallback = {
    overallRiskAssessment: { 
      riskLevel: 'Review', 
      confidence: 50, 
      reasonsForConcern: ["AI decision generation fallback"],
      recommendedActions: ["Manual review suggested"],
      regulatoryFlags: []
    },
    operationsGuidance: { 
      immediateAction: 'Route to Supervisor', 
      documentationRequired: ["Note AI fallback"],
      processingTimeframe: 'Expedited Review',
      escalationPath: null,
      complianceRequirements: []
    },
    institutionContext: {
      bankName: "Unknown",
      institutionRiskProfile: 'Unknown',
      osfiRegulated: false,
      keyVerificationContacts: []
    },
    summaryStatement: "AI decision generation fallback; manual review suggested"
  }
  
  return parseJsonResponse(text, fallback, "generateDecisionIntelligence")
}

function mapRiskLevelToCompliance(riskLevel: string): 'Low' | 'Medium' | 'High' | 'Critical' {
  switch (riskLevel) {
    case 'Accept': return 'Low'
    case 'Review': return 'Medium'
    case 'Investigate': return 'High'
    case 'Reject': return 'Critical'
    default: return 'Medium'
  }
}