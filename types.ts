// --- Existing Base Cheque Data Structure ---
export interface ChequeData {
  // MICR Fields (retained and re-confirmed for Canadian context)
  transitNumber: string | null; 
  accountNumber: string | null;
  checkNumber: string | null; 
  transactionCode?: string | null; 
  auxiliaryOnUs?: string | null;
  transitNumberValid?: boolean | null; 
  rawExtractedMicr?: string | null; 
  
  // New fields for explicit extraction of branch and institution codes
  branchCode?: string | null; // 5-digit branch code
  institutionNumber?: string | null; // 3-digit institution number

  payeeName?: string | null;
  amountNumerals?: string | null;
  amountWords?: string | null;
  currencyDesignation?: string | null; 
  
  chequeDate?: string | null; 
  chequeDateValid?: boolean | null; 
  chequeDateFormatRecognized?: string | null; 
  printedDateIndicatorsPresent?: boolean | null;

  isStaleDated?: boolean | null; // Calculated client-side
  isPostDated?: boolean | null; // Calculated client-side

  signaturePresent?: boolean | null;
  voidPantographDetected?: boolean | null; 
  
  alterationsPayeeSuspected?: boolean | null;
  alterationsAmountSuspected?: boolean | null;
  
  inkColorAcceptable?: boolean | null; 
  
  designIssues?: string[]; 

  overallClarity?: 'good' | 'fair' | 'poor' | null;
  
  processingNotes?: string | null; 
}

// --- Enhanced Types with Canadian Banking Context ---
import { 
    CanadianInstitution as BankingDbCanadianInstitution, 
    EnhancedMicrContext as BankingDbEnhancedMicrContext, 
    InstitutionRiskAssessment as BankingDbInstitutionRiskAssessment 
} from './services/canadianBankingDatabase.ts';


export interface CanadianChequeImageQuality {
  cpaStandard006Compliant: boolean | null;
  micrLineReadability: 'excellent' | 'good' | 'fair' | 'poor' | null;
  printContrastRatio: number | null; 
  chequeDimensionsValid: boolean | null; 
  micrClearBandDetected: boolean | null; 
  imageResolutionDPI?: number | null; 
}

export interface MicrValidationFields {
  transitNumber: string | null; 
  transitNumberCpaChecksumValid: boolean | null; 
  checkDigitValid?: boolean | null; 
  accountNumber: string | null;
  checkNumber: string | null; 
  transactionCode: string | null; 
  e13bFontEncodingCompliant?: boolean | null; 
  cpaStandard006TransactionCodeKnown?: boolean | null; 
}

export interface SecurityAssessment {
  osfiReportableRisk: boolean | null; 
  tamperEvidenceCheck: 'passed' | 'failed' | 'unknown' | null;
  imageAuthenticityScore: number | null; 
  detectedSecurityFeatures: string[]; 
  fraudRiskLevel: 'Low' | 'Medium' | 'High' | 'Critical' | null;
  alterationsEvident: boolean | null; 
  counterfeitLikelihoodScore: number | null; 
  suspiciousPatternsObserved: string[]; 
}

export interface ComplianceLogEntry {
  timestamp: string; 
  userOrSystemIdentifier: string; 
  actionPerformed: string; 
  targetEntityId?: string; 
  associatedRiskLevel?: 'Low' | 'Medium' | 'High' | 'Critical' | null; 
  details?: Record<string, any>; 
}

export type CanadianInstitution = BankingDbCanadianInstitution;
export type EnhancedMicrContext = BankingDbEnhancedMicrContext;
export type InstitutionRiskAssessment = BankingDbInstitutionRiskAssessment;

export interface EnhancedChequeData extends ChequeData {
  cpaImageQuality?: CanadianChequeImageQuality | null;
  micrValidation?: MicrValidationFields | null;
  securityAssessment?: SecurityAssessment | null;
  institutionDetails?: CanadianInstitution | null; 
}

export interface OSFIIncidentRecord {
  recordId: string; 
  incidentReportedToOSFITimestamp: string; 
  incidentOccurrenceTimestamp: string; 
  eventType: string; 
  eventCriticality: 'High' | 'Medium' | 'Low'; 
  involvedSystems: string[]; 
  eventDescription: string; 
  assessedImpact: string; 
  actionsTakenAndPlanned: string[]; 
  reportingFinancialInstitutionCode: string; 
  relatedChequeTransactionIds?: string[]; 
}

export interface AppPerformanceMetric {
  metricKey: string; 
  metricValue: number | string; 
  metricUnit?: string; 
  captureTimestamp: string; 
  tags?: Record<string, string>; 
}

export interface ComplianceAnalysisResult {
  isStaleDatedAI: boolean | null; 
  isPostDatedAI: boolean | null;  
  isDateCanadianBusinessDay?: boolean | null; 
  provincialHolidayImpact?: string | null; 
  currencyDesignationValid?: boolean | null; 
  overallCPA006ComplianceNotes?: string[]; 
}

export interface InstitutionRecognitionResult {
  recognizedInstitutionName?: string | null; 
  confidenceScore?: number | null; 
  institutionTypeGuess?: 'Bank' | 'Credit Union' | 'Government' | 'Other' | null;
  countryOfOrigin?: 'Canada' | 'USA' | 'Other' | 'Unknown' | null;
  visualElementsUsed?: string[]; 
}

export interface FraudRiskAssessment {
  overallFraudRiskScore: number | null; 
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical' | null;
  keyRiskFactors: { factor: string; details: string; severity: 'Low' | 'Medium' | 'High' }[];
  recommendedActions?: string[]; 
  confidenceInAssessment?: number | null; 
}

// --- Decision Intelligence Types ---
export interface HistoricalContext {
  caseId: string;
  date: string; // ISO Date string
  issue: string;
  resolution: string;
}

export interface ContactInfo {
  type: 'Verification' | 'Fraud Department' | 'Branch General' | 'Customer Service' | 'Compliance';
  method: 'Phone' | 'Email' | 'Secure Portal' | 'Internal System';
  details: string; // e.g., phone number, email address, system name
}

export interface RiskAssessmentDecision {
  riskLevel: 'Accept' | 'Review' | 'Reject' | 'Investigate';
  confidence: number; // 0-100%
  reasonsForConcern: string[];
  recommendedActions: string[];
  similarCases?: HistoricalContext[]; // Optional
}

export interface OperationsGuidance {
  immediateAction: 'Process Normally' | 'Route to Supervisor' | 'Hold for Investigation' | 'Manual Verification Required' | 'Contact Institution' | 'Reject Item';
  documentationRequired: string[]; // What to document in system
  processingTimeframe: 'Standard' | 'Expedited Review' | 'Immediate Action';
  escalationPath?: string; // Who to contact if uncertain
}

export interface InstitutionContextForDecision {
  bankName: string;
  institutionRiskProfile: 'Standard' | 'Enhanced Monitoring' | 'High Risk' | 'Unknown'; // From banking database
  recentIssuesWithInstitution?: string[]; // e.g., "Recent reports of counterfeit items from this FI"
  keyVerificationContacts?: ContactInfo[];
}

export interface DecisionIntelligence {
  overallRiskAssessment: RiskAssessmentDecision;
  operationsGuidance: OperationsGuidance;
  institutionContext: InstitutionContextForDecision;
  summaryStatement: string; // A concise, actionable summary
}

// Updated ChequeVerificationResult
export interface ChequeVerificationResult extends EnhancedChequeData {
  imageUrl: string; 
  groundingMetadata?: GroundingMetadata | null; 
  
  verificationId?: string; 
  processingTimestamp?: string; 

  aiComplianceAnalysis?: ComplianceAnalysisResult | null;
  aiInstitutionRecognition?: InstitutionRecognitionResult | null;
  aiFraudRiskAssessment?: FraudRiskAssessment | null;

  bankingIntelligence?: EnhancedMicrContext | null; 
  institutionalRiskAssessment?: InstitutionRiskAssessment | null;
  isInstitutionLocallyValidated?: boolean | null;

  decisionIntelligence?: DecisionIntelligence | null; // << NEW FIELD
}


export interface GroundingChunkWeb {
  uri: string;
  title: string;
}
export interface GroundingChunk { web?: GroundingChunkWeb; }
export interface GroundingMetadata { groundingChunks?: GroundingChunk[]; }
export interface Candidate { groundingMetadata?: GroundingMetadata; }


// --- Alert System Types ---
interface AlertAction {
  label: string;
  onClick: () => void;
  type?: 'primary' | 'secondary' | 'danger';
}

export interface CanadianBankingAlertInfoProps {
  id?: string;
  type: 'critical' | 'warning' | 'success' | 'info';
  title: string;
  message: React.ReactNode;
  details?: React.ReactNode;
  cpaStandard?: string;
  osfiGuideline?: string;
  actions?: AlertAction[];
  autoDismiss?: boolean;
  autoDismissDelay?: number;
  onDismiss: () => void; 
  canDismiss?: boolean;
  icon?: React.ReactNode;
  timestamp?: string;
  showIcon?: boolean;
  className?: string;
}

// --- Reporting Types ---
export type ReportType = 
  | 'IndividualCheque' 
  | 'BatchSummary' 
  | 'ComplianceAudit' 
  | 'SecurityIncident' 
  | 'PerformanceMetrics';

export interface ReportOptions {
  template?: 'executive' | 'technical' | 'regulatory';
  includeSensitiveData?: boolean;
  language?: 'en' | 'fr';
}

export interface GeneratedReportData {
  reportId: string;
  reportType: ReportType;
  generatedOn: string; 
  title: string;
  executiveSummary?: string;
  sections: { title: string; content: React.ReactNode | Record<string, any> }[];
  dataSourceDescription?: string; 
  reportOptionsApplied?: ReportOptions;
}

// --- Security Feature Overlay Types ---
export type SecurityFeatureType = 'microprinting' | 'void_pantograph' | 'watermark' | 'security_thread' | 'rainbow_printing' | 'chemical_protection' | 'intaglio_printing' | 'other_security_feature';
export type FraudIndicatorType = 'alteration_stain' | 'alteration_erasure' | 'font_inconsistency' | 'misaligned_printing' | 'poor_reproduction' | 'micr_anomaly' | 'edge_artifact' | 'other_fraud_indicator';

export interface BoundingBox { 
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SecurityFeatureAnnotation {
  id: string;
  type: SecurityFeatureType | FraudIndicatorType; 
  isSecurityFeature: boolean; 
  label: string; 
  boundingBox: BoundingBox;
  confidence?: number; // 0-1
  description?: string; 
  cpaReference?: string; 
  osfiReference?: string; 
  severity?: 'Low' | 'Medium' | 'High' | 'Critical'; 
}

// --- Batch Processing Types ---
export interface BatchCheque {
  id: string; // Unique ID within the batch, e.g., "cheque_1", "cheque_2"
  fileName?: string; // Original filename if from a multi-image batch (e.g. from ZIP)
  status: 'pending' | 'processing' | 'completed' | 'error';
  statusMessage?: string;
  verificationResult?: ChequeVerificationResult | null;
}

export interface ChequeBatch {
  batchId: string; // Unique ID for the batch
  originalFilename: string; // Filename of the uploaded batch file (e.g., cheques.zip)
  uploadTimestamp: string; // ISO 8601 string
  totalCheques: number; // Estimated or actual number of cheques in the batch
  processedCheques: number; // Number of cheques processed so far
  status: 'uploading' | 'queued' | 'processing' | 'partially_completed' | 'completed' | 'failed';
  cheques: BatchCheque[]; // Array of individual cheques within the batch
}