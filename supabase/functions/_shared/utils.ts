import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
  timestamp: string
  requestId?: string
}

export interface ErrorContext {
  operation: string
  userId?: string
  requestId?: string
  metadata?: Record<string, any>
}

export interface RateLimitConfig {
  windowMs: number
  maxRequests: number
  keyGenerator?: (req: Request) => string
}

// Response formatting helpers
export function createSuccessResponse<T>(data: T, message?: string): ApiResponse<T> {
  return {
    success: true,
    data,
    message,
    timestamp: new Date().toISOString(),
    requestId: generateRequestId()
  }
}

export function createErrorResponse(error: string, statusCode?: number): ApiResponse {
  return {
    success: false,
    error,
    timestamp: new Date().toISOString(),
    requestId: generateRequestId()
  }
}

// Request ID generation
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
}

// Environment variable helpers
export function getRequiredEnv(key: string): string {
  const value = Deno.env.get(key)
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`)
  }
  return value
}

export function getOptionalEnv(key: string, defaultValue?: string): string | undefined {
  return Deno.env.get(key) || defaultValue
}

// Supabase client initialization
export function createSupabaseClient() {
  const supabaseUrl = getRequiredEnv('SUPABASE_URL')
  const supabaseServiceKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

// Error handling utilities
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public context?: ErrorContext
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function handleError(error: unknown, context?: ErrorContext): Response {
  console.error('API Error:', error, context)
  
  if (error instanceof ApiError) {
    return new Response(
      JSON.stringify(createErrorResponse(error.message)),
      {
        status: error.statusCode,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
  
  if (error instanceof Error) {
    return new Response(
      JSON.stringify(createErrorResponse(error.message)),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
  
  return new Response(
    JSON.stringify(createErrorResponse('Unknown error occurred')),
    {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }
  )
}

// Rate limiting utilities
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

export function checkRateLimit(
  request: Request,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetTime: number } {
  const key = config.keyGenerator ? 
    config.keyGenerator(request) : 
    getClientIP(request) || 'unknown'
  
  const now = Date.now()
  const windowStart = now - config.windowMs
  
  // Clean up expired entries
  for (const [k, v] of rateLimitStore.entries()) {
    if (v.resetTime < now) {
      rateLimitStore.delete(k)
    }
  }
  
  const entry = rateLimitStore.get(key)
  if (!entry || entry.resetTime < now) {
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + config.windowMs
    })
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetTime: now + config.windowMs
    }
  }
  
  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime
    }
  }
  
  entry.count++
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetTime: entry.resetTime
  }
}

// Request utilities
export function getClientIP(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  
  const realIP = request.headers.get('x-real-ip')
  if (realIP) {
    return realIP.trim()
  }
  
  return null
}

export function getUserAgent(request: Request): string | null {
  return request.headers.get('user-agent')
}

export async function parseJsonBody<T>(request: Request): Promise<T> {
  try {
    const body = await request.json()
    return body as T
  } catch (error) {
    throw new ApiError('Invalid JSON in request body', 400, 'INVALID_JSON')
  }
}

// Authentication utilities
export function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }
  return authHeader.substring(7)
}

export function validateAuthHeader(request: Request): string {
  const token = extractBearerToken(request)
  if (!token) {
    throw new ApiError('Missing or invalid authorization header', 401, 'MISSING_AUTH')
  }
  return token
}

// Data sanitization utilities
export function sanitizeString(input: string, maxLength: number = 1000): string {
  if (typeof input !== 'string') {
    throw new ApiError('Input must be a string', 400, 'INVALID_INPUT_TYPE')
  }
  
  // Remove potentially dangerous characters
  const sanitized = input
    .replace(/[<>]/g, '') // Remove HTML-like characters
    .replace(/['"]/g, '') // Remove quotes
    .replace(/[;]/g, '') // Remove semicolons
    .trim()
  
  if (sanitized.length > maxLength) {
    throw new ApiError(`Input too long. Maximum ${maxLength} characters allowed`, 400, 'INPUT_TOO_LONG')
  }
  
  return sanitized
}

export function sanitizeObject(obj: Record<string, any>, allowedKeys: string[]): Record<string, any> {
  const sanitized: Record<string, any> = {}
  
  for (const key of allowedKeys) {
    if (key in obj) {
      const value = obj[key]
      if (typeof value === 'string') {
        sanitized[key] = sanitizeString(value)
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        sanitized[key] = value
      } else if (Array.isArray(value)) {
        sanitized[key] = value.filter(item => typeof item === 'string').map(item => sanitizeString(item))
      }
    }
  }
  
  return sanitized
}

// Timeout utilities
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage?: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new ApiError(
        timeoutMessage || `Operation timed out after ${timeoutMs}ms`,
        408,
        'TIMEOUT'
      )), timeoutMs)
    )
  ])
}

// Retry utilities
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 1000,
  backoffMultiplier: number = 2
): Promise<T> {
  let lastError: Error
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      
      if (attempt === maxRetries) {
        throw lastError
      }
      
      const delay = initialDelayMs * Math.pow(backoffMultiplier, attempt)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  throw lastError!
}

// Configuration management
export interface AppConfig {
  gemini: {
    apiKey: string
    model: string
    timeout: number
    maxRetries: number
  }
  rateLimit: {
    windowMs: number
    maxRequests: number
  }
  security: {
    maxImageSize: number
    allowedImageTypes: string[]
  }
  compliance: {
    logAllOperations: boolean
    osfiReportingThreshold: number
  }
}

export function loadConfig(): AppConfig {
  return {
    gemini: {
      apiKey: getRequiredEnv('GEMINI_API_KEY'),
      model: getOptionalEnv('GEMINI_MODEL') || 'gemini-1.5-flash',
      timeout: parseInt(getOptionalEnv('GEMINI_TIMEOUT') || '30000'),
      maxRetries: parseInt(getOptionalEnv('GEMINI_MAX_RETRIES') || '3')
    },
    rateLimit: {
      windowMs: parseInt(getOptionalEnv('RATE_LIMIT_WINDOW_MS') || '60000'),
      maxRequests: parseInt(getOptionalEnv('RATE_LIMIT_MAX_REQUESTS') || '100')
    },
    security: {
      maxImageSize: parseInt(getOptionalEnv('MAX_IMAGE_SIZE') || '10485760'), // 10MB
      allowedImageTypes: (getOptionalEnv('ALLOWED_IMAGE_TYPES') || 'image/jpeg,image/png,image/tiff').split(',')
    },
    compliance: {
      logAllOperations: getOptionalEnv('LOG_ALL_OPERATIONS') === 'true',
      osfiReportingThreshold: parseInt(getOptionalEnv('OSFI_REPORTING_THRESHOLD') || '70')
    }
  }
}

// Health check utilities
export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy'
  timestamp: string
  checks: Record<string, { status: 'pass' | 'fail'; message?: string; duration?: number }>
}

export async function performHealthCheck(): Promise<HealthCheckResult> {
  const checks: Record<string, { status: 'pass' | 'fail'; message?: string; duration?: number }> = {}
  
  // Check Supabase connection
  try {
    const start = Date.now()
    const supabase = createSupabaseClient()
    await supabase.from('compliance_logs').select('id').limit(1)
    checks.supabase = {
      status: 'pass',
      duration: Date.now() - start
    }
  } catch (error) {
    checks.supabase = {
      status: 'fail',
      message: error instanceof Error ? error.message : 'Unknown error'
    }
  }
  
  // Check Gemini API
  try {
    const start = Date.now()
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not configured')
    }
    checks.gemini = {
      status: 'pass',
      duration: Date.now() - start
    }
  } catch (error) {
    checks.gemini = {
      status: 'fail',
      message: error instanceof Error ? error.message : 'Unknown error'
    }
  }
  
  const allPassed = Object.values(checks).every(check => check.status === 'pass')
  
  return {
    status: allPassed ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    checks
  }
}