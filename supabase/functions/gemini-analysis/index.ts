import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { GoogleGenerativeAI } from "npm:@google/generative-ai@^0.21.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  operation: string;
  imageBase64?: string;
  initialChequeData?: any;
  institutionContext?: any;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { operation, imageBase64, initialChequeData, institutionContext }: RequestBody = await req.json()

    // Get Gemini API key from Supabase secrets
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiApiKey) {
      console.error('GEMINI_API_KEY not found in environment variables')
      return new Response(
        JSON.stringify({ 
          error: 'GEMINI_API_KEY not configured in Supabase secrets. Please run: supabase secrets set GEMINI_API_KEY=your_api_key_here',
          processingNotes: 'Missing API key configuration - contact system administrator'
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Initialize Gemini AI
    let genAI: GoogleGenerativeAI
    let model: any
    
    try {
      genAI = new GoogleGenerativeAI(geminiApiKey)
      model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" })
    } catch (error) {
      console.error('Failed to initialize Gemini AI:', error)
      return new Response(
        JSON.stringify({ 
          error: 'Invalid GEMINI_API_KEY or Gemini AI service unavailable. Please verify your API key is valid.',
          processingNotes: 'Gemini AI initialization failed - check API key validity'
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    let result: any

    switch (operation) {
      case 'analyzeChequeDetails':
        if (!imageBase64) {
          return new Response(
            JSON.stringify({ 
              error: 'Missing imageBase64 parameter for analyzeChequeDetails operation',
              processingNotes: 'Invalid request parameters'
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          )
        }
        result = await analyzeChequeDetails(model, imageBase64)
        break
      case 'analyzeSecurityFeatures':
        if (!imageBase64) {
          return new Response(
            JSON.stringify({ 
              error: 'Missing imageBase64 parameter for analyzeSecurityFeatures operation',
              processingNotes: 'Invalid request parameters'
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          )
        }
        result = await analyzeSecurityFeatures(model, imageBase64)
        break
      case 'analyzeCanadianBankingCompliance':
        if (!imageBase64) {
          return new Response(
            JSON.stringify({ 
              error: 'Missing imageBase64 parameter for analyzeCanadianBankingCompliance operation',
              processingNotes: 'Invalid request parameters'
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          )
        }
        result = await analyzeCanadianBankingCompliance(model, imageBase64)
        break
      case 'detectCanadianInstitution':
        if (!imageBase64) {
          return new Response(
            JSON.stringify({ 
              error: 'Missing imageBase64 parameter for detectCanadianInstitution operation',
              processingNotes: 'Invalid request parameters'
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          )
        }
        result = await detectCanadianInstitution(model, imageBase64)
        break
      case 'assessFraudRisk':
        if (!imageBase64) {
          return new Response(
            JSON.stringify({ 
              error: 'Missing imageBase64 parameter for assessFraudRisk operation',
              processingNotes: 'Invalid request parameters'
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          )
        }
        result = await assessFraudRisk(model, imageBase64)
        break
      case 'generateDecisionIntelligence':
        if (!initialChequeData) {
          return new Response(
            JSON.stringify({ 
              error: 'Missing initialChequeData parameter for generateDecisionIntelligence operation',
              processingNotes: 'Invalid request parameters'
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          )
        }
        result = await generateDecisionIntelligence(model, initialChequeData, institutionContext)
        break
      default:
        return new Response(
          JSON.stringify({ 
            error: `Unknown operation: ${operation}`,
            processingNotes: 'Invalid operation requested'
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error in gemini-analysis function:', error)
    
    // Handle specific Google AI API errors
    if (error instanceof Error) {
      if (error.message.includes('API key not valid') || error.message.includes('Invalid API key')) {
        return new Response(
          JSON.stringify({ 
            error: 'Invalid GEMINI_API_KEY. Please verify your API key is correct and has proper permissions.',
            processingNotes: 'Gemini API authentication failed - check API key'
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }
      
      if (error.message.includes('quota') || error.message.includes('rate limit')) {
        return new Response(
          JSON.stringify({ 
            error: 'Gemini API quota exceeded or rate limit reached. Please try again later.',
            processingNotes: 'API rate limit or quota exceeded'
          }),
          {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }
    }
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred in Gemini analysis',
        processingNotes: 'Server-side processing failed - check function logs for details'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
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
      "branchCode": "string | null",
      "institutionNumber": "string | null",
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
    1.  **MICR Line Analysis (CPA Standard 006)**:
        *   \`rawExtractedMicr\`: Extract the full MICR line text as accurately as possible.
        *   \`transitNumber\`: Identify the 9-digit Canadian transit number (format DDDDDFFFC: 5-digit Branch, 3-digit Institution, 1-digit Check Digit). DO NOT add any leading zeros that are not actually in the MICR data.
        *   \`branchCode\`: Extract the first 5 digits from the transit number. This is the branch code.
        *   \`institutionNumber\`: Extract the next 3 digits (positions 6-8) from the transit number. This is the institution code. For Canadian banks: 001=BMO, 002=Scotiabank, 003=RBC, 004=TD, 006=National Bank, 010=CIBC, 016=HSBC.
        *   If found, validate the 9-digit transit number using the CPA checksum algorithm: (d1*1 + d2*7 + d3*3 + d4*1 + d5*7 + d6*3 + d7*1 + d8*7 + d9*3) mod 10 == 0. Set \`transitNumberValid\` accordingly (true/false).
        *   \`accountNumber\`: Extract the account number.
        *   \`checkNumber\`: Extract the cheque serial number.
        *   \`transactionCode\`: Identify the MICR transaction code. Usually 1-4 digits, often located between amount and account symbols, or at the end.
        *   \`auxiliaryOnUs\`: Extract any auxiliary on-us field.
    2.  **Cheque Face Elements**:
        *   \`payeeName\`: Extract the payee's full name.
        *   \`amountNumerals\`: Extract the amount in numerals (e.g., "123.45").
        *   \`amountWords\`: Extract the amount written in words.
        *   \`currencyDesignation\`: Extract any explicit currency identifier (e.g., "CDN", "CAD", "USD", "US DOLLARS", "CDN FUNDS") from the cheque face.
        *   \`chequeDate\`: Extract the date. Try to format as YYYY-MM-DD if possible. Indicate the format recognized in \`chequeDateFormatRecognized\`. Assess \`chequeDateValid\` for basic plausibility.
        *   \`signaturePresent\`: Determine if a signature is visible in the designated signature area.
    3.  **Security and Fraud Indicators (Visual Assessment)**:
        *   \`voidPantographDetected\`: Check for visual patterns or text (like "VOID") that might indicate a void pantograph security feature.
        *   \`alterationsPayeeSuspected\`: Look for signs of tampering in the payee name (e.g., different ink, smudging, misalignment).
        *   \`alterationsAmountSuspected\`: Look for signs of tampering in the amount fields.
        *   \`inkColorAcceptable\`: Note if key fields are printed in dark, legible ink (e.g., black, dark blue).
    4.  **Image Quality & Design**:
        *   \`designIssues\`: List any design characteristics that might impede OCR or indicate non-standard design.
        *   \`overallClarity\`: Assess the overall clarity of the image for OCR purposes.
    5.  **JSON Output**: Ensure the entire response is ONLY the JSON object. If a field cannot be determined or is not applicable, set its value to null (or an empty array for \`designIssues\`).
    
    IMPORTANT: 
    - Pay special attention to the transit number (DDDDDFFFC) format. The first 5 digits (DDDDD) are the branch code, and the next 3 digits (FFF) are the institution number.
    - Look carefully at the cheque for the Bank of Montreal (BMO) logo/branding - the institution number should be 001 for BMO.
    - DO NOT add any leading zeros to the branch code or institution number unless they actually appear in the MICR line.
    - Be precise about digit reading - confusing "0" and "O" or similar characters can lead to errors.
    - Read the MICR line directly as printed - do not rearrange or reformat digits.
    
    Be meticulous and prioritize accuracy for Canadian banking compliance.
  `

  try {
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
    
    return parseJsonResponse(text, {}, "analyzeChequeDetails")
  } catch (error) {
    console.error('Error in analyzeChequeDetails:', error)
    throw error
  }
}

async function analyzeSecurityFeatures(model: any, imageBase64: string) {
  const prompt = `
    Analyze this Canadian cheque image specifically for its security features and signs of tampering or counterfeiting.
    Return ONLY a JSON object adhering to the following SecurityAssessment structure:
    {
      "osfiReportableRisk": "boolean | null",
      "tamperEvidenceCheck": "'passed' | 'failed' | 'unknown' | null",
      "imageAuthenticityScore": "number | null", // 0-100, likelihood image is genuine scan/photo
      "detectedSecurityFeatures": ["string describing feature, its presence, and quality, e.g., 'Microprinting: present, appears sharp', 'Void Pantograph: visible pattern', 'Watermark: not evident from this image'"],
      "fraudRiskLevel": "'Low' | 'Medium' | 'High' | 'Critical' | null", // Based on security feature analysis
      "alterationsEvident": "boolean | null", // General assessment of alterations
      "counterfeitLikelihoodScore": "number | null", // 0-100, based on security feature reproduction quality
      "suspiciousPatternsObserved": ["string describing suspicious pattern and location, e.g., 'Unusual ink bleed near payee name', 'MICR line appears blurry or misaligned']"
    }

    Instructions:
    1.  **Security Features**: Identify Canadian cheque security features: Microprinting (0.006-0.008 inches), Void Pantograph (copy-evident background), Watermarks (translucent designs), Security Thread (embedded strip), Rainbow Printing (multi-color single lines), Chemical Protection (reactive inks - visually check for stains), Intaglio Printing (raised ink texture - if discernible). For each, describe if detected and its apparent quality.
    2.  **Tampering/Alterations**: \`tamperEvidenceCheck\` - general image tampering. \`alterationsEvident\` - specific evidence of altering cheque content. Describe in \`suspiciousPatternsObserved\`.
    3.  **Counterfeiting**: \`counterfeitLikelihoodScore\` - based on quality of security features. Note poor reproductions.
    4.  **Image Authenticity**: \`imageAuthenticityScore\` - assess if the image itself is genuine or digitally manipulated (compression artifacts, pixel issues).
    5.  **Risk & OSFI**: Based on all observations, set \`fraudRiskLevel\`. Set \`osfiReportableRisk\` to true if \`fraudRiskLevel\` is 'Critical' or very high severity indicators are present.
    Provide null for fields you cannot determine.
  `

  try {
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
    
    return parseJsonResponse(text, { detectedSecurityFeatures: [], suspiciousPatternsObserved: [] }, "analyzeSecurityFeatures")
  } catch (error) {
    console.error('Error in analyzeSecurityFeatures:', error)
    throw error
  }
}

async function analyzeCanadianBankingCompliance(model: any, imageBase64: string) {
  const prompt = `
    Analyze this Canadian cheque image for compliance with specific Canadian banking regulations related to dates and currency.
    Return ONLY a JSON object adhering to this structure:
    {
      "isStaleDatedAI": "boolean | null",
      "isPostDatedAI": "boolean | null",
      "isDateCanadianBusinessDay": "boolean | null",
      "provincialHolidayImpact": "string | null",
      "currencyDesignationValid": "boolean | null",
      "overallCPA006ComplianceNotes": ["string"]
    }

    Instructions:
    1.  **Date Validation (Based on current date knowledge, assume today is around mid-2024 for testing):**
        *   \`isStaleDatedAI\`: True if the cheque date is older than 6 months.
        *   \`isPostDatedAI\`: True if the cheque date is in the future.
        *   \`isDateCanadianBusinessDay\`: Check if the cheque date falls on a typical Canadian business day (Mon-Fri, excluding common national holidays like New Year's, Good Friday, Canada Day, Labour Day, Christmas). Set to null if date is invalid or assessment is difficult.
        *   \`provincialHolidayImpact\`: If the date falls on a known major provincial holiday (e.g., Quebec's National Holiday June 24, BC Day August), note it. E.g., "Date falls on a Quebec statutory holiday."
    2.  **Currency Designation**:
        *   \`currencyDesignationValid\`: If currency is specified (e.g., "USD", "CDN"), assess if it's consistent with other visual cues or typical for Canadian cheques. (e.g., a clearly US-dollar denominated cheque for a US payee might be validly "USD"). Often, if not specified, it's assumed CAD. Set true if seems consistent/standard, false if conflicting, null if not determinable.
    3.  \`overallCPA006ComplianceNotes\`: Provide any general AI observations about the cheque's apparent compliance with CPA Standard 006 visual elements not covered elsewhere (e.g., "Standard bilingual 'Dollars' text present", "Date field clearly demarcated").
    Provide null for fields you cannot determine.
  `

  try {
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
    
    return parseJsonResponse(text, { overallCPA006ComplianceNotes: [] }, "analyzeCanadianBankingCompliance")
  } catch (error) {
    console.error('Error in analyzeCanadianBankingCompliance:', error)
    throw error
  }
}

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
      "visualElementsUsed": ["string"]
    }

    Instructions:
    1.  \`recognizedInstitutionName\`: State the name of the financial institution if you can identify it (e.g., "Royal Bank of Canada", "TD Canada Trust", "Vancity Credit Union").
    2.  \`confidenceScore\`: Your confidence (0-100) in this identification.
    3.  \`institutionTypeGuess\`: Classify as 'Bank', 'Credit Union', 'Government', or 'Other'.
    4.  \`countryOfOrigin\`: Usually 'Canada' for Canadian cheques. Note if it appears to be from USA or Other.
    5.  \`visualElementsUsed\`: List the visual cues you used (e.g., "RBC lion logo", "TD green branding", "Specific cheque layout pattern associated with Scotiabank").
    Provide null for fields you cannot determine. If no institution is clearly identifiable from visual non-MICR elements, set recognizedInstitutionName to null and confidence low.
  `

  try {
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
    
    return parseJsonResponse(text, { visualElementsUsed: [] }, "detectCanadianInstitution")
  } catch (error) {
    console.error('Error in detectCanadianInstitution:', error)
    throw error
  }
}

async function assessFraudRisk(model: any, imageBase64: string) {
  const prompt = `
    Perform a focused fraud risk assessment on this Canadian cheque image.
    Consider all visual information: MICR quality, security feature presence/quality, signs of alteration/tampering, and consistency of cheque elements.
    Return ONLY a JSON object adhering to this structure:
    {
      "overallFraudRiskScore": "number | null",
      "riskLevel": "'Low' | 'Medium' | 'High' | 'Critical' | null",
      "keyRiskFactors": [
        { "factor": "string", "details": "string", "severity": "'Low' | 'Medium' | 'High'" }
      ],
      "recommendedActions": ["string"],
      "confidenceInAssessment": "number | null"
    }

    Instructions:
    1.  \`overallFraudRiskScore\`: A numerical score (0-100) representing the overall fraud risk.
    2.  \`riskLevel\`: Categorize the risk based on the score and factors.
    3.  \`keyRiskFactors\`: List specific factors contributing to the risk. For each factor:
        *   \`factor\`: Brief name of the risk (e.g., "Poor MICR Quality", "Suspicious Payee Font", "Microprinting Absent/Blurry", "Possible Chemical Alteration").
        *   \`details\`: Your observation.
        *   \`severity\`: Severity of this specific factor.
    4.  \`recommendedActions\`: Suggest actions (e.g., "Manual review by fraud specialist", "Verify funds before processing", "Contact issuing institution if concerns are high").
    5.  \`confidenceInAssessment\`: Your confidence (0-100) in this overall fraud risk assessment.
    Provide null for fields you cannot determine.
  `

  try {
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
    
    return parseJsonResponse(text, { keyRiskFactors: [], recommendedActions: [] }, "assessFraudRisk")
  } catch (error) {
    console.error('Error in assessFraudRisk:', error)
    throw error
  }
}

async function generateDecisionIntelligence(model: any, initialChequeData: any, institutionContext: any) {
  const findingsSummary = {
    micr: {
      transitNumber: initialChequeData.transitNumber,
      transitValid: initialChequeData.transitNumberValid,
      accountNumber: initialChequeData.accountNumber,
      checkNumber: initialChequeData.checkNumber,
      rawMicr: initialChequeData.rawExtractedMicr,
    },
    paymentInfo: {
      payee: initialChequeData.payeeName,
      amountNumerals: initialChequeData.amountNumerals,
      amountWords: initialChequeData.amountWords,
      currency: initialChequeData.currencyDesignation,
    },
    dateInfo: {
      date: initialChequeData.chequeDate,
      dateValid: initialChequeData.chequeDateValid,
      dateFormat: initialChequeData.chequeDateFormatRecognized,
      isStale: initialChequeData.isStaleDated,
      isPost: initialChequeData.isPostDated,
    },
    securityObservations: {
      signaturePresent: initialChequeData.signaturePresent,
      voidPantograph: initialChequeData.voidPantographDetected,
      payeeAltered: initialChequeData.alterationsPayeeSuspected,
      amountAltered: initialChequeData.alterationsAmountSuspected,
    },
    imageQuality: initialChequeData.overallClarity,
    processingNotes: initialChequeData.processingNotes || `Initial Security Risk: ${initialChequeData.securityAssessment?.fraudRiskLevel || 'Unknown'}`
  }

  const prompt = `
    You are an AI assistant for Canadian banking operations, specializing in cheque verification and operational decision support.
    Based on the provided initial cheque analysis findings AND the context of the financial institution,
    provide comprehensive Decision Intelligence. Your response MUST BE ONLY a JSON object matching this structure:
    {
      "overallRiskAssessment": {
        "riskLevel": "'Accept' | 'Review' | 'Reject' | 'Investigate'",
        "confidence": "number (0-100)",
        "reasonsForConcern": ["string"],
        "recommendedActions": ["string"],
        "similarCases": [] 
      },
      "operationsGuidance": {
        "immediateAction": "'Process Normally' | 'Route to Supervisor' | 'Hold for Investigation' | 'Manual Verification Required' | 'Contact Institution' | 'Reject Item'",
        "documentationRequired": ["string, e.g., 'Note MICR quality in system', 'Log potential alteration signs'"],
        "processingTimeframe": "'Standard' | 'Expedited Review' | 'Immediate Action'",
        "escalationPath": "string | null, e.g., 'Fraud Prevention Team'"
      },
      "institutionContext": {
        "bankName": "string (from provided context)",
        "institutionRiskProfile": "'Standard' | 'Enhanced Monitoring' | 'High Risk' | 'Unknown' (from provided context)",
        "recentIssuesWithInstitution": ["string, e.g., 'AI general knowledge: recent phishing scam involving this FI type'"],
        "keyVerificationContacts": [
          { "type": "'Verification' | 'Fraud Department' | 'Branch General' | 'Customer Service' | 'Compliance'", "method": "'Phone' | 'Email' | 'Secure Portal' | 'Internal System'", "details": "string" }
        ]
      },
      "summaryStatement": "string (Concise, actionable summary for the operator, max 150 chars)"
    }

    CONTEXT:
    Initial Cheque Findings Summary: ${JSON.stringify(findingsSummary)}
    Financial Institution Context: ${JSON.stringify(institutionContext)}

    YOUR TASK - Generate the Decision Intelligence JSON:
    1.  **overallRiskAssessment**:
        *   \`riskLevel\`: Synthesize ALL findings (MICR issues, date problems, security anomalies, potential fraud, institution risk) to assign an operational risk level.
            - 'Accept': Minimal issues, standard processing recommended. Example: "Standard security features present - Normal processing recommended. NOTE: Watermark detected, proceed with confidence."
            - 'Review': Some anomalies warranting closer look or simple verification. Example: "MICR positioning outside standards - May cause processing delays. RECOMMENDED: Process with manual verification notation."
            - 'Investigate': Significant concerns, requires specialist review/investigation. Example: "Signature analysis flagged - RECOMMENDED: Compare with signature card. ESCALATE: If signature doesn't match, route to fraud prevention team."
            - 'Reject': Clear grounds for rejection (e.g., closed FI, obvious critical fraud, non-negotiable item).
        *   \`confidence\`: Your confidence (0-100) in this \`riskLevel\` assessment.
        *   \`reasonsForConcern\`: List 2-4 specific, concise reasons. Examples: "MICR transit checksum failed AND institution risk profile is 'High Risk'.", "Suspected payee alteration.", "Cheque is post-dated by over 30 days."
        *   \`recommendedActions\`: List 2-4 actionable steps for the operator. Examples: "Manually verify MICR with branch directory.", "Flag for supervisor review.", "Contact institution verification line.", "Advise customer of rejection."
        *   \`similarCases\`: For now, return an empty array []. (This is for future enhancement with a case DB).
    2.  **operationsGuidance**:
        *   \`immediateAction\`: The single most critical next step for the operator based on the \`riskLevel\`.
        *   \`documentationRequired\`: Key items to document. Example: "Log MICR quality as 'Fair'.", "Document reason for 'Review' status."
        *   \`processingTimeframe\`: Urgency.
        *   \`escalationPath\`: If escalation is needed, to whom? (e.g., "Fraud Prevention Team", "Senior Teller", "Branch Manager"). Null if not needed for 'Accept'.
    3.  **institutionContext**:
        *   Populate \`bankName\` and \`institutionRiskProfile\` from the provided context.
        *   For \`recentIssuesWithInstitution\`, if you have *general, publicly known* information about systemic issues related to this *type* of institution or recent widespread fraud patterns relevant to cheques, add 1-2 notes. Do NOT invent specific FI issues. If none, use an empty array.
        *   Populate \`keyVerificationContacts\` from the provided context.
    4.  **summaryStatement**: A single, clear sentence (max 150 characters) summarizing the overall situation and the most critical action. Example: "Review: Cheque from 'High Risk' FI with MICR anomaly; verify transit and escalate if concerns persist."

    Prioritize clarity, actionability, and Canadian banking context. Be decisive based on the inputs.
  `

  try {
    const result = await model.generateContent([{ text: prompt }])
    const response = await result.response
    const text = response.text()
    
    const fallback = {
      overallRiskAssessment: { 
        riskLevel: 'Review', 
        confidence: 50, 
        reasonsForConcern: ["AI decision generation fallback."], 
        recommendedActions: ["Manual review suggested."],
        similarCases: []
      },
      operationsGuidance: { 
        immediateAction: 'Route to Supervisor', 
        documentationRequired: ["Note AI fallback."], 
        processingTimeframe: 'Expedited Review',
        escalationPath: null
      },
      institutionContext: institutionContext || { 
        bankName: "Unknown", 
        institutionRiskProfile: 'Unknown',
        recentIssuesWithInstitution: [],
        keyVerificationContacts: []
      },
      summaryStatement: "AI decision generation fallback; manual review suggested."
    }
    
    return parseJsonResponse(text, fallback, "generateDecisionIntelligence")
  } catch (error) {
    console.error('Error in generateDecisionIntelligence:', error)
    throw error
  }
}

function parseJsonResponse(jsonStr: string, fallbackResult: any, operationName: string) {
  let cleanedJsonStr = jsonStr.trim()
  
  // Remove markdown code fences if present
  const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s
  const match = cleanedJsonStr.match(fenceRegex)
  if (match && match[2]) {
    cleanedJsonStr = match[2].trim()
  }
  
  try {
    return JSON.parse(cleanedJsonStr)
  } catch (e) {
    console.error(`Failed to parse JSON response for ${operationName}:`, e, "Raw response:", cleanedJsonStr)
    return {
      ...fallbackResult,
      processingNotes: `Failed to parse AI response for ${operationName}. Raw text: ${cleanedJsonStr.substring(0,200)}...`,
    }
  }
}