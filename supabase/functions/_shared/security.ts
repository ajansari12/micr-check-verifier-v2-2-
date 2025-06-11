import { ApiError } from './utils.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface SecurityContext {
  userId?: string
  sessionId?: string
  ipAddress?: string
  userAgent?: string
  origin?: string
}

export interface AuthResult {
  valid: boolean
  userId?: string
  error?: string
  metadata?: Record<string, any>
}

// IP-based rate limiting store
const ipRateLimitStore = new Map<string, { count: number; resetTime: number; blocked?: boolean }>()
const suspiciousIPs = new Set<string>()

// Security utilities
export class SecurityManager {
  private supabase: any
  
  constructor() {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (supabaseUrl && supabaseServiceKey) {
      this.supabase = createClient(supabaseUrl, supabaseServiceKey)
    }
  }

  // Enhanced authentication validation
  async validateAuth(request: Request): Promise<AuthResult> {
    const authHeader = request.headers.get('authorization')
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { valid: false, error: 'Missing or invalid authorization header' }
    }

    const token = authHeader.substring(7)
    
    try {
      if (!this.supabase) {
        // Fallback: basic token validation without Supabase
        if (token.length < 20) {
          return { valid: false, error: 'Invalid token format' }
        }
        return { valid: true }
      }

      const { data, error } = await this.supabase.auth.getUser(token)
      
      if (error || !data.user) {
        return { valid: false, error: 'Invalid or expired token' }
      }

      return {
        valid: true,
        userId: data.user.id,
        metadata: {
          email: data.user.email,
          lastSignIn: data.user.last_sign_in_at
        }
      }
    } catch (error) {
      console.error('Auth validation error:', error)
      return { valid: false, error: 'Authentication service error' }
    }
  }

  // IP-based security checks
  checkIPSecurity(ipAddress: string): { allowed: boolean; reason?: string } {
    // Check if IP is in suspicious list
    if (suspiciousIPs.has(ipAddress)) {
      return { allowed: false, reason: 'IP flagged as suspicious' }
    }

    // Check for blocked IPs
    const ipEntry = ipRateLimitStore.get(ipAddress)
    if (ipEntry?.blocked) {
      const now = Date.now()
      if (now < ipEntry.resetTime) {
        return { allowed: false, reason: 'IP temporarily blocked' }
      } else {
        // Reset block
        ipRateLimitStore.delete(ipAddress)
      }
    }

    return { allowed: true }
  }

  // Flag suspicious activity
  flagSuspiciousActivity(
    ipAddress: string, 
    reason: string, 
    context?: SecurityContext
  ): void {
    console.warn(`Suspicious activity from ${ipAddress}: ${reason}`, context)
    
    suspiciousIPs.add(ipAddress)
    
    // Block IP for 1 hour
    ipRateLimitStore.set(ipAddress, {
      count: 0,
      resetTime: Date.now() + (60 * 60 * 1000), // 1 hour
      blocked: true
    })

    // Log to database if available
    if (this.supabase) {
      this.logSecurityEvent({
        type: 'suspicious_activity',
        ipAddress,
        reason,
        context,
        timestamp: new Date().toISOString()
      }).catch(console.error)
    }
  }

  // Advanced rate limiting with pattern detection
  checkAdvancedRateLimit(
    ipAddress: string,
    endpoint: string,
    windowMs: number = 60000,
    maxRequests: number = 100
  ): { allowed: boolean; remaining: number; resetTime: number; suspicious?: boolean } {
    const key = `${ipAddress}:${endpoint}`
    const now = Date.now()
    
    let entry = ipRateLimitStore.get(key)
    
    if (!entry || entry.resetTime < now) {
      entry = {
        count: 1,
        resetTime: now + windowMs
      }
      ipRateLimitStore.set(key, entry)
      
      return {
        allowed: true,
        remaining: maxRequests - 1,
        resetTime: entry.resetTime
      }
    }

    entry.count++
    
    // Pattern detection: Very high request rate
    if (entry.count > maxRequests * 2) {
      this.flagSuspiciousActivity(ipAddress, `Excessive requests to ${endpoint}`)
      return {
        allowed: false,
        remaining: 0,
        resetTime: entry.resetTime,
        suspicious: true
      }
    }

    const allowed = entry.count <= maxRequests
    
    return {
      allowed,
      remaining: Math.max(0, maxRequests - entry.count),
      resetTime: entry.resetTime,
      suspicious: false
    }
  }

  // Content security validation
  validateRequestContent(
    data: any,
    maxStringLength: number = 10000,
    maxObjectDepth: number = 10
  ): { valid: boolean; reason?: string } {
    try {
      // Check for excessively large strings (potential DoS)
      const checkStrings = (obj: any, depth: number = 0): boolean => {
        if (depth > maxObjectDepth) {
          throw new Error('Object depth exceeds limit')
        }

        if (typeof obj === 'string') {
          return obj.length <= maxStringLength
        }

        if (Array.isArray(obj)) {
          return obj.every(item => checkStrings(item, depth + 1))
        }

        if (typeof obj === 'object' && obj !== null) {
          return Object.values(obj).every(value => checkStrings(value, depth + 1))
        }

        return true
      }

      if (!checkStrings(data)) {
        return { valid: false, reason: 'String length exceeds limit' }
      }

      // Check for potential injection patterns
      const jsonString = JSON.stringify(data)
      const suspiciousPatterns = [
        /<script/i,
        /javascript:/i,
        /on\w+\s*=/i,
        /eval\s*\(/i,
        /Function\s*\(/i
      ]

      for (const pattern of suspiciousPatterns) {
        if (pattern.test(jsonString)) {
          return { valid: false, reason: 'Potentially malicious content detected' }
        }
      }

      return { valid: true }
    } catch (error) {
      return { valid: false, reason: `Content validation error: ${error instanceof Error ? error.message : 'Unknown'}` }
    }
  }

  // Request origin validation
  validateOrigin(request: Request, allowedOrigins: string[]): boolean {
    const origin = request.headers.get('origin')
    const referer = request.headers.get('referer')
    
    // For non-browser requests, origin might not be present
    if (!origin && !referer) {
      return true // Allow for API clients
    }

    const requestOrigin = origin || (referer ? new URL(referer).origin : '')
    
    return allowedOrigins.some(allowed => {
      if (allowed === '*') return true
      if (allowed.includes('*')) {
        const pattern = allowed.replace(/\*/g, '.*')
        return new RegExp(`^${pattern}$`).test(requestOrigin)
      }
      return requestOrigin === allowed
    })
  }

  // Log security events
  private async logSecurityEvent(event: {
    type: string
    ipAddress: string
    reason: string
    context?: SecurityContext
    timestamp: string
  }): Promise<void> {
    try {
      if (!this.supabase) return

      await this.supabase
        .from('security_logs')
        .insert({
          event_type: event.type,
          ip_address: event.ipAddress,
          reason: event.reason,
          context: event.context || {},
          created_at: event.timestamp
        })
    } catch (error) {
      console.error('Failed to log security event:', error)
    }
  }

  // Cleanup expired entries (call periodically)
  cleanup(): void {
    const now = Date.now()
    
    for (const [key, entry] of ipRateLimitStore.entries()) {
      if (entry.resetTime < now) {
        ipRateLimitStore.delete(key)
      }
    }
  }
}

// Global security manager instance
const securityManager = new SecurityManager()

// Exported utility functions
export function validateAuth(request: Request): Promise<AuthResult> {
  return securityManager.validateAuth(request)
}

export function checkIPSecurity(ipAddress: string) {
  return securityManager.checkIPSecurity(ipAddress)
}

export function checkAdvancedRateLimit(
  ipAddress: string,
  endpoint: string,
  windowMs?: number,
  maxRequests?: number
) {
  return securityManager.checkAdvancedRateLimit(ipAddress, endpoint, windowMs, maxRequests)
}

export function validateRequestContent(data: any, maxStringLength?: number, maxObjectDepth?: number) {
  return securityManager.validateRequestContent(data, maxStringLength, maxObjectDepth)
}

export function validateOrigin(request: Request, allowedOrigins: string[]) {
  return securityManager.validateOrigin(request, allowedOrigins)
}

export function flagSuspiciousActivity(ipAddress: string, reason: string, context?: SecurityContext) {
  securityManager.flagSuspiciousActivity(ipAddress, reason, context)
}

export function getSecurityContext(request: Request): SecurityContext {
  return {
    ipAddress: getClientIP(request),
    userAgent: request.headers.get('user-agent') || undefined,
    origin: request.headers.get('origin') || undefined
  }
}

export function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  
  const realIP = request.headers.get('x-real-ip')
  if (realIP) {
    return realIP.trim()
  }
  
  const cfIP = request.headers.get('cf-connecting-ip')
  if (cfIP) {
    return cfIP.trim()
  }
  
  return 'unknown'
}

// Comprehensive security check for requests
export function performSecurityCheck(
  request: Request,
  data: any,
  options: {
    requireAuth?: boolean
    maxRequestSize?: number
    allowedOrigins?: string[]
    rateLimit?: { windowMs: number; maxRequests: number }
    endpoint?: string
  } = {}
): Promise<{ passed: boolean; reason?: string; context?: SecurityContext }> {
  return new Promise(async (resolve) => {
    const context = getSecurityContext(request)
    
    try {
      // IP security check
      const ipCheck = checkIPSecurity(context.ipAddress || 'unknown')
      if (!ipCheck.allowed) {
        return resolve({ passed: false, reason: ipCheck.reason, context })
      }

      // Rate limiting
      if (options.rateLimit && options.endpoint && context.ipAddress) {
        const rateCheck = checkAdvancedRateLimit(
          context.ipAddress,
          options.endpoint,
          options.rateLimit.windowMs,
          options.rateLimit.maxRequests
        )
        
        if (!rateCheck.allowed) {
          if (rateCheck.suspicious) {
            flagSuspiciousActivity(context.ipAddress, 'Rate limit exceeded with suspicious pattern', context)
          }
          return resolve({ passed: false, reason: 'Rate limit exceeded', context })
        }
      }

      // Origin validation
      if (options.allowedOrigins) {
        if (!validateOrigin(request, options.allowedOrigins)) {
          flagSuspiciousActivity(context.ipAddress || 'unknown', 'Invalid origin', context)
          return resolve({ passed: false, reason: 'Invalid request origin', context })
        }
      }

      // Content validation
      if (data) {
        const contentCheck = validateRequestContent(data)
        if (!contentCheck.valid) {
          flagSuspiciousActivity(context.ipAddress || 'unknown', `Content validation failed: ${contentCheck.reason}`, context)
          return resolve({ passed: false, reason: contentCheck.reason, context })
        }
      }

      // Authentication check
      if (options.requireAuth) {
        const authResult = await validateAuth(request)
        if (!authResult.valid) {
          return resolve({ passed: false, reason: authResult.error || 'Authentication failed', context })
        }
        context.userId = authResult.userId
      }

      resolve({ passed: true, context })
    } catch (error) {
      console.error('Security check error:', error)
      resolve({ passed: false, reason: 'Security check failed', context })
    }
  })
}

// Periodic cleanup (call this from a scheduled function)
export function cleanupSecurityStore(): void {
  securityManager.cleanup()
}