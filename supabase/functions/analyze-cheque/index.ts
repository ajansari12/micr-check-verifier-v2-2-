import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders, handleCorsPreflightRequest, createCorsResponse, createErrorResponse } from '../_shared/cors.ts'
import { initializeGemini, parseJsonResponse } from '../_shared/gemini.ts'
import { logComplianceActivity, generateComplianceId, assessOSFIReportability } from '../_shared/compliance.ts'

interface AnalyzeChequeRequest {
  imageBase64: string
  userId?: string
  sessionId?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest()
  }

  const startTime = Date.now()
  let complianceId: string | null = null
  
  try {
    if (req.method !== 'POST') {
      return createErrorResponse('Method not allowed', 405)
    }

    const { imageBase64, userId, sessionId }: AnalyzeChequeRequest = await req.json()
    complianceId = generateComplianceId()

    if (!imageBase64) {
      return createErrorResponse('imageBase64 is required', 400)
    }

    const model = initializeGemini()
    const result = await analyzeChequeDetails(model, imageBase64)
    
    const processingTime = Date.now() - startTime
    const riskLevel = result.overallClarity === 'poor' ? 'Medium' : 'Low'
    const osfiReportable = assessOSFIReportability(riskLevel)

    // Log compliance activity
    await logComplianceActivity({
      operation: 'analyze-cheque',
      user_id: userId,
      request_data: { sessionId, imageProvided: !!imageBase64 },
      response_data: { 
        transitNumber: result.transitNumber ? 'REDACTED' : null,
        payeeName: result.payeeName ? 'REDACTED' : null,
        success: true 
      },
      processing_time_ms: processingTime,
      risk_level: riskLevel,
      osfi_reportable: osfiReportable,
      created_at: new Date().toISOString()
    })

    return createCorsResponse({
      ...result,
      complianceId,
      processingTime
    })

  } catch (error) {
    console.error('Error in analyze-cheque function:', error)
    
    const processingTime = Date.now() - startTime
    
    // Log error for compliance
    if (complianceId) {
      await logComplianceActivity({
        operation: 'analyze-cheque',
        request_data: { error: true },
        response_data: { error: error instanceof Error ? error.message : 'Unknown error' },
        processing_time_ms: processingTime,
        osfi_reportable: false,
        created_at: new Date().toISOString()
      })
    }

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error occurred'
    )
  }
})

async function analyzeChequeDetails(model: any, imageBase64: string) {
  const prompt = `
    Analyze this image of a Canadian bank cheque according to Canadian Payments Association (CPA) Standard 006 and general Canadian banking practices.
    Extract the following information and return it ONLY as a JSON object. Do not include markdown fences.

    JSON Structure to use:
    {
      "rawExtractedMicr": "string | null",
      "transitNumber": "string | null",
      "accountNumber": "string | null",
      "checkNumber": "string | null",
      "transactionCode": "string | null",
      "auxiliaryOnUs": "string | null",
      "transitNumberValid": "boolean | null",
      "payeeName": "string | null",
      "amountNumerals": "string | null",
      "amountWords": "string | null",
      "currencyDesignation": "string | null",
      "chequeDate": "string | null",
      "chequeDateValid": "boolean | null",
      "chequeDateFormatRecognized": "string | null",
      "printedDateIndicatorsPresent": "boolean | null",
      "signaturePresent": "boolean | null",
      "voidPantographDetected": "boolean | null",
      "alterationsPayeeSuspected": "boolean | null",
      "alterationsAmountSuspected": "boolean | null",
      "inkColorAcceptable": "boolean | null",
      "designIssues": ["string"],
      "overallClarity": "'good' | 'fair' | 'poor' | null",
      "processingNotes": "string | null"
    }

    Detailed Instructions for Analysis:
    1. **MICR Line Analysis (CPA Standard 006)**: Extract the full MICR line text and validate the 9-digit Canadian transit number using CPA checksum algorithm.
    2. **Cheque Face Elements**: Extract payee name, amounts, currency designation, date, and signature presence.
    3. **Security and Fraud Indicators**: Check for void pantograph, alterations, and ink color acceptability.
    4. **Image Quality & Design**: Assess overall clarity and list any design issues.
    5. **JSON Output**: Return only the JSON object with null values for undetermined fields.

    Be meticulous and prioritize accuracy for Canadian banking compliance.
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
    processingNotes: "Failed to analyze cheque details",
    overallClarity: "poor"
  }, "analyzeChequeDetails")
}