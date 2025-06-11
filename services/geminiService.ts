import { 
  ChequeData, 
  SecurityAssessment,
  ComplianceAnalysisResult,
  InstitutionRecognitionResult,
  FraudRiskAssessment,
  DecisionIntelligence,
  InstitutionContextForDecision
} from '../types';
import { API_MAX_RETRIES, API_RETRY_DELAY_MS } from '../constants';

// Supabase configuration
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://ansjwcydepcdfypykvnb.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Custom error class for Supabase connection issues
class SupabaseConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseConnectionError';
  }
}

const validateSupabaseConfig = () => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new SupabaseConnectionError("Supabase is not connected. Please click the 'Connect to Supabase' button in the top right corner to set up your Supabase project.");
  }
  
  // Check if the URL looks like a valid Supabase URL
  if (!SUPABASE_URL.includes('supabase.co') && !SUPABASE_URL.includes('localhost')) {
    throw new SupabaseConnectionError("Invalid Supabase URL configuration. Please reconnect to Supabase.");
  }
};

const callSupabaseEdgeFunction = async <T,>(
  functionName: string,
  requestBody: any,
  retries = API_MAX_RETRIES,
  serviceName = "SupabaseEdgeFunction"
): Promise<T> => {
  validateSupabaseConfig();
  
  const apiUrl = `${SUPABASE_URL}/functions/v1/${functionName}`;
  
  const headers = {
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      // Handle specific HTTP status codes
      if (response.status === 404) {
        throw new SupabaseConnectionError(`The Supabase Edge Function '${functionName}' was not found. Please ensure your Supabase project is properly connected and the edge functions are deployed.`);
      }
      if (response.status === 401 || response.status === 403) {
        throw new SupabaseConnectionError("Authentication failed with Supabase. Please reconnect to Supabase with valid credentials.");
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    return result as T;
  } catch (error) {
    // Don't retry Supabase connection errors
    if (error instanceof SupabaseConnectionError) {
      throw error;
    }
    
    // Handle network-level fetch failures
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      const isLocalhost = SUPABASE_URL.includes('localhost');
      const errorMessage = isLocalhost 
        ? `Cannot connect to local Supabase instance at ${SUPABASE_URL}. Please ensure:
           1. Supabase is running locally (run 'supabase status' to check)
           2. The '${functionName}' Edge Function is deployed (run 'supabase functions deploy ${functionName}')
           3. Your local firewall isn't blocking connections to localhost:54321`
        : `Cannot connect to Supabase at ${SUPABASE_URL}. Please check your internet connection and Supabase project status.`;
      
      throw new SupabaseConnectionError(errorMessage);
    }
    
    // Handle other network errors
    if (error instanceof TypeError && (error.message.includes('NetworkError') || error.message.includes('fetch'))) {
      throw new SupabaseConnectionError(`Network error connecting to Supabase: ${error.message}. Please check your internet connection and try again.`);
    }
    
    if (retries > 0) {
      console.warn(`${serviceName}: API call failed, retrying in ${API_RETRY_DELAY_MS / 1000}s... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, API_RETRY_DELAY_MS));
      return callSupabaseEdgeFunction<T>(functionName, requestBody, retries - 1, serviceName);
    }
    console.error(`${serviceName}: API call failed after multiple retries:`, error);
    throw error;
  }
};

export const analyzeChequeDetails = async (imageBase64: string): Promise<ChequeData> => {
  try {
    const requestBody = {
      operation: 'analyzeChequeDetails',
      imageBase64: imageBase64,
    };

    return await callSupabaseEdgeFunction<ChequeData>('gemini-analysis', requestBody, API_MAX_RETRIES, "AnalyzeChequeDetails");
  } catch (error) {
    if (error instanceof SupabaseConnectionError) {
      throw error;
    }
    throw new Error(`Failed to analyze cheque details: ${error instanceof Error ? error.message : String(error)}`);
  }
};

export const generateDecisionIntelligenceAI = async (
  initialChequeData: Partial<ChequeData>,
  institutionContext: InstitutionContextForDecision | null
): Promise<DecisionIntelligence | null> => {
  try {
    const requestBody = {
      operation: 'generateDecisionIntelligence',
      initialChequeData,
      institutionContext,
    };

    return await callSupabaseEdgeFunction<DecisionIntelligence>('gemini-analysis', requestBody, API_MAX_RETRIES, "GenerateDecisionIntelligenceAI");
  } catch (error) {
    if (error instanceof SupabaseConnectionError) {
      throw error;
    }
    console.error("Failed to generate decision intelligence:", error);
    return null; // Return null as fallback for this optional feature
  }
};

export const analyzeSecurityFeaturesAI = async (imageBase64: string): Promise<SecurityAssessment> => {
  try {
    const requestBody = {
      operation: 'analyzeSecurityFeatures',
      imageBase64: imageBase64,
    };

    return await callSupabaseEdgeFunction<SecurityAssessment>('gemini-analysis', requestBody, API_MAX_RETRIES, "AnalyzeSecurityFeaturesAI");
  } catch (error) {
    if (error instanceof SupabaseConnectionError) {
      throw error;
    }
    throw new Error(`Failed to analyze security features: ${error instanceof Error ? error.message : String(error)}`);
  }
};

export const analyzeCanadianBankingComplianceAI = async (imageBase64: string): Promise<ComplianceAnalysisResult> => {
  try {
    const requestBody = {
      operation: 'analyzeCanadianBankingCompliance',
      imageBase64: imageBase64,
    };

    return await callSupabaseEdgeFunction<ComplianceAnalysisResult>('gemini-analysis', requestBody, API_MAX_RETRIES, "AnalyzeCanadianBankingComplianceAI");
  } catch (error) {
    if (error instanceof SupabaseConnectionError) {
      throw error;
    }
    throw new Error(`Failed to analyze banking compliance: ${error instanceof Error ? error.message : String(error)}`);
  }
};

export const detectCanadianInstitutionAI = async (imageBase64: string): Promise<InstitutionRecognitionResult> => {
  try {
    const requestBody = {
      operation: 'detectCanadianInstitution',
      imageBase64: imageBase64,
    };

    return await callSupabaseEdgeFunction<InstitutionRecognitionResult>('gemini-analysis', requestBody, API_MAX_RETRIES, "DetectCanadianInstitutionAI");
  } catch (error) {
    if (error instanceof SupabaseConnectionError) {
      throw error;
    }
    throw new Error(`Failed to detect Canadian institution: ${error instanceof Error ? error.message : String(error)}`);
  }
};

export const assessFraudRiskAI = async (imageBase64: string): Promise<FraudRiskAssessment> => {
  try {
    const requestBody = {
      operation: 'assessFraudRisk',
      imageBase64: imageBase64,
    };

    return await callSupabaseEdgeFunction<FraudRiskAssessment>('gemini-analysis', requestBody, API_MAX_RETRIES, "AssessFraudRiskAI");
  } catch (error) {
    if (error instanceof SupabaseConnectionError) {
      throw error;
    }
    throw new Error(`Failed to assess fraud risk: ${error instanceof Error ? error.message : String(error)}`);
  }
};