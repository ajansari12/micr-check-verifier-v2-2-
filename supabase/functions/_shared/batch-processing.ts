import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ApiError } from './utils.ts'

// Define batch processing status constants
export enum BatchStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  HOLD = 'hold',
  COMPLETED = 'completed',
  PARTIALLY_COMPLETED = 'partially_completed',
  FAILED = 'failed'
}

export enum ChequeStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  ERROR = 'error',
  REJECTED = 'rejected'
}

export enum VerificationResult {
  APPROVE = 'APPROVE',
  REVIEW = 'REVIEW',
  REJECT = 'REJECT',
  INVESTIGATE = 'INVESTIGATE'
}

export interface BatchProcessingStats {
  totalCheques: number
  processedCheques: number
  successfulCheques: number
  failedCheques: number
  highRiskCount: number
  mediumRiskCount: number
  lowRiskCount: number
  osfiReportableCount: number
  totalAmount: number
  averageProcessingTimeMs: number | null
}

export interface BatchChequeResult {
  chequeId: string
  status: ChequeStatus
  processingTimeMs: number | null
  transitNumber?: string | null
  institutionNumber?: string | null
  amount?: number | null
  payeeName?: string | null
  verificationResult?: VerificationResult | null
  riskScore?: number | null
  osfiReportable: boolean
  errorMessage?: string | null
}

// Initialize Supabase client
function createSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration')
  }
  
  return createClient(supabaseUrl, supabaseServiceKey)
}

/**
 * Create a new batch processing record
 */
export async function createBatchRecord(
  batchId: string,
  totalItems: number,
  batchName?: string,
  metadata?: Record<string, any>
): Promise<string> {
  try {
    const supabase = createSupabaseClient()
    
    const { data, error } = await supabase
      .from('batch_processing')
      .insert({
        batch_id: batchId,
        status: BatchStatus.QUEUED,
        total_items: totalItems,
        processed_items: 0,
        success_count: 0,
        error_count: 0,
        processing_start: new Date().toISOString(),
        metadata: {
          batchName,
          createdAt: new Date().toISOString(),
          ...metadata
        }
      })
      .select('batch_id')
      .single()
      
    if (error) {
      throw new Error(`Failed to create batch record: ${error.message}`)
    }
    
    return data?.batch_id || batchId
  } catch (error) {
    console.error('Error creating batch record:', error)
    throw new ApiError(
      `Failed to create batch record: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500,
      'BATCH_CREATE_ERROR'
    )
  }
}

/**
 * Update batch processing status
 */
export async function updateBatchStatus(
  batchId: string,
  status: BatchStatus
): Promise<void> {
  try {
    const supabase = createSupabaseClient()
    
    const { error } = await supabase
      .from('batch_processing')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('batch_id', batchId)
      
    if (error) {
      throw new Error(`Failed to update batch status: ${error.message}`)
    }
  } catch (error) {
    console.error('Error updating batch status:', error)
    // Non-critical error, don't throw
  }
}

/**
 * Update batch processing progress
 */
export async function updateBatchProgress(
  batchId: string,
  processedItems: number,
  successCount: number,
  errorCount: number
): Promise<void> {
  try {
    const supabase = createSupabaseClient()
    
    const { error } = await supabase
      .from('batch_processing')
      .update({
        processed_items: processedItems,
        success_count: successCount,
        error_count: errorCount,
        updated_at: new Date().toISOString()
      })
      .eq('batch_id', batchId)
      
    if (error) {
      throw new Error(`Failed to update batch progress: ${error.message}`)
    }
  } catch (error) {
    console.error('Error updating batch progress:', error)
    // Non-critical error, don't throw
  }
}

/**
 * Finalize a completed batch with all statistics
 */
export async function finalizeBatch(
  batchId: string,
  status: BatchStatus,
  stats: BatchProcessingStats
): Promise<void> {
  try {
    const supabase = createSupabaseClient()
    
    const { error } = await supabase
      .from('batch_processing')
      .update({
        status,
        processed_items: stats.processedCheques,
        success_count: stats.successfulCheques,
        error_count: stats.failedCheques,
        high_risk_count: stats.highRiskCount,
        osfi_reportable_count: stats.osfiReportableCount,
        total_amount: stats.totalAmount,
        average_item_time_ms: stats.averageProcessingTimeMs,
        processing_end: new Date().toISOString(),
        risk_summary: {
          highRiskPercentage: stats.totalCheques > 0 ? (stats.highRiskCount / stats.totalCheques) * 100 : 0,
          mediumRiskPercentage: stats.totalCheques > 0 ? (stats.mediumRiskCount / stats.totalCheques) * 100 : 0,
          lowRiskPercentage: stats.totalCheques > 0 ? (stats.lowRiskCount / stats.totalCheques) * 100 : 0,
          successRate: stats.totalCheques > 0 ? (stats.successfulCheques / stats.totalCheques) * 100 : 0,
          completedAt: new Date().toISOString()
        },
        updated_at: new Date().toISOString()
      })
      .eq('batch_id', batchId)
      
    if (error) {
      throw new Error(`Failed to finalize batch: ${error.message}`)
    }
  } catch (error) {
    console.error('Error finalizing batch:', error)
    // Non-critical error, don't throw
  }
}

/**
 * Record individual cheque result
 */
export async function recordChequeResult(
  batchId: string,
  result: BatchChequeResult
): Promise<void> {
  try {
    const supabase = createSupabaseClient()
    
    // Check if record already exists
    const { data: existing } = await supabase
      .from('batch_cheques')
      .select('id')
      .eq('batch_id', batchId)
      .eq('cheque_id', result.chequeId)
      .maybeSingle()
    
    const now = new Date().toISOString()
    
    if (existing) {
      // Update existing record
      await supabase
        .from('batch_cheques')
        .update({
          status: result.status,
          processing_end: now,
          processing_time_ms: result.processingTimeMs,
          transit_number: result.transitNumber,
          institution_number: result.institutionNumber,
          amount: result.amount,
          payee_name: result.payeeName,
          verification_result: result.verificationResult,
          risk_score: result.riskScore,
          osfi_reportable: result.osfiReportable,
          error_message: result.errorMessage,
          updated_at: now
        })
        .eq('id', existing.id)
    } else {
      // Insert new record
      await supabase
        .from('batch_cheques')
        .insert({
          batch_id: batchId,
          cheque_id: result.chequeId,
          status: result.status,
          processing_start: now,
          processing_end: result.status !== ChequeStatus.PROCESSING ? now : null,
          processing_time_ms: result.processingTimeMs,
          transit_number: result.transitNumber,
          institution_number: result.institutionNumber,
          amount: result.amount,
          payee_name: result.payeeName,
          verification_result: result.verificationResult,
          risk_score: result.riskScore,
          osfi_reportable: result.osfiReportable,
          error_message: result.errorMessage,
          created_at: now,
          updated_at: now
        })
    }
  } catch (error) {
    console.error('Error recording cheque result:', error)
    // Non-critical error, don't throw
  }
}

/**
 * Get batch processing details
 */
export async function getBatchDetails(batchId: string): Promise<any> {
  try {
    const supabase = createSupabaseClient()
    
    const { data, error } = await supabase
      .from('batch_processing')
      .select('*')
      .eq('batch_id', batchId)
      .single()
      
    if (error) {
      throw new Error(`Failed to get batch details: ${error.message}`)
    }
    
    return data
  } catch (error) {
    console.error('Error getting batch details:', error)
    throw new ApiError(
      `Failed to get batch details: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500,
      'BATCH_DETAILS_ERROR'
    )
  }
}

/**
 * Get cheques for a batch
 */
export async function getBatchCheques(
  batchId: string, 
  options?: { limit?: number; offset?: number; status?: ChequeStatus }
): Promise<any[]> {
  try {
    const supabase = createSupabaseClient()
    
    let query = supabase
      .from('batch_cheques')
      .select('*')
      .eq('batch_id', batchId)
      .order('created_at', { ascending: true })
    
    if (options?.status) {
      query = query.eq('status', options.status)
    }
    
    if (options?.limit) {
      query = query.limit(options.limit)
    }
    
    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 20) - 1)
    }
    
    const { data, error } = await query
      
    if (error) {
      throw new Error(`Failed to get batch cheques: ${error.message}`)
    }
    
    return data || []
  } catch (error) {
    console.error('Error getting batch cheques:', error)
    throw new ApiError(
      `Failed to get batch cheques: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500,
      'BATCH_CHEQUES_ERROR'
    )
  }
}

/**
 * Get batch summary statistics
 */
export async function getBatchSummary(batchId: string): Promise<BatchProcessingStats> {
  try {
    const supabase = createSupabaseClient()
    
    // Get batch details
    const { data: batchData, error: batchError } = await supabase
      .from('batch_processing')
      .select('*')
      .eq('batch_id', batchId)
      .single()
      
    if (batchError) {
      throw new Error(`Failed to get batch summary: ${batchError.message}`)
    }
    
    // Get risk statistics from cheques
    const { data: chequeStats, error: statsError } = await supabase
      .from('batch_cheques')
      .select(`
        count(*),
        count(*) filter (where status = 'completed') as completed_count,
        count(*) filter (where status = 'error') as error_count,
        count(*) filter (where risk_score >= 70) as high_risk_count,
        count(*) filter (where risk_score >= 40 and risk_score < 70) as medium_risk_count,
        count(*) filter (where risk_score < 40) as low_risk_count,
        count(*) filter (where osfi_reportable = true) as osfi_count,
        sum(amount) as total_amount,
        avg(processing_time_ms) as avg_time
      `)
      .eq('batch_id', batchId)
      .single()
      
    if (statsError) {
      throw new Error(`Failed to get cheque statistics: ${statsError.message}`)
    }
    
    return {
      totalCheques: batchData.total_items || 0,
      processedCheques: batchData.processed_items || 0,
      successfulCheques: chequeStats.completed_count || 0,
      failedCheques: chequeStats.error_count || 0,
      highRiskCount: chequeStats.high_risk_count || 0,
      mediumRiskCount: chequeStats.medium_risk_count || 0,
      lowRiskCount: chequeStats.low_risk_count || 0,
      osfiReportableCount: chequeStats.osfi_count || 0,
      totalAmount: chequeStats.total_amount || 0,
      averageProcessingTimeMs: chequeStats.avg_time || null
    }
  } catch (error) {
    console.error('Error getting batch summary:', error)
    
    // Return empty stats on error
    return {
      totalCheques: 0,
      processedCheques: 0,
      successfulCheques: 0,
      failedCheques: 0,
      highRiskCount: 0,
      mediumRiskCount: 0,
      lowRiskCount: 0,
      osfiReportableCount: 0,
      totalAmount: 0,
      averageProcessingTimeMs: null
    }
  }
}

/**
 * Get batches for a user
 */
export async function getUserBatches(
  userId: string,
  options?: { limit?: number; offset?: number; status?: BatchStatus }
): Promise<any[]> {
  try {
    const supabase = createSupabaseClient()
    
    let query = supabase
      .from('batch_processing')
      .select('*')
      .filter('metadata->userId', 'eq', userId)
      .order('created_at', { ascending: false })
    
    if (options?.status) {
      query = query.eq('status', options.status)
    }
    
    if (options?.limit) {
      query = query.limit(options.limit)
    }
    
    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 20) - 1)
    }
    
    const { data, error } = await query
      
    if (error) {
      throw new Error(`Failed to get user batches: ${error.message}`)
    }
    
    return data || []
  } catch (error) {
    console.error('Error getting user batches:', error)
    throw new ApiError(
      `Failed to get user batches: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500,
      'USER_BATCHES_ERROR'
    )
  }
}

/**
 * Generate batch report URL (for downloading report)
 */
export async function generateBatchReportUrl(batchId: string): Promise<string | null> {
  try {
    const supabase = createSupabaseClient()
    
    // Get batch details to confirm it's completed
    const { data: batch, error: batchError } = await supabase
      .from('batch_processing')
      .select('status')
      .eq('batch_id', batchId)
      .single()
      
    if (batchError || !batch) {
      throw new Error(`Failed to get batch: ${batchError?.message || 'Batch not found'}`)
    }
    
    if (batch.status !== BatchStatus.COMPLETED && batch.status !== BatchStatus.PARTIALLY_COMPLETED) {
      throw new ApiError('Cannot generate report for incomplete batch', 400, 'INCOMPLETE_BATCH')
    }
    
    // Generate report URL (in a real implementation, this would create the actual report file)
    const reportUrl = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/reports/${batchId}_report.pdf`
    
    // Update batch with report URL
    const { error: updateError } = await supabase
      .from('batch_processing')
      .update({
        report_url: reportUrl,
        updated_at: new Date().toISOString()
      })
      .eq('batch_id', batchId)
      
    if (updateError) {
      throw new Error(`Failed to update batch with report URL: ${updateError.message}`)
    }
    
    return reportUrl
  } catch (error) {
    console.error('Error generating batch report URL:', error)
    return null
  }
}

/**
 * Check batch exists and get basic info
 */
export async function checkBatchExists(batchId: string): Promise<{ exists: boolean; status?: string; totalItems?: number }> {
  try {
    const supabase = createSupabaseClient()
    
    const { data, error } = await supabase
      .from('batch_processing')
      .select('batch_id, status, total_items')
      .eq('batch_id', batchId)
      .single()
      
    if (error) {
      return { exists: false }
    }
    
    return { 
      exists: true, 
      status: data.status,
      totalItems: data.total_items
    }
  } catch (error) {
    console.error('Error checking batch exists:', error)
    return { exists: false }
  }
}

/**
 * Cancel a running batch
 */
export async function cancelBatchProcessing(batchId: string): Promise<boolean> {
  try {
    const supabase = createSupabaseClient()
    
    // Check if batch can be cancelled (must be queued or processing)
    const { data: batch, error: batchError } = await supabase
      .from('batch_processing')
      .select('status')
      .eq('batch_id', batchId)
      .single()
      
    if (batchError || !batch) {
      throw new Error(`Failed to get batch: ${batchError?.message || 'Batch not found'}`)
    }
    
    if (batch.status !== BatchStatus.QUEUED && batch.status !== BatchStatus.PROCESSING) {
      throw new ApiError(
        `Cannot cancel batch in ${batch.status} status`,
        400,
        'INVALID_BATCH_STATUS'
      )
    }
    
    // Update batch status to failed
    const { error: updateError } = await supabase
      .from('batch_processing')
      .update({
        status: BatchStatus.FAILED,
        processing_end: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: {
          cancellation: {
            cancelledAt: new Date().toISOString(),
            reason: 'User cancelled processing'
          }
        }
      })
      .eq('batch_id', batchId)
      
    if (updateError) {
      throw new Error(`Failed to cancel batch: ${updateError.message}`)
    }
    
    return true
  } catch (error) {
    console.error('Error cancelling batch:', error)
    return false
  }
}