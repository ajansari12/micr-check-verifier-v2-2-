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
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Supabase configuration missing. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.");
}

const callSupabaseEdgeFunction = async <T,>(
  functionName: string,
  requestBody: any,
  retries = API_MAX_RETRIES,
  serviceName = "SupabaseEdgeFunction"
): Promise<T> => {
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
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    return result as T;
  } catch (error) {
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
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return Promise.reject(new Error("Supabase configuration is missing."));
  }

  const requestBody = {
    operation: 'analyzeChequeDetails',
    imageBase64: imageBase64,
  };

  return callSupabaseEdgeFunction<ChequeData>('gemini-analysis', requestBody, API_MAX_RETRIES, "AnalyzeChequeDetails");
};

export const generateDecisionIntelligenceAI = async (
  initialChequeData: Partial<ChequeData>,
  institutionContext: InstitutionContextForDecision | null
): Promise<DecisionIntelligence | null> => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("Supabase configuration missing for Decision Intelligence generation.");
    return null;
  }

  const requestBody = {
    operation: 'generateDecisionIntelligence',
    initialChequeData,
    institutionContext,
  };

  return callSupabaseEdgeFunction<DecisionIntelligence>('gemini-analysis', requestBody, API_MAX_RETRIES, "GenerateDecisionIntelligenceAI");
};

export const analyzeSecurityFeaturesAI = async (imageBase64: string): Promise<SecurityAssessment> => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return Promise.reject(new Error("Supabase configuration is missing."));
  }

  const requestBody = {
    operation: 'analyzeSecurityFeatures',
    imageBase64: imageBase64,
  };

  return callSupabaseEdgeFunction<SecurityAssessment>('gemini-analysis', requestBody, API_MAX_RETRIES, "AnalyzeSecurityFeaturesAI");
};

export const analyzeCanadianBankingComplianceAI = async (imageBase64: string): Promise<ComplianceAnalysisResult> => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return Promise.reject(new Error("Supabase configuration is missing."));
  }

  const requestBody = {
    operation: 'analyzeCanadianBankingCompliance',
    imageBase64: imageBase64,
  };

  return callSupabaseEdgeFunction<ComplianceAnalysisResult>('gemini-analysis', requestBody, API_MAX_RETRIES, "AnalyzeCanadianBankingComplianceAI");
};

export const detectCanadianInstitutionAI = async (imageBase64: string): Promise<InstitutionRecognitionResult> => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return Promise.reject(new Error("Supabase configuration is missing."));
  }

  const requestBody = {
    operation: 'detectCanadianInstitution',
    imageBase64: imageBase64,
  };

  return callSupabaseEdgeFunction<InstitutionRecognitionResult>('gemini-analysis', requestBody, API_MAX_RETRIES, "DetectCanadianInstitutionAI");
};

export const assessFraudRiskAI = async (imageBase64: string): Promise<FraudRiskAssessment> => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return Promise.reject(new Error("Supabase configuration is missing."));
  }

  const requestBody = {
    operation: 'assessFraudRisk',
    imageBase64: imageBase64,
  };

  return callSupabaseEdgeFunction<FraudRiskAssessment>('gemini-analysis', requestBody, API_MAX_RETRIES, "AssessFraudRiskAI");
};