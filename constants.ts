
// Existing Constants
export const GEMINI_VISION_MODEL = 'gemini-2.5-flash-preview-04-17';
export const API_MAX_RETRIES = 3;
export const API_RETRY_DELAY_MS = 1000; // Used for simple retry logic

export const MICR_SYMBOLS_MAP: { [key: string]: string } = {
  't': '⑆', // Transit (Routing Number) Symbol
  'a': '⑇', // Amount Symbol
  'o': '⑈', // On-Us (Account Number) Symbol
  'd': '⑉'  // Dash / Hyphen Symbol
};

// --- New Constants based on Canadian Banking Regulations ---

// CPA (Canadian Payments Association) Standard 006 - Physical Cheque & Image Standards
export const CPA_CHEQUE_DIMENSIONS = {
  MIN_LENGTH_INCHES: 6.25,
  MIN_HEIGHT_INCHES: 2.75,
  MAX_LENGTH_INCHES: 8.5,
  MAX_HEIGHT_INCHES: 3.5,
  ASPECT_RATIO_MIN: 1.8,
  ASPECT_RATIO_MAX: 3.1,
  ASPECT_RATIO_TYPICAL: 2.27, // (e.g., 6.25" / 2.75" = ~2.27)
};

export const CPA_IMAGE_RESOLUTION_DPI = {
  MIN_FOR_MICR_READING: 200,
  RECOMMENDED: 300,
  OPTIMAL: 600,
};

export const CPA_MICR_SPECIFICATIONS = {
  CLEAR_BAND_INCHES: 0.625, // Minimum 5/8 inch clear band around MICR line
  MIN_CONTRAST_RATIO: 0.60, // For MICR elements against background
  FONT_ENCODING: 'E-13B',
  TRANSIT_NUMBER_FORMAT_DESC: "DDDDDFFFC (5-digit Branch + 3-digit Institution + 1-digit Check Digit)",
  // Note: CPA Transaction codes are detailed in CPA Standard 006 Appendix VII.
  // The AI model is prompted to extract these codes based on their typical placement.
};

// OSFI (Office of the Superintendent of Financial Institutions) - Related Notes
// These are primarily regulatory/policy items. Constants here are for informational reference.
export const OSFI_REGULATORY_NOTES = {
  CRITICAL_SECURITY_EVENT_REPORTING_HOURS: 24,
  TECHNOLOGY_RISK_MANAGEMENT_COMPLIANCE_NOTE: "Compliance with OSFI guidelines on technology risk management is mandatory for federally regulated financial institutions.",
  CYBERSECURITY_INCIDENT_THRESHOLDS_NOTE: "OSFI defines specific thresholds for reporting cybersecurity incidents.",
  DATA_RETENTION_AUDIT_TRAIL_NOTE: "Adherence to OSFI's data retention and audit trail requirements is necessary for relevant entities.",
  PERFORMANCE_MONITORING_STANDARDS_NOTE: "OSFI outlines standards for performance monitoring of critical technology systems."
};

// Canadian Financial Institution Codes (Common Examples)
// The 3-digit institution number (FFF) is part of the 9-digit transit: DDDDDFFFC
export const CANADIAN_FINANCIAL_INSTITUTIONS: { [institutionCode: string]: string } = {
  '001': 'Bank of Montreal (BMO)',
  '002': 'The Bank of Nova Scotia (Scotiabank)',
  '003': 'Royal Bank of Canada (RBC)',
  '004': 'The Toronto-Dominion Bank (TD)',
  '006': 'National Bank of Canada',
  '010': 'Canadian Imperial Bank of Commerce (CIBC)',
  '016': 'HSBC Bank Canada',
  '030': 'Canadian Western Bank',
  '039': 'Laurentian Bank of Canada',
  '117': 'Government of Canada (Receiver General)',
  '177': 'Bank of Canada', // Central Bank
  // This list can be expanded. Full list is in the Payments Canada Financial Institutions File (FIF).
};

// Application File Input Requirements
export const APP_FILE_REQUIREMENTS = {
  // Supported MIME types for cheque images
  SUPPORTED_FORMATS: ['image/jpeg', 'image/png', 'image/tiff'],
  MIN_SIZE_BYTES: 50 * 1024, // 50KB
  MAX_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
  // Minimum image resolution needed by the application for attempting MICR read
  MIN_RESOLUTION_FOR_MICR_DPI: CPA_IMAGE_RESOLUTION_DPI.MIN_FOR_MICR_READING,
};

// Exporting some file requirement values directly for convenience if used elsewhere by these exact names
export const ALLOWED_IMAGE_TYPES = APP_FILE_REQUIREMENTS.SUPPORTED_FORMATS;
export const MAX_IMAGE_SIZE_BYTES = APP_FILE_REQUIREMENTS.MAX_SIZE_BYTES;
export const MAX_IMAGE_SIZE_MB = Math.floor(APP_FILE_REQUIREMENTS.MAX_SIZE_BYTES / (1024 * 1024));


// Constants for Enhanced API Retry Logic (Exponential Backoff - if implemented)
// The current geminiService.ts uses simple retry with API_RETRY_DELAY_MS.
// These are for a more advanced retry mechanism.
export const API_INITIAL_RETRY_DELAY_MS_EXPONENTIAL = 1000;
export const API_MAX_RETRY_DELAY_MS_EXPONENTIAL = 8000; // Max delay between retries
export const API_RETRY_BACKOFF_FACTOR_EXPONENTIAL = 2;
