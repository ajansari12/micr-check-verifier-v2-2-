import { GoogleGenerativeAI } from "npm:@google/generative-ai@^0.21.0"

export function initializeGemini() {
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY')
  if (!geminiApiKey) {
    throw new Error('GEMINI_API_KEY not found in environment variables')
  }
  
  const genAI = new GoogleGenerativeAI(geminiApiKey)
  return genAI.getGenerativeModel({ model: "gemini-1.5-flash" })
}

export function parseJsonResponse(jsonStr: string, fallbackResult: any, operationName: string) {
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