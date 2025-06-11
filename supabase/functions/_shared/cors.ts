export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-id, x-user-agent',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
  'Access-Control-Expose-Headers': 'x-request-id, x-rate-limit-remaining, x-rate-limit-reset',
  'Access-Control-Max-Age': '86400' // 24 hours
}

// Enhanced CORS configuration for different environments
export const corsConfigs = {
  development: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-id, x-user-agent',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
    'Access-Control-Allow-Credentials': 'false'
  },
  production: {
    'Access-Control-Allow-Origin': 'https://yourdomain.com', // Replace with actual domain
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-id',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Credentials': 'true'
  },
  boltNew: {
    'Access-Control-Allow-Origin': '*', // Bolt.new requires wildcard
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-id, x-user-agent',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
    'Access-Control-Allow-Credentials': 'false'
  }
}

export function getCorsHeaders(environment: 'development' | 'production' | 'boltNew' = 'development') {
  return corsConfigs[environment]
}

export function createCorsResponse(data?: any, status: number = 200, customHeaders: Record<string, string> = {}) {
  const headers = {
    ...corsHeaders,
    'Content-Type': 'application/json',
    'X-Request-ID': generateRequestId(),
    'X-Timestamp': new Date().toISOString(),
    ...customHeaders
  }

  return new Response(
    data ? JSON.stringify(data) : null,
    { status, headers }
  )
}

export function createErrorResponse(
  error: string, 
  status: number = 500, 
  code?: string,
  details?: any
) {
  const errorResponse = {
    error,
    code,
    details,
    timestamp: new Date().toISOString(),
    requestId: generateRequestId()
  }

  return new Response(
    JSON.stringify(errorResponse),
    {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'X-Request-ID': errorResponse.requestId
      }
    }
  )
}

export function handleCorsPreflightRequest(customHeaders: Record<string, string> = {}) {
  return new Response('ok', { 
    headers: { 
      ...corsHeaders,
      ...customHeaders
    } 
  })
}

// Rate limiting headers
export function addRateLimitHeaders(
  response: Response,
  remaining: number,
  resetTime: number,
  limit: number
): Response {
  const headers = new Headers(response.headers)
  headers.set('X-Rate-Limit-Limit', limit.toString())
  headers.set('X-Rate-Limit-Remaining', remaining.toString())
  headers.set('X-Rate-Limit-Reset', Math.ceil(resetTime / 1000).toString())

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}

// Security headers
export function addSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers)
  
  // Prevent XSS attacks
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('X-Frame-Options', 'DENY')
  headers.set('X-XSS-Protection', '1; mode=block')
  
  // Content Security Policy for API responses
  headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
  
  // Referrer policy
  headers.set('Referrer-Policy', 'no-referrer')
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}

// Helper to generate request IDs
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
}

// Comprehensive response helper that includes CORS, security, and rate limiting
export function createSecureResponse(
  data: any,
  status: number = 200,
  options: {
    rateLimitInfo?: { remaining: number; resetTime: number; limit: number }
    customHeaders?: Record<string, string>
    includeSecurityHeaders?: boolean
  } = {}
) {
  let response = createCorsResponse(data, status, options.customHeaders)
  
  // Add rate limiting headers if provided
  if (options.rateLimitInfo) {
    response = addRateLimitHeaders(
      response,
      options.rateLimitInfo.remaining,
      options.rateLimitInfo.resetTime,
      options.rateLimitInfo.limit
    )
  }
  
  // Add security headers if requested
  if (options.includeSecurityHeaders) {
    response = addSecurityHeaders(response)
  }
  
  return response
}