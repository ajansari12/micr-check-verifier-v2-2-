import { GoogleGenerativeAI } from "npm:@google/generative-ai@^0.21.0"
import { ApiError, withTimeout, retryWithBackoff } from './utils.ts'

export interface GeminiConfig {
  apiKey: string
  model: string
  timeout: number
  maxRetries: number
  temperature?: number
  topP?: number
  topK?: number
  maxOutputTokens?: number
}

export interface GeminiRequest {
  prompt: string
  imageBase64?: string
  systemInstruction?: string
  safetySettings?: any[]
}

export interface GeminiResponse {
  text: string
  finishReason?: string
  safetyRatings?: any[]
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export class GeminiService {
  private model: any
  private config: GeminiConfig

  constructor(config: GeminiConfig) {
    this.config = config
    
    if (!config.apiKey) {
      throw new ApiError('GEMINI_API_KEY not found in environment variables', 500, 'MISSING_API_KEY')
    }

    try {
      const genAI = new GoogleGenerativeAI(config.apiKey)
      this.model = genAI.getGenerativeModel({ 
        model: config.model,
        generationConfig: {
          temperature: config.temperature || 0.1,
          topP: config.topP || 0.8,
          topK: config.topK || 40,
          maxOutputTokens: config.maxOutputTokens || 8192,
        }
      })
    } catch (error) {
      throw new ApiError(
        `Failed to initialize Gemini AI: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500,
        'GEMINI_INIT_ERROR'
      )
    }
  }

  async generateContent(request: GeminiRequest): Promise<GeminiResponse> {
    try {
      const parts: any[] = []
      
      // Add system instruction if provided
      if (request.systemInstruction) {
        parts.push({ text: request.systemInstruction })
      }
      
      // Add main prompt
      parts.push({ text: request.prompt })
      
      // Add image if provided
      if (request.imageBase64) {
        this.validateImageData(request.imageBase64)
        parts.push({
          inlineData: {
            mimeType: this.detectImageMimeType(request.imageBase64),
            data: request.imageBase64
          }
        })
      }

      const operation = () => this.model.generateContent({
        contents: [{ parts }],
        safetySettings: request.safetySettings || this.getDefaultSafetySettings()
      })

      // Apply timeout and retry logic
      const result = await retryWithBackoff(
        () => withTimeout(operation(), this.config.timeout),
        this.config.maxRetries
      )

      const response = await result.response
      const text = response.text()

      return {
        text,
        finishReason: response.candidates?.[0]?.finishReason,
        safetyRatings: response.candidates?.[0]?.safetyRatings,
        usage: response.usageMetadata ? {
          promptTokens: response.usageMetadata.promptTokenCount || 0,
          completionTokens: response.usageMetadata.candidatesTokenCount || 0,
          totalTokens: response.usageMetadata.totalTokenCount || 0
        } : undefined
      }

    } catch (error) {
      if (error instanceof ApiError) {
        throw error
      }
      
      // Handle specific Gemini API errors
      if (error instanceof Error) {
        if (error.message.includes('API key')) {
          throw new ApiError('Invalid Gemini API key', 401, 'INVALID_API_KEY')
        }
        if (error.message.includes('quota')) {
          throw new ApiError('Gemini API quota exceeded', 429, 'QUOTA_EXCEEDED')
        }
        if (error.message.includes('safety')) {
          throw new ApiError('Content blocked by safety filters', 400, 'CONTENT_BLOCKED')
        }
        if (error.message.includes('timeout')) {
          throw new ApiError('Gemini API request timed out', 408, 'REQUEST_TIMEOUT')
        }
      }
      
      throw new ApiError(
        `Gemini API error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500,
        'GEMINI_API_ERROR'
      )
    }
  }

  private validateImageData(imageBase64: string): void {
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      throw new ApiError('Invalid image data: must be a base64 string', 400, 'INVALID_IMAGE_DATA')
    }

    // Check size (approximate)
    const sizeInBytes = (imageBase64.length * 3) / 4
    const maxSize = 20 * 1024 * 1024 // 20MB
    
    if (sizeInBytes > maxSize) {
      throw new ApiError('Image too large: maximum 20MB allowed', 400, 'IMAGE_TOO_LARGE')
    }

    // Validate base64 format
    try {
      atob(imageBase64.substring(0, 100)) // Test decode a small portion
    } catch {
      throw new ApiError('Invalid base64 image format', 400, 'INVALID_BASE64')
    }
  }

  private detectImageMimeType(imageBase64: string): string {
    try {
      const decoded = atob(imageBase64.substring(0, 20))
      const bytes = new Uint8Array(decoded.split('').map(char => char.charCodeAt(0)))

      // Check for image signatures
      if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
        return 'image/jpeg'
      }
      if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
        return 'image/png'
      }
      if ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2A && bytes[3] === 0x00) ||
          (bytes[0] === 0x4D && bytes[1] === 0x4D && bytes[2] === 0x00 && bytes[3] === 0x2A)) {
        return 'image/tiff'
      }
      if (bytes[0] === 0x57 && bytes[1] === 0x45 && bytes[2] === 0x42 && bytes[3] === 0x50) {
        return 'image/webp'
      }
    } catch {
      // If detection fails, default to JPEG
    }
    
    return 'image/jpeg' // Default fallback
  }

  private getDefaultSafetySettings() {
    return [
      {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      },
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      },
      {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      },
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      }
    ]
  }
}

// Convenience function to initialize Gemini service
export function initializeGemini(customConfig?: Partial<GeminiConfig>): GeminiService {
  const config: GeminiConfig = {
    apiKey: Deno.env.get('GEMINI_API_KEY') || '',
    model: Deno.env.get('GEMINI_MODEL') || 'gemini-1.5-flash',
    timeout: parseInt(Deno.env.get('GEMINI_TIMEOUT') || '30000'),
    maxRetries: parseInt(Deno.env.get('GEMINI_MAX_RETRIES') || '3'),
    temperature: 0.1,
    topP: 0.8,
    topK: 40,
    maxOutputTokens: 8192,
    ...customConfig
  }

  return new GeminiService(config)
}

// JSON response parser with improved error handling
export function parseJsonResponse(
  jsonStr: string, 
  fallbackResult: any, 
  operationName: string,
  strict: boolean = false
): any {
  if (!jsonStr || typeof jsonStr !== 'string') {
    console.error(`${operationName}: Empty or invalid response`)
    return {
      ...fallbackResult,
      processingNotes: `${operationName}: Empty response received`
    }
  }

  let cleanedJsonStr = jsonStr.trim()
  
  // Remove markdown code fences if present
  const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s
  const match = cleanedJsonStr.match(fenceRegex)
  if (match && match[2]) {
    cleanedJsonStr = match[2].trim()
  }
  
  // Remove any leading/trailing non-JSON content
  const jsonStart = cleanedJsonStr.indexOf('{')
  const jsonEnd = cleanedJsonStr.lastIndexOf('}')
  
  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    cleanedJsonStr = cleanedJsonStr.substring(jsonStart, jsonEnd + 1)
  }
  
  try {
    const parsed = JSON.parse(cleanedJsonStr)
    
    // Validate that we got an object
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Parsed result is not an object')
    }
    
    return parsed
  } catch (e) {
    const errorMsg = `Failed to parse JSON response for ${operationName}: ${e instanceof Error ? e.message : 'Unknown error'}`
    console.error(errorMsg, 'Raw response:', cleanedJsonStr.substring(0, 500))
    
    if (strict) {
      throw new ApiError(errorMsg, 500, 'JSON_PARSE_ERROR')
    }
    
    return {
      ...fallbackResult,
      processingNotes: `${operationName}: ${errorMsg}. Raw text: ${cleanedJsonStr.substring(0, 200)}...`,
    }
  }
}

// Predefined prompts for Canadian banking operations
export const BankingPrompts = {
  chequeAnalysis: `
    Analyze this image of a Canadian bank cheque according to Canadian Payments Association (CPA) Standard 006 and general Canadian banking practices.
    Extract the following information and return it ONLY as a JSON object. Do not include markdown fences.

    Focus on accuracy, Canadian banking compliance, and thorough MICR line analysis.
    Validate the 9-digit Canadian transit number using the CPA checksum algorithm.
    Assess security features and potential fraud indicators.
    Note any compliance issues with OSFI or PIPEDA requirements.
  `,
  
  securityAssessment: `
    Analyze this Canadian cheque image specifically for security features and fraud indicators.
    Focus on Canadian banking security standards and OSFI reporting requirements.
    
    Identify security features like microprinting, void pantographs, watermarks, and chemical protection.
    Assess tampering evidence, alterations, and authenticity.
    Provide OSFI-compliant risk assessment and recommendations.
  `,
  
  complianceAnalysis: `
    Analyze this Canadian cheque for regulatory compliance with OSFI, PIPEDA, and CPA Standard 006.
    Focus on date validation, currency designation, and business day analysis.
    
    Identify any compliance flags that require OSFI reporting.
    Note PIPEDA data handling requirements and privacy considerations.
    Assess CPA Standard 006 visual compliance elements.
  `,
  
  institutionDetection: `
    Identify the Canadian financial institution from this cheque image using visual elements.
    Do not rely on MICR data for this analysis.
    
    Focus on logos, branding, design patterns, and institutional identifiers.
    Assess whether the institution appears to be OSFI-regulated.
    Provide confidence scoring and risk assessment.
  `,
  
  decisionIntelligence: `
    Generate comprehensive operational decision intelligence for Canadian banking.
    Synthesize all analysis results to provide clear, actionable guidance.
    
    Focus on regulatory compliance, risk assessment, and operational efficiency.
    Provide specific recommendations aligned with OSFI guidelines.
    Include escalation paths and documentation requirements.
  `
}

// Helper function for streaming responses (if needed in future)
export async function* generateContentStream(
  service: GeminiService,
  request: GeminiRequest
): AsyncGenerator<string, void, unknown> {
  // This would implement streaming for large responses
  // Currently, Gemini AI doesn't support streaming in edge functions
  // But this structure allows for future implementation
  const response = await service.generateContent(request)
  yield response.text
}