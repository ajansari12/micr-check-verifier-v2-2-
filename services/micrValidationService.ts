
// import { FinancialInstitutionDetails } from '../types'; // Removed as it's deprecated
import { MICR_SYMBOLS_MAP } from '../constants';

// --- Internal Data Structures & Types ---

/**
 * Detailed result of a transit number validation.
 */
export interface TransitNumberValidationDetail {
  originalInput: string;
  isValid: boolean;
  isFormatValid: boolean;
  isChecksumValid: boolean | null; // null if format is invalid
  branchCode: string | null;
  institutionCode: string | null;
  calculatedCheckDigit: string | null; // The check digit derived from the first 8 digits
  expectedCheckDigit: string | null; // The last digit of the input transit number
  errorMessages: string[];
}

/**
 * Data extracted from parsing a raw MICR line.
 */
export interface ParsedMicrData {
  rawMicrOriginal: string;
  standardizedMicr: string; // MICR string with symbols replaced by canonical characters
  transitNumber: string | null;
  accountNumber: string | null;
  checkNumber: string | null;
  transactionCode: string | null;
  amount: string | null;
  auxiliaryOnUs: string | null;
  parsingErrors: string[];
}

/**
 * Internal representation for financial institution data.
 */
interface FinancialInstitutionDataInternal {
  name: string;
  locationsCovered: string; // e.g. "All provinces", "Western Canada"
  regulatoryAuthorities: ('OSFI' | 'Provincial Regulator' | 'CDIC Member' | 'Government' | string)[];
  typeOfInstitution: 'Schedule I Bank' | 'Schedule II Bank' | 'Credit Union' | 'Caisse Populaire' | 'Federal Government' | 'Provincial Government' | 'OtherFinancialInstitution';
}

// --- Constants and Internal Databases ---

const MICR_INSTITUTIONS_DB: Record<string, FinancialInstitutionDataInternal> = {
  '001': { name: 'Bank of Montreal (BMO)', locationsCovered: 'All provinces', regulatoryAuthorities: ['OSFI', 'CDIC Member'], typeOfInstitution: 'Schedule I Bank' },
  '002': { name: 'The Bank of Nova Scotia (Scotiabank)', locationsCovered: 'All provinces', regulatoryAuthorities: ['OSFI', 'CDIC Member'], typeOfInstitution: 'Schedule I Bank' },
  '003': { name: 'Royal Bank of Canada (RBC)', locationsCovered: 'All provinces', regulatoryAuthorities: ['OSFI', 'CDIC Member'], typeOfInstitution: 'Schedule I Bank' },
  '004': { name: 'The Toronto-Dominion Bank (TD)', locationsCovered: 'All provinces', regulatoryAuthorities: ['OSFI', 'CDIC Member'], typeOfInstitution: 'Schedule I Bank' },
  '006': { name: 'National Bank of Canada', locationsCovered: 'All provinces', regulatoryAuthorities: ['OSFI', 'CDIC Member'], typeOfInstitution: 'Schedule I Bank' },
  '010': { name: 'Canadian Imperial Bank of Commerce (CIBC)', locationsCovered: 'All provinces', regulatoryAuthorities: ['OSFI', 'CDIC Member'], typeOfInstitution: 'Schedule I Bank' },
  '016': { name: 'HSBC Bank Canada', locationsCovered: 'All provinces', regulatoryAuthorities: ['OSFI', 'CDIC Member'], typeOfInstitution: 'Schedule II Bank' },
  '030': { name: 'Canadian Western Bank', locationsCovered: 'Western Canada', regulatoryAuthorities: ['OSFI', 'CDIC Member'], typeOfInstitution: 'Schedule I Bank' },
  '039': { name: 'Laurentian Bank of Canada', locationsCovered: 'Quebec/Ontario predominantly', regulatoryAuthorities: ['OSFI', 'CDIC Member'], typeOfInstitution: 'Schedule I Bank' },
  '117': { name: 'Government of Canada (Receiver General)', locationsCovered: 'All provinces', regulatoryAuthorities: ['Government'], typeOfInstitution: 'Federal Government' },
  '177': { name: 'Bank of Canada', locationsCovered: 'All provinces (Central Bank functions)', regulatoryAuthorities: ['Government'], typeOfInstitution: 'Federal Government' },
  // Note: Credit Unions and Caisses Populaires often have specific provincial institution numbers.
  // E.g., '809' (PC Financial - handled by CIBC), '815' (Alterna Savings - ON CU), '828' (Vancouver City Savings CU - BC), '829' (Meridian CU - ON), '837' (Servus CU - AB)
  // '540' (Manitoba Credit Unions), '600' series (ATB Financial - Alberta provincial crown corp), etc.
  // For this exercise, focusing on the provided list. A full FIF file would be needed for all.
};

const PROVINCE_BRANCH_MAP: Record<string, string> = {
  '0': 'British Columbia & Yukon', // Yukon often grouped with BC by FIs
  '1': 'Western Canada (Alberta, Saskatchewan, Manitoba)',
  '2': 'Ontario (Toronto & Central Ontario)',
  '3': 'Ontario (Southwestern & Eastern Ontario)',
  '4': 'Ontario (Northern Ontario & other specific regions)', // CPA docs split Ontario further
  '5': 'Quebec',
  '6': 'Atlantic Canada (Nova Scotia, New Brunswick)',
  '7': 'Atlantic Canada (PEI, Newfoundland & Labrador, specific Quebec regions)',
  '8': 'Atlantic Canada (Other specific regions or specialized branches)', // Less common prefix for general branches
  '9': 'Territories (NWT, Nunavut) & specialized branches', // Also less common for standard branches
};


// --- MICR Validation Functions ---

/**
 * Validates a Canadian MICR transit number for format and CPA checksum.
 * Format: DDDDDFFFC (5-digit Branch, 3-digit Institution, 1-digit Check Digit)
 * Checksum: (d1*1 + d2*7 + d3*3 + d4*1 + d5*7 + d6*3 + d7*1 + d8*7 + d9*3) mod 10 == 0
 * @param transitNumberString The 9-digit transit number string.
 * @returns A TransitNumberValidationDetail object.
 */
export function validateTransitNumber(transitNumberString: string): TransitNumberValidationDetail {
  const errors: string[] = [];
  let isFormatValid = false;
  let isChecksumValid: boolean | null = null;
  let branchCode: string | null = null;
  let institutionCode: string | null = null;
  let expectedCheckDigit: string | null = null;
  let calculatedCheckDigitFrom8: string | null = null;

  if (!transitNumberString || typeof transitNumberString !== 'string') {
    errors.push('Input must be a string.');
  } else if (transitNumberString.length !== 9) {
    errors.push('Transit number must be exactly 9 digits long.');
  } else if (!/^\d{9}$/.test(transitNumberString)) {
    errors.push('Transit number must contain only digits.');
  } else {
    isFormatValid = true;
    branchCode = transitNumberString.substring(0, 5);
    institutionCode = transitNumberString.substring(5, 8);
    expectedCheckDigit = transitNumberString.substring(8, 9);

    const digits = transitNumberString.split('').map(Number);
    const weights = [1, 7, 3, 1, 7, 3, 1, 7, 3]; // Weights for d1 to d9
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += digits[i] * weights[i];
    }
    isChecksumValid = sum % 10 === 0;
    if (!isChecksumValid) {
      errors.push('CPA checksum validation failed.');
    }
    
    calculatedCheckDigitFrom8 = calculateCpaCheckDigit(transitNumberString.substring(0,8));
  }

  return {
    originalInput: transitNumberString,
    isValid: isFormatValid && (isChecksumValid === true),
    isFormatValid,
    isChecksumValid,
    branchCode,
    institutionCode,
    expectedCheckDigit,
    calculatedCheckDigit: calculatedCheckDigitFrom8,
    errorMessages: errors,
  };
}

/**
 * Retrieves details for a given 3-digit Canadian financial institution code.
 * @param institutionCode The 3-digit institution code (FFF).
 * @returns A FinancialInstitutionDetails object or null if not found.
 * NOTE: This function and its internal DB (MICR_INSTITUTIONS_DB) are simplified and likely superseded
 * by the more comprehensive canadianBankingDatabase.ts for populating full institution details.
 * This function's return type would need to be CanadianInstitution and its mapping logic updated
 * if it were to be the primary source, which is not currently the case.
 */
export function getInstitutionDetails(institutionCode: string): any | null { // Return type changed to any to avoid error for now
  if (!institutionCode || typeof institutionCode !== 'string' || !/^\d{3}$/.test(institutionCode)) {
    return null; // Invalid format for institution code
  }
  const internalData = MICR_INSTITUTIONS_DB[institutionCode];
  if (internalData) {
    // This mapping is to a deprecated/internal structure.
    // If this function were to be used to populate CanadianInstitution, it would need a major overhaul.
    return {
      institutionCode: institutionCode,
      institutionName: internalData.name,
      branchCode: null, 
      branchLocation: internalData.locationsCovered, 
      regulatoryAuthorities: internalData.regulatoryAuthorities,
      typeOfInstitution: internalData.typeOfInstitution,
    };
  }
  return null;
}

/**
 * Determines the general geographic location/region of a branch based on its 5-digit code.
 * The first digit of the branch code often indicates the province or region.
 * @param branchCode The 5-digit branch code (DDDDD).
 * @param _institutionCode Optional: The 3-digit institution code (not used in current generic logic but could be for FI-specific overrides).
 * @returns A string describing the branch location/region, or null if the branch code format is invalid.
 */
export function getBranchLocation(branchCode: string | null | undefined, _institutionCode?: string): string | null {
  if (!branchCode || typeof branchCode !== 'string' || !/^\d{5}$/.test(branchCode)) {
    return null; // Invalid format for branch code
  }
  const firstDigit = branchCode.substring(0, 1);
  return PROVINCE_BRANCH_MAP[firstDigit] || 'Region Undetermined / Specialized Branch';
}

/**
 * Performs basic validation on an account number string.
 * Note: Actual account number formats and validation rules are highly specific to each financial institution
 * and are not standardized by CPA Standard 006 for public validation. This function provides generic checks.
 * @param accountNumber The account number string.
 * @param _institutionCode Optional: The institution code, which could be used for FI-specific rules if available.
 * @returns True if the account number passes basic checks, false otherwise.
 */
export function validateAccountFormat(accountNumber: string, _institutionCode?: string): boolean {
  if (!accountNumber || typeof accountNumber !== 'string' || accountNumber.trim().length === 0) {
    return false; // Must not be empty
  }
  // Basic checks: mostly digits, possibly hyphens or spaces (which MICR usually doesn't have for account)
  // Common lengths are between 4 to 17 characters, but this varies widely.
  if (accountNumber.length < 3 || accountNumber.length > 20) { // Looser length for broader FI compatibility
    return false;
  }
  // Allow digits and potentially a few common non-alphanumeric symbols if they are part of some FI's format
  // but typically, MICR account numbers are purely numeric or have specific delimiters not part of the number itself.
  if (!/^[0-9A-Za-z\-]*$/.test(accountNumber.replace(/\s/g, ''))) { 
    // Allowing alphanumeric and hyphen after removing spaces. Some FIs might use alpha.
    return false;
  }
  // Further FI-specific validation (e.g., check digits, length, format) would be required here.
  return true;
}

/**
 * Calculates the CPA check digit (9th digit) for an 8-digit transit number prefix.
 * The formula is (d1*1 + d2*7 + d3*3 + d4*1 + d5*7 + d6*3 + d7*1 + d8*7 + C*3) mod 10 == 0
 * @param eightDigits The first 8 digits of a transit number.
 * @returns The calculated check digit as a string (0-9), or null if input is invalid.
 */
export function calculateCpaCheckDigit(eightDigits: string): string | null {
  if (!eightDigits || typeof eightDigits !== 'string' || !/^\d{8}$/.test(eightDigits)) {
    return null;
  }
  const digits = eightDigits.split('').map(Number);
  const weights = [1, 7, 3, 1, 7, 3, 1, 7]; // Weights for d1 to d8
  let sumFirstEight = 0;
  for (let i = 0; i < 8; i++) {
    sumFirstEight += digits[i] * weights[i];
  }

  for (let checkDigit = 0; checkDigit < 10; checkDigit++) {
    if ((sumFirstEight + (checkDigit * 3)) % 10 === 0) {
      return String(checkDigit);
    }
  }
  return null; // Should not happen if logic is correct, means no check digit satisfies
}

/**
 * Parses a raw MICR string to extract key Canadian cheque fields.
 * This parser makes assumptions based on common MICR layouts and CPA Standard 006 symbols.
 * It may not correctly parse all possible MICR line variations.
 * Note: Physical characteristics like E-13B font compliance or clear band spacing cannot be validated from string input.
 * @param micrString The raw MICR line string, possibly containing E-13B symbols.
 * @returns A ParsedMicrData object.
 */
export function parseMicrLine(micrString: string): ParsedMicrData {
  const errors: string[] = [];
  let standardized = micrString;

  if (!micrString || typeof micrString !== 'string') {
    errors.push("Input MICR string is invalid or empty.");
    return {
      rawMicrOriginal: micrString || "",
      standardizedMicr: "",
      transitNumber: null, accountNumber: null, checkNumber: null, transactionCode: null, amount: null, auxiliaryOnUs: null,
      parsingErrors: errors,
    };
  }

  // Replace MICR symbols with canonical characters for easier regex
  Object.entries(MICR_SYMBOLS_MAP).forEach(([char, symbol]) => {
    standardized = standardized.replace(new RegExp(symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), char);
  });
  // Remove any non-standard characters that are not digits, canonical symbols, or common separators like space/dash.
  // This is aggressive and might remove valid data if the MICR line contains unexpected characters.
  // A less aggressive approach might be to only allow specific known characters.
  // standardized = standardized.replace(/[^0-9otad\s-]/gi, ''); // Example of more aggressive cleaning

  let transitNumber: string | null = null;
  let accountNumber: string | null = null;
  let checkNumber: string | null = null;
  let transactionCode: string | null = null;
  let amount: string | null = null;
  let auxiliaryOnUs: string | null = null;

  // Try to extract Transit Number (prefixed by 't', 9 digits)
  const transitMatch = standardized.match(/t(\d{9})/);
  if (transitMatch) {
    transitNumber = transitMatch[1];
    // Remove it to simplify parsing remaining parts
    // standardized = standardized.replace(transitMatch[0], ''); 
  } else {
    errors.push("Transit symbol 't' or 9-digit transit number not found or not in expected format.");
  }

  // Try to extract Account Number (prefixed by 'o')
  // Account numbers can have variable length and may contain digits, sometimes dashes.
  const accountMatch = standardized.match(/o([0-9A-Za-z\-]+)/); // Allow alphanumeric & hyphen
  if (accountMatch) {
    accountNumber = accountMatch[1].replace(/-/g, ''); // Remove hyphens for a cleaner account number
  } else {
    //errors.push("On-Us symbol 'o' or account number not found.");
    // It's common for some systems to omit 'o' and parse positionally.
    // If 'o' is missing, we might try to infer account from remaining string after transit.
  }

  // Try to extract Amount (prefixed by 'a', digits, possibly a decimal point, often ends with 'a')
  const amountMatch = standardized.match(/a([\d.,]+)a?/); // Allowing . or , as decimal separators
  if (amountMatch) {
    amount = amountMatch[1].replace(/,/g, '.'); // Standardize decimal to '.'
    // Validate if it's a plausible number format
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
        errors.push(`Extracted amount "${amount}" is not in a recognized numeric format.`);
        amount = null; // Discard if format is bad
    }
  }

  // --- Heuristic parsing for Check Number, AuxOnUs, Transaction Code ---
  // This part is highly dependent on cheque layout.
  // A common Canadian MICR layout for personal cheques is often:
  // ChequeNumber [AuxOnUsData] tTransitNumber oAccountNumber [TransactionCode]
  // Business cheques can vary more.

  // Attempt to find parts *before* the transit symbol (if found)
  let preTransitPart = standardized;
  if (transitMatch) {
    preTransitPart = standardized.substring(0, standardized.indexOf(transitMatch[0])).trim();
  } else if (accountMatch) { // If no transit, try before account
    preTransitPart = standardized.substring(0, standardized.indexOf(accountMatch[0])).trim();
  }


  if (preTransitPart) {
    // Check number is often the first numeric block, possibly followed by a dash or space.
    // Auxiliary On-Us can be complex.
    // Example: "123d456" -> check="123", aux="456"
    // Example: "00000123 12345" -> check="00000123", aux="12345"
    const checkAuxParts = preTransitPart.split(/[\s-]+/); // Split by space or dash
    if (checkAuxParts.length > 0 && /^\d+$/.test(checkAuxParts[0])) {
      checkNumber = checkAuxParts[0];
      if (checkAuxParts.length > 1) {
        auxiliaryOnUs = checkAuxParts.slice(1).join('').trim(); // Join remaining parts as Aux
        if (auxiliaryOnUs.length === 0) auxiliaryOnUs = null;
      }
    } else if (/^\d+$/.test(preTransitPart)) { // Whole pre-transit is numeric
        checkNumber = preTransitPart; // Could be a long check number or aux only
    } else if (preTransitPart.length > 0){
        // If not purely numeric, could be aux, or check with non-numeric chars (less common for MICR check#)
        auxiliaryOnUs = preTransitPart;
    }
  }

  // Transaction Code: Often a short numeric code at the end, or after AccountNumber
  let postAccountPart = "";
  if (accountMatch) {
    const accountEndIndex = standardized.indexOf(accountMatch[0]) + accountMatch[0].length;
    postAccountPart = standardized.substring(accountEndIndex).trim();
  } else if (transitMatch) { // If no account, try after transit
    const transitEndIndex = standardized.indexOf(transitMatch[0]) + transitMatch[0].length;
    postAccountPart = standardized.substring(transitEndIndex).trim();
  }
  
  if (postAccountPart) {
    const potentialTxCodeMatch = postAccountPart.match(/^\s*(\d{1,4})\s*/); // 1 to 4 digits, possibly surrounded by spaces
    if (potentialTxCodeMatch) {
      transactionCode = potentialTxCodeMatch[1];
    } else if (/^\d+$/.test(postAccountPart) && postAccountPart.length <=4) { // Entire remaining part is short numeric
        transactionCode = postAccountPart;
    }
    // If transaction code was extracted, what remains could be other fields or noise.
  }
  
  // If no check number found and aux looks like it could be a check number (and there's no other aux data)
  if (!checkNumber && auxiliaryOnUs && /^\d+$/.test(auxiliaryOnUs) && !preTransitPart.includes(' ')) {
    // Potentially, what was marked as aux is actually the check number
    // This is a heuristic. More sophisticated parsing would be needed for high accuracy on all layouts.
    // Example: 123456t... -> aux = 123456. If no other check number found, this *could* be it.
  }

  // Basic clean up: if any field is an empty string, set to null.
  if (accountNumber === "") accountNumber = null;
  if (checkNumber === "") checkNumber = null;
  if (transactionCode === "") transactionCode = null;
  if (amount === "") amount = null;
  if (auxiliaryOnUs === "") auxiliaryOnUs = null;


  if (!transitNumber && !accountNumber && !checkNumber && !amount && errors.length > 0) {
      errors.push("Failed to extract any meaningful fields from the MICR line.");
  } else if (errors.length === 0 && !transitNumber) {
      // If no errors were added but transit is still missing, add a generic one.
      // This might happen if the regex simply didn't match without throwing syntax error.
      // errors.push("Could not confidently parse all expected MICR fields.");
      // Let's be less verbose if some fields were found.
  }


  return {
    rawMicrOriginal: micrString,
    standardizedMicr: standardized,
    transitNumber,
    accountNumber,
    checkNumber,
    transactionCode,
    amount,
    auxiliaryOnUs,
    parsingErrors: errors,
  };
}

/**
 * Note on Physical MICR Standards (CPA Standard 006):
 * - E-13B Font Encoding: This service assumes the input `micrString` is the textual representation
 *   of characters read from an E-13B encoded line. It cannot validate the font itself.
 * - MICR Clear Band (5/8 inch spacing): This is a physical layout requirement for the cheque
 *   and cannot be validated from the MICR string alone. Image analysis would be needed.
 */