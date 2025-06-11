import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders, handleCorsPreflightRequest, createCorsResponse, createErrorResponse } from '../_shared/cors.ts'
import { initializeGemini, parseJsonResponse } from '../_shared/gemini.ts'
import { logComplianceActivity, generateComplianceId } from '../_shared/compliance.ts'

interface InstitutionDetectionRequest {
  imageBase64: string
  transitNumber?: string
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

    const { imageBase64, transitNumber, userId }: InstitutionDetectionRequest = await req.json()
    const complianceId = generateComplianceId()

    if (!imageBase64) {
      return createErrorResponse('imageBase64 is required', 400)
    }

    const model = initializeGemini()
    const result = await detectCanadianInstitution(model, imageBase64)
    
    // Enhance with MICR-based validation if transit number provided
    const enhancedResult = await enhanceWithMicrValidation(result, transitNumber)
    
    const processingTime = Date.now() - startTime

    // Log compliance activity
    await logComplianceActivity({
      operation: 'detect-institution',
      user_id: userId,
      request_data: { 
        hasImageData: !!imageBase64,
        hasTransitNumber: !!transitNumber 
      },
      response_data: { 
        institutionDetected: !!result.recognizedInstitutionName,
        confidence: result.confidenceScore,
        institutionType: result.institutionTypeGuess 
      },
      processing_time_ms: processingTime,
      risk_level: 'Low',
      osfi_reportable: false,
      created_at: new Date().toISOString()
    })

    return createCorsResponse({
      ...enhancedResult,
      complianceId,
      processingTime
    })

  } catch (error) {
    console.error('Error in detect-institution function:', error)
    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error occurred'
    )
  }
})

async function detectCanadianInstitution(model: any, imageBase64: string) {
  const prompt = `
    Analyze this cheque image to identify the Canadian financial institution based on visual elements like logos, branding, and cheque design style.
    Do NOT use the MICR line for this specific task.
    Return ONLY a JSON object adhering to this structure:
    {
      "recognizedInstitutionName": "string | null",
      "confidenceScore": "number | null", 
      "institutionTypeGuess": "'Bank' | 'Credit Union' | 'Government' | 'Other' | null",
      "countryOfOrigin": "'Canada' | 'USA' | 'Other' | 'Unknown' | null",
      "visualElementsUsed": ["string"],
      "riskAssessment": "'Low' | 'Medium' | 'High' | null",
      "osfiRegulated": "boolean | null"
    }

    Instructions:
    1. **Institution Identification**: State the name if identifiable (e.g., "Royal Bank of Canada", "TD Canada Trust").
    2. **Confidence Score**: Your confidence (0-100) in this identification.
    3. **Institution Classification**: Classify as 'Bank', 'Credit Union', 'Government', or 'Other'.
    4. **Country of Origin**: Usually 'Canada' for Canadian cheques.
    5. **Visual Elements**: List visual cues used for identification.
    6. **Risk Assessment**: Assess institutional risk based on visual indicators.
    7. **OSFI Regulation**: Determine if institution appears to be OSFI-regulated.

    Focus on accurate identification for Canadian banking compliance and risk assessment.
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
    visualElementsUsed: [],
    riskAssessment: 'Medium',
    osfiRegulated: null 
  }, "detectCanadianInstitution")
}

async function enhanceWithMicrValidation(result: any, transitNumber?: string) {
  if (!transitNumber || transitNumber.length !== 9) {
    return result
  }

  // Canadian financial institution codes (simplified)
  const institutionCodes: Record<string, string> = {
    '001': 'Bank of Montreal (BMO)',
    '002': 'The Bank of Nova Scotia (Scotiabank)',
    '003': 'Royal Bank of Canada (RBC)',
    '004': 'The Toronto-Dominion Bank (TD)',
    '006': 'National Bank of Canada',
    '010': 'Canadian Imperial Bank of Commerce (CIBC)',
    '016': 'HSBC Bank Canada',
    '030': 'Canadian Western Bank'
  }

  const institutionCode = transitNumber.substring(5, 8)
  const micrInstitutionName = institutionCodes[institutionCode]

  return {
    ...result,
    micrValidation: {
      institutionCode,
      micrInstitutionName,
      transitNumber,
      validationMatch: result.recognizedInstitutionName === micrInstitutionName
    }
  }
}