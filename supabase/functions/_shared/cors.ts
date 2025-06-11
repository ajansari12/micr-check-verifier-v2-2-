export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

export function createCorsResponse(data?: any, status: number = 200) {
  return new Response(
    data ? JSON.stringify(data) : null,
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  )
}

export function createErrorResponse(error: string, status: number = 500) {
  return new Response(
    JSON.stringify({ 
      error,
      timestamp: new Date().toISOString()
    }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  )
}

export function handleCorsPreflightRequest() {
  return new Response('ok', { headers: corsHeaders })
}