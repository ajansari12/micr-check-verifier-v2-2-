import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export function createSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration')
  }
  
  return createClient(supabaseUrl, supabaseServiceKey)
}

export interface ComplianceLogEntry {
  operation: string
  user_id?: string
  request_data: any
  response_data: any
  processing_time_ms: number
  risk_level?: 'Low' | 'Medium' | 'High' | 'Critical'
  osfi_reportable: boolean
  created_at: string
}

export async function logComplianceActivity(entry: ComplianceLogEntry) {
  try {
    const supabase = createSupabaseClient()
    
    const { error } = await supabase
      .from('compliance_logs')
      .insert(entry)
    
    if (error) {
      console.error('Failed to log compliance activity:', error)
    }
  } catch (error) {
    console.error('Error in compliance logging:', error)
  }
}

export function assessOSFIReportability(riskLevel?: string, riskScore?: number): boolean {
  if (riskLevel === 'Critical') return true
  if (riskScore && riskScore >= 70) return true
  return false
}

export function generateComplianceId(): string {
  return `COMP-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
}