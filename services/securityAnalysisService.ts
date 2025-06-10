
import { GoogleGenAI, GenerateContentResponse, Part } from "@google/genai";
import { SecurityAssessment } from '../types'; // Assuming SecurityAssessment is in types.ts
import { GEMINI_VISION_MODEL, API_MAX_RETRIES, API_RETRY_DELAY_MS } from '../constants';

// --- Service-Specific Types ---

/**
 * Represents a detected fraud indicator with its details.
 */
export interface FraudIndicator {
  indicatorType: string; // e.g., "chemical_stain", "font_inconsistency", "poor_microprint_reproduction"
  description: string;   // Detailed observation from the AI
  severity: 'Low' | 'Medium' | 'High' | 'Critical'; // Severity of the indicator
  confidence?: number;  // Confidence score (0-100) from the AI for this specific indicator
  details?: Record<string, any>; // Additional details, e.g., location on cheque
}

/**
 * Represents a factor contributing to the overall fraud risk score.
 */
export interface SecurityFactor {
  id: string;          // Unique identifier for the factor (e.g., "microprinting_absent", "suspicious_edge_artifact")
  value: number;       // A numerical representation of the factor's state (e.g., 1 for present, 0 for absent, or a quality score)
  weight: number;      // The weight of this factor in risk calculation
  description?: string; // Optional description of why this factor is considered
}


// --- API Key and Client Initialization ---
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error("API_KEY environment variable not set for SecurityAnalysisService. Gemini API calls will fail.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY || "MISSING_SECURITY_API_KEY" });


// --- Helper for API Calls with Retry ---
// Assuming callGeminiWithRetry is either imported or defined similarly to geminiService.ts
// For this standalone file, let's define it here.
const callGeminiApiWithRetry = async <T,>(
  apiCall: () => Promise<T>,
  retries = API_MAX_RETRIES
): Promise<T> => {
  try {
    return await apiCall();
  } catch (error) {
    if (retries > 0) {
      console.warn(`Security Analysis API call failed, retrying in ${API_RETRY_DELAY_MS / 1000}s... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, API_RETRY_DELAY_MS));
      return callGeminiApiWithRetry(apiCall, retries - 1);
    }
    console.error("Security Analysis API call failed after multiple retries:", error);
    throw error; // Re-throw after exhausting retries
  }
};

// --- Core Service Functions ---

/**
 * 1. Analyzes cheque image for security features, fraud indicators, and overall risk.
 * Aims to populate the SecurityAssessment type directly from AI response.
 */
export const analyzeSecurityFeatures = async (imageBase64: string): Promise<SecurityAssessment> => {
  if (!API_KEY) return Promise.reject(new Error("API Key is not configured for Security Analysis Service."));

  const imagePart: Part = { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } };
  const prompt = `
    Analyze the provided Canadian cheque image for security features and fraud indicators according to Canadian banking standards.
    Return your analysis ONLY as a JSON object matching this structure:
    {
      "osfiReportableRisk": "boolean | null",
      "tamperEvidenceCheck": "'passed' | 'failed' | 'unknown' | null",
      "imageAuthenticityScore": "number | null",
      "detectedSecurityFeatures": ["string describing feature and quality/presence, e.g., 'Microprinting: present, good quality', 'Void Pantograph: detected', 'Watermark: not_visible'"],
      "fraudRiskLevel": "'Low' | 'Medium' | 'High' | 'Critical' | null",
      "alterationsEvident": "boolean | null",
      "counterfeitLikelihoodScore": "number | null",
      "suspiciousPatternsObserved": ["string describing observed pattern and severity, e.g., 'Chemical stain near amount: high severity', 'Font inconsistency in payee name: medium severity']"
    }

    Detailed Instructions:
    1.  **Detected Security Features**: For each common Canadian cheque security feature (Microprinting, Void Pantograph, MICR Encoding quality, Watermarks, Security Thread, Rainbow Printing, Chemical Protection, Intaglio Printing), list it and its observed status (e.g., present, absent, quality if visible).
    2.  **Tampering & Alterations**:
        *   \`tamperEvidenceCheck\`: Assess overall if image shows signs of tampering ('passed', 'failed', 'unknown').
        *   \`alterationsEvident\`: Specifically state if alterations (erasures, overwriting, chemical changes to text) are evident.
        *   \`suspiciousPatternsObserved\`: List specific observations like chemical staining, erasure marks, misaligned printing, font inconsistencies, color variations in text, edge artifacts (copy/paste), inconsistent lighting, compression artifacts, pixel inconsistencies. Note severity.
    3.  **Counterfeit Indicators**:
        *   \`counterfeitLikelihoodScore\`: Based on visual evidence (poor reproduction of security features, incorrect paper look, missing elements, digital printing artifacts, incorrect MICR positioning), provide a score (0-100) for likelihood of being a counterfeit.
        *   Also include relevant observations in 'suspiciousPatternsObserved' or 'detectedSecurityFeatures' (e.g., 'Microprinting: poorly_reproduced').
    4.  **Image Authenticity**:
        *   \`imageAuthenticityScore\`: Provide a score (0-100) for the likelihood that the image itself is genuine and not digitally manipulated.
    5.  **Overall Fraud Risk**:
        *   \`fraudRiskLevel\`: Based on all findings, categorize the overall fraud risk.
    6.  **OSFI Reportable Risk**: Set \`osfiReportableRisk\` to true if the \`fraudRiskLevel\` is 'Critical' or if specific high-severity OSFI-defined triggers are met. Default to null if uncertain.

    Be thorough and base your assessment on visual evidence only.
  `;
  const textPart: Part = { text: prompt };

  const apiCall = async () => {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_VISION_MODEL,
      contents: { parts: [imagePart, textPart] },
      config: { responseMimeType: "application/json" },
    });

    let jsonStr = response.text.trim();
    const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonStr.match(fenceRegex);
    if (match && match[2]) {
      jsonStr = match[2].trim();
    }

    try {
      const parsed = JSON.parse(jsonStr) as SecurityAssessment;
      // Post-process osfiReportableRisk if AI provides fraudRiskLevel
      if (parsed.fraudRiskLevel === 'Critical' && parsed.osfiReportableRisk !== true) {
        parsed.osfiReportableRisk = true;
      }
      return parsed;
    } catch (e) {
      console.error("Failed to parse JSON from security analysis:", e, "Raw:", jsonStr);
      throw new Error(`AI response for security analysis was not valid JSON. Raw: ${jsonStr.substring(0, 200)}`);
    }
  };

  return callGeminiApiWithRetry(apiCall);
};

/**
 * 2. Detects specific fraud indicators from the image data using a focused AI prompt.
 */
export const detectFraudIndicators = async (imageBase64: string): Promise<FraudIndicator[]> => {
  if (!API_KEY) return Promise.reject(new Error("API Key is not configured."));

  const imagePart: Part = { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } };
  const prompt = `
    Analyze the provided Canadian cheque image specifically for fraud indicators.
    Focus on signs of alteration, counterfeiting, and tampering.
    Return your findings ONLY as a JSON array of objects. Each object should follow this structure:
    {
      "indicatorType": "string", // e.g., "chemical_stain", "font_inconsistency", "misaligned_printing", "poor_microprint_reproduction", "edge_artifact", "pixel_inconsistency"
      "description": "string",   // Detailed observation
      "severity": "'Low' | 'Medium' | 'High' | 'Critical'",
      "confidence": "number"  // Your confidence (0-100) in detecting this specific indicator
    }
    If no indicators are found, return an empty array.

    Examples of indicators to look for:
    - Alteration Signs: Chemical staining, erasure marks, overwriting, misaligned/inconsistent printing (font, size, color), smudged ink.
    - Counterfeit Indicators: Poor reproduction quality of security features (e.g., blurry microprinting, flat void pantograph), incorrect paper weight/texture (if discernible), missing or fake security elements (e.g., printed watermarks), digital printing artifacts (pixelation, banding), incorrect MICR line positioning or font quality.
    - Tampering Evidence: Edge artifacts suggesting copy/paste, inconsistent lighting across the document, unusual compression artifacts, pixel-level inconsistencies in text or numbers.
  `;
  const textPart: Part = { text: prompt };

  const apiCall = async () => {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_VISION_MODEL,
      contents: { parts: [imagePart, textPart] },
      config: { responseMimeType: "application/json" },
    });

    let jsonStr = response.text.trim();
    const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonStr.match(fenceRegex);
    if (match && match[2]) {
      jsonStr = match[2].trim();
    }
    
    try {
      const parsed = JSON.parse(jsonStr) as FraudIndicator[];
      return Array.isArray(parsed) ? parsed : []; // Ensure it's an array
    } catch (e) {
      console.error("Failed to parse JSON for fraud indicators:", e, "Raw:", jsonStr);
      // Return empty array or throw, depending on desired strictness
      return []; 
    }
  };
  return callGeminiApiWithRetry(apiCall);
};


/**
 * 3. Calculates a numerical fraud risk score based on weighted security factors.
 */
export const calculateFraudRisk = (factors: SecurityFactor[]): number => {
  let totalWeightedRisk = 0;
  let totalMaxPossibleWeight = 0;

  if (!factors || factors.length === 0) return 0;

  factors.forEach(factor => {
    // Assuming factor.value is 1 if the risk factor is present/failed, 0 if absent/passed.
    // Or it could be a score itself (e.g. quality 0-1, where 1 is bad quality)
    // For simplicity, let's assume value of 1 = risk present.
    totalWeightedRisk += factor.value * factor.weight;
    totalMaxPossibleWeight += factor.weight; // Assuming max value for factor.value is 1 for calculating percentage
  });

  if (totalMaxPossibleWeight === 0) return 0;

  const riskScore = (totalWeightedRisk / totalMaxPossibleWeight) * 100;
  return Math.min(Math.max(Math.round(riskScore), 0), 100); // Ensure score is between 0 and 100
};

/**
 * 4. Assesses the authenticity of the image using AI.
 * Returns a score from 0 to 100, where 100 is high authenticity.
 */
export const assessImageAuthenticity = async (imageBase64: string): Promise<number> => {
  if (!API_KEY) return Promise.reject(new Error("API Key is not configured."));

  const imagePart: Part = { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } };
  const prompt = `
    Analyze the provided image of a Canadian cheque.
    Assess its authenticity based on visual cues suggesting digital manipulation, copy/paste operations,
    inconsistent lighting, compression artifacts, or other signs that it might not be an unaltered original scan/photo.
    Return ONLY a JSON object with a single key "imageAuthenticityScore",
    which is an integer score from 0 (definitely manipulated/fake) to 100 (highly likely genuine and unaltered).
    Example: {"imageAuthenticityScore": 85}
  `;
  const textPart: Part = { text: prompt };

  const apiCall = async () => {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_VISION_MODEL,
      contents: { parts: [imagePart, textPart] },
      config: { responseMimeType: "application/json" },
    });
    
    let jsonStr = response.text.trim();
    const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonStr.match(fenceRegex);
    if (match && match[2]) {
      jsonStr = match[2].trim();
    }

    try {
      const parsed = JSON.parse(jsonStr) as { imageAuthenticityScore: number };
      if (typeof parsed.imageAuthenticityScore === 'number' && parsed.imageAuthenticityScore >= 0 && parsed.imageAuthenticityScore <= 100) {
        return parsed.imageAuthenticityScore;
      }
      throw new Error("Invalid imageAuthenticityScore value received from AI.");
    } catch (e) {
      console.error("Failed to parse JSON for image authenticity:", e, "Raw:", jsonStr);
      throw new Error(`AI response for image authenticity was not valid. Raw: ${jsonStr.substring(0,100)}`);
    }
  };
  return callGeminiApiWithRetry(apiCall);
};

/**
 * 5. Checks if an OSFI (Office of the Superintendent of Financial Institutions) reporting is required.
 * OSFI reporting is typically required for critical risk incidents.
 * Critical risk threshold: score >= 70 or fraudRiskLevel === 'Critical'.
 */
export const checkOSFIReportingRequired = (
  riskScore: number, // A numerical score, typically 0-100
  fraudRiskLevelParam?: 'Low' | 'Medium' | 'High' | 'Critical' | null // Qualitative risk level
): boolean => {
  const CRITICAL_RISK_SCORE_THRESHOLD = 70; // As per OSFI general guidelines
  if (fraudRiskLevelParam === 'Critical') {
    return true;
  }
  return riskScore >= CRITICAL_RISK_SCORE_THRESHOLD;
};

/**
 * 6. Generates a human-readable security report string from the analysis results.
 */
export const generateSecurityReport = (
  analysisInput: SecurityAssessment,
  detailedFraudIndicators?: FraudIndicator[],
  calculatedRiskScore?: number
): string => {
  const {
    fraudRiskLevel,
    imageAuthenticityScore,
    counterfeitLikelihoodScore,
    tamperEvidenceCheck,
    alterationsEvident,
    osfiReportableRisk,
    detectedSecurityFeatures,
    suspiciousPatternsObserved
  } = analysisInput;

  let report = `Security Analysis Report:
-----------------------------
Overall Fraud Risk Level: ${fraudRiskLevel || 'Not Assessed'}
Image Authenticity Score: ${imageAuthenticityScore !== null ? imageAuthenticityScore + '/100' : 'N/A'}
Counterfeit Likelihood Score: ${counterfeitLikelihoodScore !== null ? counterfeitLikelihoodScore + '/100' : 'N/A'}
Tamper Evidence Check: ${tamperEvidenceCheck || 'Unknown'}
Alterations Evident: ${alterationsEvident === null ? 'Unknown' : alterationsEvident ? 'Yes' : 'No'}
OSFI Reporting Potentially Required: ${osfiReportableRisk ? 'Yes' : 'No'}
${calculatedRiskScore !== undefined ? `Calculated Numerical Risk Score: ${calculatedRiskScore}/100\n` : ''}

Detected Security Features:
${detectedSecurityFeatures && detectedSecurityFeatures.length > 0 ? detectedSecurityFeatures.map(f => `  - ${f}`).join('\n') : '  - None specifically itemized by AI / Check raw AI response.'}

Suspicious Patterns Observed by AI:
${suspiciousPatternsObserved && suspiciousPatternsObserved.length > 0 ? suspiciousPatternsObserved.map(p => `  - ${p}`).join('\n') : '  - None specifically itemized by AI.'}
`;

  if (detailedFraudIndicators && detailedFraudIndicators.length > 0) {
    report += `\nDetailed Fraud Indicators Detected by AI:
${detailedFraudIndicators.map(ind => `  - Type: ${ind.indicatorType}\n    Description: ${ind.description}\n    Severity: ${ind.severity}\n    Confidence: ${ind.confidence !== undefined ? ind.confidence + '%' : 'N/A'}`).join('\n\n')}
`;
  }
  report += `-----------------------------\nReport Generated: ${new Date().toLocaleString()}`;
  return report;
};
