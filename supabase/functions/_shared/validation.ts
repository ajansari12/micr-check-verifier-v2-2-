import { ApiError } from './utils.ts'

// Type definitions for validation
export interface ValidationRule<T = any> {
  required?: boolean
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object'
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  pattern?: RegExp
  enum?: T[]
  custom?: (value: T) => boolean | string
}

export interface ValidationSchema {
  [key: string]: ValidationRule
}

export interface ValidationResult {
  valid: boolean
  errors: Record<string, string[]>
}

// Base64 validation
export function validateBase64Image(base64String: string): boolean {
  if (!base64String || typeof base64String !== 'string') {
    return false
  }
  
  // Check if it's a valid base64 string
  try {
    const decoded = atob(base64String)
    
    // Check for common image signatures
    const signatures = {
      jpeg: [0xFF, 0xD8, 0xFF],
      png: [0x89, 0x50, 0x4E, 0x47],
      tiff: [0x49, 0x49, 0x2A, 0x00], // Little-endian TIFF
      tiffBig: [0x4D, 0x4D, 0x00, 0x2A] // Big-endian TIFF
    }
    
    const bytes = new Uint8Array(decoded.slice(0, 10))
    
    for (const [format, signature] of Object.entries(signatures)) {
      if (signature.every((byte, index) => bytes[index] === byte)) {
        return true
      }
    }
    
    return false
  } catch {
    return false
  }
}

// Canadian banking specific validations
export function validateCanadianTransitNumber(transitNumber: string): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (!transitNumber || typeof transitNumber !== 'string') {
    errors.push('Transit number is required')
    return { valid: false, errors }
  }
  
  // Must be exactly 9 digits
  if (!/^\d{9}$/.test(transitNumber)) {
    errors.push('Transit number must be exactly 9 digits')
    return { valid: false, errors }
  }
  
  // Validate CPA checksum
  const digits = transitNumber.split('').map(Number)
  const weights = [1, 7, 3, 1, 7, 3, 1, 7, 3]
  const sum = digits.reduce((acc, digit, index) => acc + digit * weights[index], 0)
  
  if (sum % 10 !== 0) {
    errors.push('Invalid transit number checksum')
  }
  
  return { valid: errors.length === 0, errors }
}

export function validateCanadianAccountNumber(accountNumber: string): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (!accountNumber || typeof accountNumber !== 'string') {
    errors.push('Account number is required')
    return { valid: false, errors }
  }
  
  // Account numbers are typically 3-20 characters, alphanumeric
  if (!/^[A-Za-z0-9]{3,20}$/.test(accountNumber)) {
    errors.push('Account number must be 3-20 alphanumeric characters')
  }
  
  return { valid: errors.length === 0, errors }
}

export function validateChequeDate(dateString: string): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (!dateString || typeof dateString !== 'string') {
    errors.push('Cheque date is required')
    return { valid: false, errors }
  }
  
  // Try to parse various date formats
  let date: Date
  
  try {
    // Handle YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      date = new Date(dateString)
    }
    // Handle MM/DD/YYYY format
    else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) {
      const [month, day, year] = dateString.split('/')
      date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
    }
    // Handle DD/MM/YYYY format
    else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) {
      const [day, month, year] = dateString.split('/')
      date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
    } else {
      date = new Date(dateString)
    }
    
    if (isNaN(date.getTime())) {
      errors.push('Invalid date format')
      return { valid: false, errors }
    }
  } catch {
    errors.push('Unable to parse date')
    return { valid: false, errors }
  }
  
  // Check for reasonable date range (not too far in past/future)
  const now = new Date()
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
  const oneYearFromNow = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())
  
  if (date < oneYearAgo) {
    errors.push('Cheque date is too far in the past (more than 1 year)')
  }
  
  if (date > oneYearFromNow) {
    errors.push('Cheque date is too far in the future (more than 1 year)')
  }
  
  return { valid: errors.length === 0, errors }
}

export function validateAmount(amountString: string): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (!amountString || typeof amountString !== 'string') {
    errors.push('Amount is required')
    return { valid: false, errors }
  }
  
  // Remove currency symbols and spaces
  const cleanAmount = amountString.replace(/[$,\s]/g, '')
  
  // Validate decimal format
  if (!/^\d+(\.\d{1,2})?$/.test(cleanAmount)) {
    errors.push('Amount must be a valid decimal number with up to 2 decimal places')
    return { valid: false, errors }
  }
  
  const amount = parseFloat(cleanAmount)
  
  // Check reasonable limits
  if (amount <= 0) {
    errors.push('Amount must be greater than zero')
  }
  
  if (amount > 1000000) {
    errors.push('Amount exceeds maximum limit ($1,000,000)')
  }
  
  return { valid: errors.length === 0, errors }
}

// Generic validation engine
export function validate(data: any, schema: ValidationSchema): ValidationResult {
  const errors: Record<string, string[]> = {}
  
  for (const [field, rule] of Object.entries(schema)) {
    const fieldErrors: string[] = []
    const value = data[field]
    
    // Check required
    if (rule.required && (value === undefined || value === null || value === '')) {
      fieldErrors.push(`${field} is required`)
      errors[field] = fieldErrors
      continue
    }
    
    // Skip validation if value is empty and not required
    if (value === undefined || value === null || value === '') {
      continue
    }
    
    // Type validation
    if (rule.type) {
      const actualType = Array.isArray(value) ? 'array' : typeof value
      if (actualType !== rule.type) {
        fieldErrors.push(`${field} must be of type ${rule.type}`)
      }
    }
    
    // String validations
    if (typeof value === 'string') {
      if (rule.minLength && value.length < rule.minLength) {
        fieldErrors.push(`${field} must be at least ${rule.minLength} characters`)
      }
      
      if (rule.maxLength && value.length > rule.maxLength) {
        fieldErrors.push(`${field} must be no more than ${rule.maxLength} characters`)
      }
      
      if (rule.pattern && !rule.pattern.test(value)) {
        fieldErrors.push(`${field} format is invalid`)
      }
    }
    
    // Number validations
    if (typeof value === 'number') {
      if (rule.min !== undefined && value < rule.min) {
        fieldErrors.push(`${field} must be at least ${rule.min}`)
      }
      
      if (rule.max !== undefined && value > rule.max) {
        fieldErrors.push(`${field} must be no more than ${rule.max}`)
      }
    }
    
    // Enum validation
    if (rule.enum && !rule.enum.includes(value)) {
      fieldErrors.push(`${field} must be one of: ${rule.enum.join(', ')}`)
    }
    
    // Custom validation
    if (rule.custom) {
      const customResult = rule.custom(value)
      if (typeof customResult === 'string') {
        fieldErrors.push(customResult)
      } else if (!customResult) {
        fieldErrors.push(`${field} failed custom validation`)
      }
    }
    
    if (fieldErrors.length > 0) {
      errors[field] = fieldErrors
    }
  }
  
  return {
    valid: Object.keys(errors).length === 0,
    errors
  }
}

// Request validation schemas
export const chequeAnalysisSchema: ValidationSchema = {
  imageBase64: {
    required: true,
    type: 'string',
    minLength: 100,
    maxLength: 50000000, // ~37MB base64
    custom: (value: string) => validateBase64Image(value) || 'Invalid base64 image format'
  },
  userId: {
    type: 'string',
    maxLength: 100,
    pattern: /^[a-zA-Z0-9\-_]+$/
  },
  sessionId: {
    type: 'string',
    maxLength: 100,
    pattern: /^[a-zA-Z0-9\-_]+$/
  }
}

export const complianceAnalysisSchema: ValidationSchema = {
  imageBase64: {
    required: true,
    type: 'string',
    custom: (value: string) => validateBase64Image(value) || 'Invalid base64 image format'
  },
  chequeData: {
    type: 'object'
  },
  userId: {
    type: 'string',
    maxLength: 100
  }
}

export const institutionDetectionSchema: ValidationSchema = {
  imageBase64: {
    required: true,
    type: 'string',
    custom: (value: string) => validateBase64Image(value) || 'Invalid base64 image format'
  },
  transitNumber: {
    type: 'string',
    pattern: /^\d{9}$/,
    custom: (value: string) => {
      if (!value) return true // Optional field
      const result = validateCanadianTransitNumber(value)
      return result.valid || result.errors.join(', ')
    }
  },
  userId: {
    type: 'string',
    maxLength: 100
  }
}

export const decisionGenerationSchema: ValidationSchema = {
  chequeData: {
    required: true,
    type: 'object'
  },
  securityAssessment: {
    type: 'object'
  },
  complianceData: {
    type: 'object'
  },
  institutionData: {
    type: 'object'
  },
  userId: {
    type: 'string',
    maxLength: 100
  }
}

// Input sanitization for common fields
export function sanitizeChequeInput(input: any): any {
  const sanitized: any = {}
  
  const stringFields = ['payeeName', 'amountWords', 'currencyDesignation', 'processingNotes']
  const numericFields = ['amountNumerals', 'confidenceScore', 'processingTime']
  const booleanFields = ['signaturePresent', 'alterationsEvident', 'osfiReportable']
  
  for (const field of stringFields) {
    if (input[field] && typeof input[field] === 'string') {
      sanitized[field] = input[field]
        .replace(/[<>]/g, '') // Remove HTML-like characters
        .replace(/['"]/g, '') // Remove quotes that could cause issues
        .trim()
        .substring(0, 500) // Limit length
    }
  }
  
  for (const field of numericFields) {
    if (input[field] !== undefined) {
      const num = parseFloat(input[field])
      if (!isNaN(num)) {
        sanitized[field] = num
      }
    }
  }
  
  for (const field of booleanFields) {
    if (input[field] !== undefined) {
      sanitized[field] = Boolean(input[field])
    }
  }
  
  return sanitized
}

// Security validation utilities
export function validateRequestOrigin(request: Request, allowedOrigins: string[]): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return false
  
  return allowedOrigins.some(allowed => {
    if (allowed === '*') return true
    if (allowed.endsWith('*')) {
      const prefix = allowed.slice(0, -1)
      return origin.startsWith(prefix)
    }
    return origin === allowed
  })
}

export function validateContentType(request: Request, expectedType: string = 'application/json'): boolean {
  const contentType = request.headers.get('content-type')
  return contentType?.includes(expectedType) || false
}

export function validateRequestSize(request: Request, maxSize: number): boolean {
  const contentLength = request.headers.get('content-length')
  if (!contentLength) return true // Can't validate without header
  
  return parseInt(contentLength) <= maxSize
}

// Export convenience function for full request validation
export function validateRequest(
  request: Request,
  data: any,
  schema: ValidationSchema,
  options: {
    maxSize?: number
    allowedOrigins?: string[]
    requireAuth?: boolean
  } = {}
): void {
  // Size validation
  if (options.maxSize && !validateRequestSize(request, options.maxSize)) {
    throw new ApiError('Request body too large', 413, 'REQUEST_TOO_LARGE')
  }
  
  // Content type validation
  if (!validateContentType(request)) {
    throw new ApiError('Invalid content type', 400, 'INVALID_CONTENT_TYPE')
  }
  
  // Origin validation
  if (options.allowedOrigins && !validateRequestOrigin(request, options.allowedOrigins)) {
    throw new ApiError('Invalid request origin', 403, 'INVALID_ORIGIN')
  }
  
  // Schema validation
  const validation = validate(data, schema)
  if (!validation.valid) {
    const errorMessage = Object.entries(validation.errors)
      .map(([field, errors]) => `${field}: ${errors.join(', ')}`)
      .join('; ')
    
    throw new ApiError(`Validation failed: ${errorMessage}`, 400, 'VALIDATION_ERROR')
  }
}