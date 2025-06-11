import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders, handleCorsPreflightRequest, createCorsResponse, createErrorResponse } from '../_shared/cors.ts'
import { initializeGemini, parseJsonResponse } from '../_shared/gemini.ts'
import { logComplianceActivity, generateComplianceId, assessOSFIReportability } from '../_shared/compliance.ts'

interface ComplianceRequest {
  imageBase64: string
  chequeData?: any
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

    const { imageBase64, chequeData, userId }: ComplianceRequest = await req.json()
    const complianceId = generateComplianceId()

    if (!imageBase64) {
      return createErrorResponse('imageBase64 is required', 400)
    }

    const model = initializeGemini()
    const result = await analyzeCanadianBankingCompliance(model, imageBase64)
    
    const processingTime = Date.now() - startTime
    const riskLevel = determineComplianceRiskLevel(result)
    const osfiReportable = assessOSFIReportability(riskLevel)

    // Log compliance activity
    await logComplianceActivity({
      operation: 'analyze-compliance',
      user_id: userId,
      request_data: { 
        hasImageData: !!imageBase64,
        hasChequeData: !!chequeData 
      },
      response_data: { 
        isStaleDated: result.isStaleDatedAI,
        isPostDated: result.isPostDatedAI,
        complianceStatus: riskLevel 
      },
      processing_time_ms: processingTime,
      risk_level: riskLevel,
      osfi_reportable: osfiReportable,
      created_at: new Date().toISOString()
    })

    return createCorsResponse({
      ...result,
      complianceId,
      processingTime,
      riskLevel
    })

  } catch (error) {
    console.error('Error in analyze-compliance function:', error)
    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error occurred'
    )
  }
})

async function analyzeCanadianBankingCompliance(model: any, imageBase64: string) {
  const prompt = `
    Analyze this Canadian cheque image for compliance with specific Canadian banking regulations (OSFI, PIPEDA, CPA Standard 006).
    Return ONLY a JSON object adhering to this structure:
    {
      "isStaleDatedAI": "boolean | null",
      "isPostDatedAI": "boolean | null",
      "isDateCanadianBusinessDay": "boolean | null",
      "provincialHolidayImpact": "string | null",
      "currencyDesignationValid": "boolean | null",
      "overallCPA006ComplianceNotes": ["string"],
      "osfiComplianceFlags": ["string"],
      "pipedaDataHandlingNotes": ["string"]
    }

    Instructions:
    1. **Date Validation**: Check if cheque is stale-dated (>6 months old) or post-dated (future date).
    2. **Business Day Analysis**: Verify if date falls on Canadian business day.
    3. **Currency Designation**: Validate currency consistency with Canadian standards.
    4. **CPA006 Compliance**: Note visual compliance with CPA Standard 006.
    5. **OSFI Flags**: Identify any OSFI-reportable risk indicators.
    6. **PIPEDA Considerations**: Note personal data handling requirements.

    Focus on regulatory compliance and risk assessment for Canadian banking operations.
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
    overallCPA006ComplianceNotes: [],
    osfiComplianceFlags: [],
    pipedaDataHandlingNotes: []
  }, "analyzeCanadianBankingCompliance")
}

function determineComplianceRiskLevel(result: any): 'Low' | 'Medium' | 'High' | 'Critical' {
  if (result.isStaleDatedAI === true || result.isPostDatedAI === true) {
    return 'Medium'
  }
  if (result.osfiComplianceFlags && result.osfiComplianceFlags.length > 0) {
    return 'High'
  }
  return 'Low'
}