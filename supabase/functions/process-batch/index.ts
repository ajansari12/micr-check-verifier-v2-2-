import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders, handleCorsPreflightRequest, createSecureResponse, createErrorResponse } from '../_shared/cors.ts'
import { logComplianceActivity, generateComplianceId, createSupabaseClient } from '../_shared/compliance.ts'
import { performSecurityCheck } from '../_shared/security.ts'
import { validateRequest } from '../_shared/validation.ts'
import { ApiError, withTimeout, retryWithBackoff } from '../_shared/utils.ts'
import { validateCanadianTransitNumber } from '../_shared/institutions.ts'

// Define the structure of a batch processing request
interface BatchProcessRequest {
  batchId?: string
  batchName?: string
  batchType: 'zip' | 'pdf' | 'tiff' | 'images'
  files?: {
    id: string
    name: string
    data: string // base64
    fileType: string
  }[]
  zipFileBase64?: string // For ZIP file processing
  processingOptions?: {
    priorityLevel?: 'low' | 'medium' | 'high' | 'critical'
    processingMode?: 'standard' | 'enhanced' | 'expedited'
    verificationLevel?: 'standard' | 'enhanced'
    itemsPerSecond?: number
    parallelProcessing?: boolean
    skipDuplicates?: boolean
    notificationEmail?: string
    webhookUrl?: string
  }
  metadata?: Record<string, any>
  userId?: string
  sessionId?: string
  operatorId?: string
  branchCode?: string
}

interface BatchProcessResult {
  batchId: string
  status: 'queued' | 'processing' | 'completed' | 'partially_completed' | 'failed'
  totalItems: number
  processedItems: number
  successfulItems: number
  failedItems: number
  itemIds: string[]
  estimatedTimeToCompletionSeconds?: number
  processingStats: {
    startTime: string
    endTime?: string
    averageItemProcessingTimeMs?: number
    processingErrors?: { count: number; types: string[] }
  }
  batchReport?: {
    complianceSummary?: {
      osfiReportableCount: number
      highRiskCount: number
      mediumRiskCount: number
      lowRiskCount: number
    }
    institutionBreakdown?: Record<string, number>
    totalAmount?: number
  }
  processingTime: number
  nextActions?: string[]
}

interface BatchItem {
  id: string
  name: string
  data: string
  fileType: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  error?: string
  result?: any
  processingTimeMs?: number
  retries: number
}

// Schema for request validation
const batchProcessingSchema = {
  batchType: {
    required: true,
    type: 'string',
    enum: ['zip', 'pdf', 'tiff', 'images']
  },
  files: {
    type: 'array'
  },
  zipFileBase64: {
    type: 'string'
  },
  processingOptions: {
    type: 'object'
  },
  userId: {
    type: 'string',
    maxLength: 100
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest()
  }

  const startTime = Date.now()
  let batchId: string = generateComplianceId()
  
  try {
    if (req.method !== 'POST') {
      return createErrorResponse('Method not allowed', 405, 'METHOD_NOT_ALLOWED')
    }

    // Parse and validate request
    const requestData: BatchProcessRequest = await req.json()
    
    // Use provided batchId if available, otherwise generate one
    batchId = requestData.batchId || batchId
    
    // Security and validation checks
    const securityCheck = await performSecurityCheck(req, requestData, {
      endpoint: 'process-batch',
      rateLimit: { windowMs: 60000, maxRequests: 10 }, // Strict limit for batch operations
      allowedOrigins: ['*']
    })

    if (!securityCheck.passed) {
      return createErrorResponse(securityCheck.reason || 'Security check failed', 403, 'SECURITY_CHECK_FAILED')
    }

    validateRequest(req, requestData, batchProcessingSchema, {
      maxSize: 100 * 1024 * 1024 // 100MB for batch processing
    })

    // Extract files for processing
    const batchItems = await extractBatchItems(requestData)
    
    if (!batchItems.length) {
      throw new ApiError('No valid files found in batch', 400, 'EMPTY_BATCH')
    }

    // Create batch record in database
    await createBatchRecord(batchId, requestData, batchItems)
    
    // Start processing (non-blocking for immediate response)
    const processingOptions = requestData.processingOptions || {}
    processBatchAsync(batchId, batchItems, processingOptions)

    // Return immediate response with batch creation details
    const result: BatchProcessResult = {
      batchId,
      status: 'queued',
      totalItems: batchItems.length,
      processedItems: 0,
      successfulItems: 0,
      failedItems: 0,
      itemIds: batchItems.map(item => item.id),
      processingStats: {
        startTime: new Date().toISOString(),
      },
      processingTime: Date.now() - startTime,
      nextActions: [
        'Check batch status periodically',
        'Retrieve detailed results when processing is complete'
      ]
    }

    // Log batch creation for compliance
    await logComplianceActivity({
      operation: 'process-batch-create',
      user_id: requestData.userId,
      request_data: {
        batchId,
        batchType: requestData.batchType,
        totalItems: batchItems.length,
        processingOptions: requestData.processingOptions,
        metadata: requestData.metadata
      },
      response_data: {
        status: result.status,
        totalItems: result.totalItems
      },
      processing_time_ms: result.processingTime,
      risk_level: 'Medium', // Default for batch operations
      osfi_reportable: false,
      created_at: new Date().toISOString()
    })

    return createSecureResponse(result, 200, {
      customHeaders: {
        'X-Batch-ID': batchId,
        'X-Total-Items': batchItems.length.toString()
      }
    })

  } catch (error) {
    console.error('Error in process-batch function:', error)
    
    const processingTime = Date.now() - startTime
    
    // Log error for compliance tracking
    await logComplianceActivity({
      operation: 'process-batch-error',
      request_data: { error: true, batchId },
      response_data: { error: error instanceof Error ? error.message : 'Unknown error' },
      processing_time_ms: processingTime,
      risk_level: 'High', // Errors are high risk
      osfi_reportable: false,
      created_at: new Date().toISOString()
    })

    if (error instanceof ApiError) {
      return createErrorResponse(error.message, error.statusCode, error.code)
    }

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error occurred',
      500,
      'BATCH_PROCESSING_ERROR'
    )
  }
})

/**
 * Extract individual files from the batch request
 */
async function extractBatchItems(request: BatchProcessRequest): Promise<BatchItem[]> {
  const items: BatchItem[] = []

  // Case 1: Individual files are provided directly
  if (request.files && request.files.length > 0) {
    items.push(...request.files.map(file => ({
      id: file.id || `item_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
      name: file.name,
      data: file.data,
      fileType: file.fileType,
      status: 'pending',
      retries: 0
    })))
  }
  
  // Case 2: ZIP file processing
  else if (request.batchType === 'zip' && request.zipFileBase64) {
    // In production, we would use a ZIP extraction library
    // For this implementation, we'll simulate extraction with a placeholder
    try {
      const extractedItems = await extractZipFile(request.zipFileBase64)
      items.push(...extractedItems)
    } catch (error) {
      throw new ApiError(`Failed to extract ZIP file: ${error instanceof Error ? error.message : 'Unknown error'}`, 400, 'ZIP_EXTRACTION_ERROR')
    }
  }
  
  // Case 3: PDF or TIFF (multi-page) processing
  else if (request.batchType === 'pdf' || request.batchType === 'tiff') {
    if (!request.zipFileBase64) {
      throw new ApiError('PDF/TIFF file data is required for this batch type', 400, 'MISSING_FILE_DATA')
    }
    
    try {
      const extractedPages = await extractPagesFromDocument(request.zipFileBase64, request.batchType)
      items.push(...extractedPages)
    } catch (error) {
      throw new ApiError(`Failed to extract pages from ${request.batchType.toUpperCase()}: ${error instanceof Error ? error.message : 'Unknown error'}`, 400, 'PAGE_EXTRACTION_ERROR')
    }
  }
  
  return items
}

/**
 * Extract files from a ZIP archive (simulated for this implementation)
 */
async function extractZipFile(zipBase64: string): Promise<BatchItem[]> {
  // In a real implementation, we would use a ZIP library compatible with Deno
  // For this simulation, we'll create placeholder items
  
  // Validate base64 data minimally
  if (!zipBase64 || typeof zipBase64 !== 'string' || zipBase64.length < 100) {
    throw new Error('Invalid ZIP file data')
  }
  
  // Generate 3-7 random files to simulate ZIP extraction
  const fileCount = Math.floor(Math.random() * 5) + 3
  const extractedItems: BatchItem[] = []
  
  for (let i = 0; i < fileCount; i++) {
    extractedItems.push({
      id: `zip_item_${Date.now()}_${i}`,
      name: `cheque_${i + 1}.jpg`,
      data: zipBase64.substring(0, 100) + '...', // Simulate data (would be different per file in reality)
      fileType: 'image/jpeg',
      status: 'pending',
      retries: 0
    })
  }
  
  return extractedItems
}

/**
 * Extract pages from multi-page documents (simulated)
 */
async function extractPagesFromDocument(fileBase64: string, fileType: 'pdf' | 'tiff'): Promise<BatchItem[]> {
  // Simulate page extraction - in production would use PDF or TIFF libraries
  
  // Validate base64 data minimally
  if (!fileBase64 || typeof fileBase64 !== 'string' || fileBase64.length < 100) {
    throw new Error(`Invalid ${fileType.toUpperCase()} file data`)
  }
  
  // Generate 2-10 random pages to simulate document extraction
  const pageCount = Math.floor(Math.random() * 9) + 2
  const extractedItems: BatchItem[] = []
  
  for (let i = 0; i < pageCount; i++) {
    extractedItems.push({
      id: `${fileType}_page_${Date.now()}_${i}`,
      name: `Page_${i + 1}.${fileType === 'pdf' ? 'jpg' : 'tiff'}`,
      data: fileBase64.substring(0, 100) + '...', // Simulate data
      fileType: fileType === 'pdf' ? 'image/jpeg' : 'image/tiff',
      status: 'pending',
      retries: 0
    })
  }
  
  return extractedItems
}

/**
 * Create batch record in the database
 */
async function createBatchRecord(
  batchId: string, 
  request: BatchProcessRequest, 
  items: BatchItem[]
): Promise<void> {
  try {
    const supabase = createSupabaseClient()
    
    // Create batch processing record
    await supabase
      .from('batch_processing')
      .insert({
        batch_id: batchId,
        status: 'queued',
        total_items: items.length,
        processed_items: 0,
        metadata: {
          batchName: request.batchName,
          batchType: request.batchType,
          userId: request.userId,
          operatorId: request.operatorId,
          branchCode: request.branchCode,
          processingOptions: request.processingOptions,
          customMetadata: request.metadata,
          itemIds: items.map(item => item.id)
        },
        created_at: new Date().toISOString()
      })
    
    console.log(`Created batch record for ${batchId} with ${items.length} items`)
  } catch (error) {
    console.error('Failed to create batch record:', error)
    throw new ApiError('Database error creating batch record', 500, 'DB_ERROR')
  }
}

/**
 * Process batch items asynchronously (non-blocking)
 */
async function processBatchAsync(
  batchId: string, 
  items: BatchItem[], 
  options: BatchProcessRequest['processingOptions'] = {}
): Promise<void> {
  // Start batch processing in the background
  // This function doesn't block the response to the client
  
  // In a production environment, you might want to use a proper job queue
  // For this Edge Function implementation, we'll handle it in-memory
  
  try {
    console.log(`Starting batch processing for ${batchId} with ${items.length} items`)
    
    // Update batch status to processing
    await updateBatchStatus(batchId, 'processing')
    
    // Process mode settings
    const parallelProcessing = options.parallelProcessing ?? false
    const itemsPerSecond = options.itemsPerSecond || 1 // Default to 1 item per second to avoid rate limits
    
    // Process items
    let successCount = 0
    let failedCount = 0
    let processingTimes: number[] = []
    
    if (parallelProcessing) {
      // Parallel processing (limited to 3 concurrent items max)
      const concurrentLimit = 3
      const chunks = chunkArray(items, concurrentLimit)
      
      for (const chunk of chunks) {
        const results = await Promise.allSettled(
          chunk.map(item => processItem(batchId, item))
        )
        
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            successCount++
            if (result.value.processingTimeMs) {
              processingTimes.push(result.value.processingTimeMs)
            }
          } else {
            failedCount++
            console.error(`Failed to process item ${chunk[index].id}:`, result.reason)
          }
        })
        
        // Update batch status
        await updateBatchProgress(batchId, successCount + failedCount, successCount, failedCount)
        
        // Slight delay between chunks to avoid overwhelming APIs
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    } else {
      // Sequential processing
      for (let i = 0; i < items.length; i++) {
        try {
          const result = await processItem(batchId, items[i])
          successCount++
          if (result.processingTimeMs) {
            processingTimes.push(result.processingTimeMs)
          }
        } catch (error) {
          failedCount++
          console.error(`Failed to process item ${items[i].id}:`, error)
        }
        
        // Update batch progress
        await updateBatchProgress(batchId, i + 1, successCount, failedCount)
        
        // Respect itemsPerSecond setting
        if (i < items.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 / itemsPerSecond))
        }
      }
    }
    
    // Calculate final statistics
    const averageProcessingTime = processingTimes.length > 0
      ? processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length
      : null
    
    // Determine final batch status
    let finalStatus: 'completed' | 'partially_completed' | 'failed' = 'completed'
    if (successCount === 0) {
      finalStatus = 'failed'
    } else if (failedCount > 0) {
      finalStatus = 'partially_completed'
    }
    
    // Generate batch report
    const batchReport = await generateBatchReport(batchId, items)
    
    // Update final batch status with all statistics
    await finalizeCompletedBatch(
      batchId, 
      finalStatus, 
      successCount, 
      failedCount, 
      averageProcessingTime, 
      batchReport
    )
    
    console.log(`Completed batch processing for ${batchId}: ${successCount} succeeded, ${failedCount} failed`)
    
  } catch (error) {
    console.error(`Batch processing failed for ${batchId}:`, error)
    await updateBatchStatus(batchId, 'failed')
    
    // Log critical error
    await logComplianceActivity({
      operation: 'process-batch-critical-error',
      request_data: { batchId },
      response_data: { error: error instanceof Error ? error.message : 'Unknown error' },
      processing_time_ms: 0,
      risk_level: 'High',
      osfi_reportable: false,
      created_at: new Date().toISOString()
    })
  }
}

/**
 * Process a single batch item through the cheque processing pipeline
 */
async function processItem(batchId: string, item: BatchItem): Promise<BatchItem> {
  console.log(`Processing item ${item.id} from batch ${batchId}`)
  
  const startTime = Date.now()
  item.status = 'processing'
  
  try {
    // 1. First, analyze cheque details
    const chequeAnalysis = await callAnalyzeCheque(item.data)
    
    // 2. Then, detect the institution
    const transitNumber = chequeAnalysis.transitNumber
    const institutionDetection = transitNumber 
      ? await callDetectInstitution(item.data, transitNumber) 
      : await callDetectInstitution(item.data)
    
    // 3. Analyze compliance
    const complianceAnalysis = await callAnalyzeCompliance(item.data, {
      chequeData: chequeAnalysis,
      institutionData: institutionDetection
    })
    
    // 4. Generate final decision
    const decision = await callGenerateDecision({
      chequeAnalysis: chequeAnalysis,
      securityAssessment: chequeAnalysis.securityAssessment,
      complianceAssessment: complianceAnalysis,
      institutionData: institutionDetection?.overallAssessment,
      batchId: batchId
    })
    
    // 5. Store consolidated results
    const processedResults = {
      chequeAnalysis,
      institutionDetection,
      complianceAnalysis,
      decision,
      processingTimeMs: Date.now() - startTime
    }
    
    // 6. Update item status
    item.status = 'completed'
    item.result = processedResults
    item.processingTimeMs = processedResults.processingTimeMs
    
    // 7. Create audit trail entry for this item
    await createAuditTrailEntry(batchId, item, processedResults)
    
    console.log(`Successfully processed item ${item.id}, took ${processedResults.processingTimeMs}ms`)
    
    return item
    
  } catch (error) {
    // Handle errors with retry mechanism
    console.error(`Error processing item ${item.id}:`, error)
    
    if (item.retries < 2) {  // Allow up to 3 total attempts
      item.retries += 1
      console.log(`Retrying item ${item.id}, attempt ${item.retries + 1}...`)
      
      // Exponential backoff
      const backoffMs = 2000 * Math.pow(2, item.retries)
      await new Promise(resolve => setTimeout(resolve, backoffMs))
      
      return processItem(batchId, item)
    }
    
    // Max retries reached, mark as failed
    item.status = 'failed'
    item.error = error instanceof Error ? error.message : String(error)
    item.processingTimeMs = Date.now() - startTime
    
    return item
  }
}

/**
 * Call the analyze-cheque Edge Function
 */
async function callAnalyzeCheque(imageBase64: string): Promise<any> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase configuration for function calls')
  }
  
  const apiUrl = `${supabaseUrl}/functions/v1/analyze-cheque`
  
  const response = await retryWithBackoff(() => 
    fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ imageBase64 })
    })
  )
  
  if (!response.ok) {
    throw new Error(`Analyze cheque failed with status ${response.status}: ${await response.text()}`)
  }
  
  return await response.json()
}

/**
 * Call the detect-institution Edge Function
 */
async function callDetectInstitution(imageBase64: string, transitNumber?: string): Promise<any> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase configuration for function calls')
  }
  
  const apiUrl = `${supabaseUrl}/functions/v1/detect-institution`
  
  const response = await retryWithBackoff(() => 
    fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        imageBase64,
        transitNumber,
        includeDatabaseLookup: true
      })
    })
  )
  
  if (!response.ok) {
    throw new Error(`Detect institution failed with status ${response.status}: ${await response.text()}`)
  }
  
  return await response.json()
}

/**
 * Call the analyze-compliance Edge Function
 */
async function callAnalyzeCompliance(imageBase64: string, additionalData?: any): Promise<any> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase configuration for function calls')
  }
  
  const apiUrl = `${supabaseUrl}/functions/v1/analyze-compliance`
  
  const response = await retryWithBackoff(() => 
    fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        imageBase64,
        chequeData: additionalData?.chequeData,
        institutionData: additionalData?.institutionData
      })
    })
  )
  
  if (!response.ok) {
    throw new Error(`Analyze compliance failed with status ${response.status}: ${await response.text()}`)
  }
  
  return await response.json()
}

/**
 * Call the generate-decision Edge Function
 */
async function callGenerateDecision(decisionData: any): Promise<any> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase configuration for function calls')
  }
  
  const apiUrl = `${supabaseUrl}/functions/v1/generate-decision`
  
  const response = await retryWithBackoff(() => 
    fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(decisionData)
    })
  )
  
  if (!response.ok) {
    throw new Error(`Generate decision failed with status ${response.status}: ${await response.text()}`)
  }
  
  return await response.json()
}

/**
 * Update batch status in the database
 */
async function updateBatchStatus(batchId: string, status: string): Promise<void> {
  try {
    const supabase = createSupabaseClient()
    
    await supabase
      .from('batch_processing')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('batch_id', batchId)
  } catch (error) {
    console.error('Failed to update batch status:', error)
  }
}

/**
 * Update batch progress in the database
 */
async function updateBatchProgress(
  batchId: string, 
  processedItems: number, 
  successfulItems: number, 
  failedItems: number
): Promise<void> {
  try {
    const supabase = createSupabaseClient()
    
    await supabase
      .from('batch_processing')
      .update({
        processed_items: processedItems,
        risk_summary: {
          successfulItems,
          failedItems,
          lastUpdated: new Date().toISOString()
        },
        updated_at: new Date().toISOString()
      })
      .eq('batch_id', batchId)
  } catch (error) {
    console.error('Failed to update batch progress:', error)
  }
}

/**
 * Create audit trail entry for processed item
 */
async function createAuditTrailEntry(batchId: string, item: BatchItem, results: any): Promise<void> {
  if (item.status !== 'completed' || !results.decision) {
    return // Skip if item failed or no decision data
  }
  
  try {
    const supabase = createSupabaseClient()
    
    // Extract key data for audit trail
    const decision = results.decision
    const decisionType = decision.decision?.finalDecision || 'UNKNOWN'
    const riskScore = decision.decision?.riskScore || 0
    const confidenceScore = decision.decision?.confidence || 0
    const keyFactors = decision.decision?.keyFactors || []
    const regulatoryFlags = decision.regulatoryCompliance?.osfiReporting?.required ? 
      ['OSFI_REPORTABLE'] : []
    
    await supabase
      .from('decision_audit_trail')
      .insert({
        decision_id: decision.decisionId || `DEC-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        decision_type: decisionType,
        risk_score: riskScore,
        confidence_score: confidenceScore,
        key_factors: keyFactors,
        regulatory_flags: regulatoryFlags,
        ai_reasoning: { decisionReasoning: decision.decision?.decisionReasoning },
        processing_time_ms: item.processingTimeMs || 0,
        batch_id: batchId,
        created_at: new Date().toISOString()
      })
    
    // Create notifications for high-risk decisions
    if (decisionType === 'REJECT' || decisionType === 'INVESTIGATE') {
      await createDecisionNotification(decision, batchId)
    }
  } catch (error) {
    console.error('Failed to create audit trail entry:', error)
  }
}

/**
 * Create notification for high-priority decisions
 */
async function createDecisionNotification(decision: any, batchId: string): Promise<void> {
  try {
    const supabase = createSupabaseClient()
    
    const decisionId = decision.decisionId
    const notificationRequirements = decision.systemIntegration?.notificationRequirements || []
    
    for (const notification of notificationRequirements) {
      if (['high', 'critical'].includes(notification.urgency)) {
        await supabase
          .from('decision_notifications')
          .insert({
            decision_id: decisionId,
            notify_roles: notification.notify || ['supervisor'],
            urgency: notification.urgency,
            method: notification.method || 'system-alert',
            status: 'pending',
            created_at: new Date().toISOString()
          })
      }
    }
  } catch (error) {
    console.error('Failed to create decision notification:', error)
  }
}

/**
 * Generate final batch report
 */
async function generateBatchReport(batchId: string, items: BatchItem[]): Promise<any> {
  // Only process completed items
  const completedItems = items.filter(item => item.status === 'completed' && item.result)
  
  if (completedItems.length === 0) {
    return {
      osfiReportableCount: 0,
      highRiskCount: 0,
      mediumRiskCount: 0,
      lowRiskCount: 0,
      institutionBreakdown: {},
      totalAmount: 0
    }
  }
  
  // Extract compliance metrics
  let osfiReportableCount = 0
  let highRiskCount = 0
  let mediumRiskCount = 0
  let lowRiskCount = 0
  const institutionBreakdown: Record<string, number> = {}
  let totalAmount = 0
  
  for (const item of completedItems) {
    const result = item.result
    
    // Count risk levels
    const riskLevel = result.decision?.decision?.riskScore || 0
    if (riskLevel >= 80) highRiskCount++
    else if (riskLevel >= 50) mediumRiskCount++
    else lowRiskCount++
    
    // Count OSFI reportable
    if (result.decision?.regulatoryCompliance?.osfiReporting?.required) {
      osfiReportableCount++
    }
    
    // Track institutions
    const institutionName = result.institutionDetection?.overallAssessment?.finalInstitutionName || 'Unknown'
    institutionBreakdown[institutionName] = (institutionBreakdown[institutionName] || 0) + 1
    
    // Sum amount if available
    if (result.chequeAnalysis?.amountNumerals) {
      const amount = parseFloat(result.chequeAnalysis.amountNumerals.replace(/[^0-9.]/g, ''))
      if (!isNaN(amount)) {
        totalAmount += amount
      }
    }
  }
  
  return {
    osfiReportableCount,
    highRiskCount,
    mediumRiskCount,
    lowRiskCount,
    institutionBreakdown,
    totalAmount: Math.round(totalAmount * 100) / 100 // Round to 2 decimal places
  }
}

/**
 * Update final batch status
 */
async function finalizeCompletedBatch(
  batchId: string,
  status: 'completed' | 'partially_completed' | 'failed',
  successCount: number,
  failedCount: number,
  averageProcessingTime: number | null,
  batchReport: any
): Promise<void> {
  try {
    const supabase = createSupabaseClient()
    
    await supabase
      .from('batch_processing')
      .update({
        status,
        processed_items: successCount + failedCount,
        risk_summary: {
          successfulItems: successCount,
          failedItems: failedCount,
          averageProcessingTimeMs: averageProcessingTime,
          highRiskItems: batchReport.highRiskCount,
          mediumRiskItems: batchReport.mediumRiskCount,
          lowRiskItems: batchReport.lowRiskCount,
          osfiReportableCount: batchReport.osfiReportableCount,
          totalAmount: batchReport.totalAmount,
          completedAt: new Date().toISOString()
        },
        metadata: {
          batchReport,
          completionTimestamp: new Date().toISOString()
        },
        updated_at: new Date().toISOString()
      })
      .eq('batch_id', batchId)
      
    // Log completion for compliance tracking
    await logComplianceActivity({
      operation: 'process-batch-complete',
      request_data: { batchId },
      response_data: { 
        status,
        successCount,
        failedCount,
        osfiReportableCount: batchReport.osfiReportableCount,
        highRiskCount: batchReport.highRiskCount
      },
      processing_time_ms: averageProcessingTime || 0,
      risk_level: batchReport.highRiskCount > 0 ? 'High' : 'Medium',
      osfi_reportable: batchReport.osfiReportableCount > 0,
      created_at: new Date().toISOString()
    })
      
  } catch (error) {
    console.error('Failed to finalize batch status:', error)
  }
}

// Utility function to chunk array for parallel processing
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}