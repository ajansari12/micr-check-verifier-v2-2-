// services/canadianBankingDatabase.ts

// --- Interface Definition ---
export interface CanadianInstitution {
  // Core Identification
  institutionNumber: string;        // 3-digit institution code
  name: string;                    // Full legal name
  commonName: string;              // Brand name (RBC, BMO, etc.)
  shortName: string;               // Abbreviation
  
  // Institution Classification
  type: 'Bank' | 'Credit Union' | 'Trust Company' | 'Caisse Populaire';
  regulatoryBody: 'OSFI' | 'Provincial' | 'CUDIC' | 'DICO'; // CUDIC for BC, DICO for ON CUs
  status: 'Active' | 'Merged' | 'Closed' | 'Acquired';
  
  // Financial & Insurance Information
  cdic: boolean;                   // CDIC deposit insurance
  assets: string;                  // Asset size (e.g., "$1.2T+")
  depositInsurance: string;        // "CDIC", "DICO (Ontario)", "CUDIC (BC)", "Provincial Scheme" etc.
  
  // Location & Contact
  headquarters: string;            // City, Province
  website: string;                 // Official website
  customerService: string;         // Customer service phone
  primaryProvinces: string[];      // Operating provinces. "All Provinces" for national.
  
  // Operational Details
  branches: number;                // Approximate branch count (0 for digital-only)
  founded: number;                 // Year established
  swiftCode?: string;              // International SWIFT code
  cdicCode: string;                // CDIC member code (often part of SWIFT or similar)
  
  // Banking Professional Information
  specialNotes?: string;           // Banking-specific considerations
  riskProfile: 'Low' | 'Medium' | 'High'; // General institutional risk assessment
  complianceLevel: 'Standard' | 'Enhanced' | 'Special'; // Internal compliance level
  
  // Verification Support (Example fields, may not be publicly available for all)
  verificationPhone?: string;      // Dedicated verification line
  fraudReportingPhone?: string;    // Fraud reporting contact
  managerContact?: string;         // General line for branch manager inquiries (conceptual)
}

// --- Comprehensive Institution Database ---
export const CANADIAN_BANKING_DATABASE: Record<string, CanadianInstitution> = {
  "001": {
    institutionNumber: "001",
    name: "Bank of Montreal",
    commonName: "BMO Financial Group",
    shortName: "BMO",
    type: "Bank",
    regulatoryBody: "OSFI",
    status: "Active",
    cdic: true,
    assets: "$1.3T+", // As of Q2 2024
    depositInsurance: "CDIC",
    headquarters: "Montreal, QC & Toronto, ON (Operational HQ)",
    website: "https://www.bmo.com",
    customerService: "1-877-225-5266",
    primaryProvinces: ["All Provinces"],
    branches: 900, // Approx Canada
    founded: 1817,
    swiftCode: "BOFMCAM2",
    cdicCode: "BMOA", // Example CDIC code, may vary or be internal
    riskProfile: "Low",
    complianceLevel: "Standard",
    verificationPhone: "1-800-363-9992", // General business line, actual verification lines are internal
    fraudReportingPhone: "1-877-225-5266",
    specialNotes: "Canada's oldest bank. Strong commercial banking. Acquired Bank of the West (US)."
  },
  "002": {
    institutionNumber: "002",
    name: "The Bank of Nova Scotia",
    commonName: "Scotiabank",
    shortName: "Scotia",
    type: "Bank",
    regulatoryBody: "OSFI",
    status: "Active",
    cdic: true,
    assets: "$1.4T+", // As of Q2 2024
    depositInsurance: "CDIC",
    headquarters: "Toronto, ON",
    website: "https://www.scotiabank.com",
    customerService: "1-800-472-6842",
    primaryProvinces: ["All Provinces"],
    branches: 900, // Approx Canada
    founded: 1832,
    swiftCode: "NOSCCATT",
    cdicCode: "BNSA",
    riskProfile: "Low",
    complianceLevel: "Standard",
    verificationPhone: "1-800-4SCOTIA", // General line
    fraudReportingPhone: "1-800-472-6842 (Option for fraud)",
    specialNotes: "Significant international presence, particularly in Latin America ('The International Bank')."
  },
  "003": {
    institutionNumber: "003",
    name: "Royal Bank of Canada",
    commonName: "RBC Royal Bank",
    shortName: "RBC",
    type: "Bank",
    regulatoryBody: "OSFI",
    status: "Active",
    cdic: true,
    assets: "$2.0T+", // As of Q2 2024, includes HSBC Canada
    depositInsurance: "CDIC",
    headquarters: "Toronto, ON",
    website: "https://www.rbcroyalbank.com",
    customerService: "1-800-769-2511",
    primaryProvinces: ["All Provinces"],
    branches: 1200, // Approx Canada, post-HSBC integration
    founded: 1864,
    swiftCode: "ROYCCAT2",
    cdicCode: "RBCA",
    riskProfile: "Low",
    complianceLevel: "Standard",
    verificationPhone: "1-800-ROYAL-NOW (769-2566)", // General line
    fraudReportingPhone: "1-800-769-2511 (Option for fraud)",
    specialNotes: "Canada's largest bank by market capitalization. Acquired HSBC Bank Canada (effective March 2024)."
  },
  "004": {
    institutionNumber: "004",
    name: "The Toronto-Dominion Bank",
    commonName: "TD Canada Trust",
    shortName: "TD",
    type: "Bank",
    regulatoryBody: "OSFI",
    status: "Active",
    cdic: true,
    assets: "$1.9T+", // As of Q2 2024
    depositInsurance: "CDIC",
    headquarters: "Toronto, ON",
    website: "https://www.td.com",
    customerService: "1-866-222-3456",
    primaryProvinces: ["All Provinces"],
    branches: 1000, // Approx Canada
    founded: 1955, // Merger of Bank of Toronto and The Dominion Bank
    swiftCode: "TDOMCATTTOR",
    cdicCode: "TDBA",
    riskProfile: "Low",
    complianceLevel: "Standard",
    verificationPhone: "1-800-983-2265", // General Business Banking
    fraudReportingPhone: "1-866-222-3456 (Option for fraud)",
    specialNotes: "Large U.S. retail presence (TD Bank, N.A.). Known for customer service hours."
  },
  "006": {
    institutionNumber: "006",
    name: "National Bank of Canada",
    commonName: "National Bank",
    shortName: "NBC",
    type: "Bank",
    regulatoryBody: "OSFI",
    status: "Active",
    cdic: true,
    assets: "$400B+", // Approx
    depositInsurance: "CDIC",
    headquarters: "Montreal, QC",
    website: "https://www.nbc.ca",
    customerService: "1-888-483-5628",
    primaryProvinces: ["QC", "ON", "NB", "MB", "AB", "BC"], // Strongest in QC
    branches: 370, // Approx
    founded: 1859,
    swiftCode: "BNDCCAMMINT",
    cdicCode: "NABC",
    riskProfile: "Low",
    complianceLevel: "Standard",
    verificationPhone: "1-844-394-8043", // Business client line
    fraudReportingPhone: "1-888-483-5628 (Option for fraud)",
    specialNotes: "Sixth largest bank in Canada. Announced acquisition of Canadian Western Bank (pending approvals, expected 2025)."
  },
  "010": {
    institutionNumber: "010",
    name: "Canadian Imperial Bank of Commerce",
    commonName: "CIBC",
    shortName: "CIBC",
    type: "Bank",
    regulatoryBody: "OSFI",
    status: "Active",
    cdic: true,
    assets: "$950B+", // As of Q2 2024
    depositInsurance: "CDIC",
    headquarters: "Toronto, ON",
    website: "https://www.cibc.com",
    customerService: "1-800-465-2422",
    primaryProvinces: ["All Provinces"],
    branches: 1000, // Approx
    founded: 1961, // Merger of Canadian Bank of Commerce and Imperial Bank of Canada
    swiftCode: "CIBCCATT",
    cdicCode: "CIBC",
    riskProfile: "Low",
    complianceLevel: "Standard",
    verificationPhone: "1-800-465-2422", // General line
    fraudReportingPhone: "1-800-465-2422 (Option for fraud)",
    specialNotes: "Strong focus on technology and innovation."
  },
  "016": { // HSBC Bank Canada
    institutionNumber: "016",
    name: "HSBC Bank Canada",
    commonName: "HSBC Canada (Acquired by RBC)",
    shortName: "HSBC CA",
    type: "Bank",
    regulatoryBody: "OSFI",
    status: "Acquired", // Acquired by RBC, effective March 28, 2024
    cdic: true, // Was CDIC insured
    assets: "$120B+", // Prior to acquisition
    depositInsurance: "CDIC (Transferred to RBC)",
    headquarters: "Vancouver, BC",
    website: "https://www.hsbc.ca (redirects or provides info on RBC transition)",
    customerService: "Refer to RBC", // Service lines merged
    primaryProvinces: ["BC", "ON", "AB", "QC"], // Historically
    branches: 0, // Branches converted to RBC
    founded: 1981,
    swiftCode: "HKBCCATT", // Historical
    cdicCode: "HSBC", // Historical
    riskProfile: "Medium", // Reflects acquisition transition complexities
    complianceLevel: "Enhanced", // Due to international nature and AML focus
    specialNotes: "Operations fully merged into Royal Bank of Canada. Cheques drawn on HSBC Canada accounts are now processed by RBC. Increased scrutiny for older cheques may be warranted during transition."
  },
  "030": { // Canadian Western Bank
    institutionNumber: "030",
    name: "Canadian Western Bank",
    commonName: "CWB Financial Group",
    shortName: "CWB",
    type: "Bank",
    regulatoryBody: "OSFI",
    status: "Active", // Acquisition by National Bank pending (as of mid-2024)
    cdic: true,
    assets: "$40B+",
    depositInsurance: "CDIC",
    headquarters: "Edmonton, AB",
    website: "https://www.cwbank.com",
    customerService: "1-866-441-2921",
    primaryProvinces: ["BC", "AB", "SK", "MB", "ON"],
    branches: 40, // Approx
    founded: 1984,
    swiftCode: "CWCBCATT",
    cdicCode: "CWBA",
    riskProfile: "Medium",
    complianceLevel: "Standard",
    specialNotes: "Focused on business banking in Western Canada. Announced acquisition by National Bank (pending regulatory approvals, expected completion by end of 2025)."
  },
  "614": { // Tangerine Bank
    institutionNumber: "614",
    name: "Tangerine Bank",
    commonName: "Tangerine",
    shortName: "Tangerine",
    type: "Bank",
    regulatoryBody: "OSFI",
    status: "Active",
    cdic: true,
    assets: "$45B+",
    depositInsurance: "CDIC",
    headquarters: "Toronto, ON",
    website: "https://www.tangerine.ca",
    customerService: "1-888-826-4374",
    primaryProvinces: ["All Provinces"],
    branches: 0, // Digital-only
    founded: 1997, // As ING Direct Canada
    swiftCode: "INGCDSM1", // Might vary
    cdicCode: "TNGT",
    riskProfile: "Low",
    complianceLevel: "Standard",
    verificationPhone: "1-888-826-4374", // General line
    fraudReportingPhone: "1-888-826-4374",
    specialNotes: "Direct bank, subsidiary of Scotiabank. No physical branches."
  },
  "815": { // Desjardins Group (Caisse Centrale Desjardins) - Key entity, specific caisses have other numbers.
    institutionNumber: "815", // Represents Caisse Centrale, not individual caisses
    name: "La Caisse Centrale Desjardins du Québec",
    commonName: "Desjardins Group",
    shortName: "Desjardins",
    type: "Caisse Populaire", // Federation of credit unions
    regulatoryBody: "Provincial", // AMF in Quebec
    status: "Active",
    cdic: false, // Insured by Quebec's Deposit Insurance Corporation (AMF / l'Autorité des marchés financiers)
    assets: "$420B+", // Entire Desjardins Group
    depositInsurance: "AMF (Quebec)",
    headquarters: "Lévis, QC",
    website: "https://www.desjardins.com",
    customerService: "1-800-CAISSES (1-800-224-7737)",
    primaryProvinces: ["QC", "ON"],
    branches: 200, // Number of caisses in Quebec, many service points
    founded: 1900,
    swiftCode: "CCDQCAMM",
    cdicCode: "DESJ", // For some interbank purposes
    riskProfile: "Low",
    complianceLevel: "Enhanced", // Due to unique structure and provincial regulation
    specialNotes: "Largest cooperative financial group in Canada. Individual caisses have their own transit numbers, often starting with 815, 829 (Ontario), 865, 890, etc., for MICR purposes. Regulatory body in Quebec is AMF."
  },
  "837": { // Meridian Credit Union
    institutionNumber: "837", // Example, specific CU transits vary. 837 is one for Meridian.
    name: "Meridian Credit Union Limited",
    commonName: "Meridian",
    shortName: "Meridian CU",
    type: "Credit Union",
    regulatoryBody: "Provincial", // FSRA in Ontario
    status: "Active",
    cdic: false, // Insured by Financial Services Regulatory Authority of Ontario (FSRA), formerly DICO
    assets: "$30B+",
    depositInsurance: "FSRA (Ontario)",
    headquarters: "Toronto, ON", // Corporate office
    website: "https://www.meridiancu.ca",
    customerService: "1-866-592-2226",
    primaryProvinces: ["ON"],
    branches: 90, // Approx
    founded: 2005, // Formed by merger of HEPCOE and Niagara credit unions
    cdicCode: "MERI", // For some interbank purposes
    riskProfile: "Low",
    complianceLevel: "Standard",
    specialNotes: "Ontario's largest credit union. Deposit insurance provided by FSRA."
  },
  // Add more based on OSFI, CDIC, and Payments Canada lists as needed
  // This is a representative sample.
};

// --- Service Functions ---

export interface InstitutionValidationResult {
  isValid: boolean;
  institution: CanadianInstitution | null;
  message: string;
  riskLevel: 'low' | 'medium' | 'high'; // Simplified risk level for validation context
  complianceNotes: string[];
  bankingGuidance: string[];
}

/**
 * Validates a Canadian institution number and retrieves its details.
 * @param instNum The 3-digit institution number string.
 * @returns InstitutionValidationResult object.
 */
export function validateCanadianInstitution(instNum: string): InstitutionValidationResult {
  // Input validation
  if (!instNum || typeof instNum !== 'string' || instNum.length !== 3 || !/^\d{3}$/.test(instNum)) {
    return {
      isValid: false,
      institution: null,
      message: "Institution number must be exactly 3 digits.",
      riskLevel: 'high',
      complianceNotes: ["Invalid format - Canadian institution numbers are always 3 digits."],
      bankingGuidance: ["Verify MICR line quality for correct institution code.", "Check for scanning errors if code is malformed."]
    };
  }

  const institution = CANADIAN_BANKING_DATABASE[instNum];
  if (!institution) {
    return {
      isValid: false,
      institution: null,
      message: `Institution number ${instNum} is not found in this database. It may be a smaller FI, a new FI, or an error.`,
      riskLevel: 'high',
      complianceNotes: [
        "Unrecognized institution code.",
        "Not found in local Payments Canada FI subset.",
        "May be a foreign institution, a non-deposit-taking FI, or invalid."
      ],
      bankingGuidance: [
        "Cross-reference with official Payments Canada Financial Institutions File (FIF) if available.",
        "Consider placing hold pending verification, especially for high-value items.",
        "Document all verification attempts meticulously."
      ]
    };
  }

  // Status-based validation
  const complianceNotes: string[] = [];
  const bankingGuidance: string[] = [];
  let currentRiskLevel: 'low' | 'medium' | 'high' = institution.riskProfile.toLowerCase() as 'low' | 'medium' | 'high'; // Start with profile risk

  if (institution.status === 'Closed') {
    currentRiskLevel = 'high';
    complianceNotes.push("Institution is permanently closed and no longer accepts deposits or processes items.");
    bankingGuidance.push("Reject item immediately. Do not process.", "Contact remitter for alternative payment.", "Check for any official wind-down instructions if applicable.");
    return { isValid: false, institution, message: `Institution ${institution.commonName} (${instNum}) is CLOSED.`, riskLevel: currentRiskLevel, complianceNotes, bankingGuidance };
  }

  if (institution.status === 'Acquired' || institution.status === 'Merged') {
    currentRiskLevel = currentRiskLevel === 'low' ? 'medium' : currentRiskLevel; // Elevate risk if was low
    complianceNotes.push(`Institution status: ${institution.status}. Operations may be integrated with an acquiring entity.`);
    complianceNotes.push("Account ownership and cheque processing rules may have changed. Verify current details.");
    bankingGuidance.push(
      "Verify processing instructions with the acquiring institution if known.",
      "Older cheques from this institution may require careful scrutiny during transition periods.",
      "Document the acquisition/merger status."
    );
     // Add a specific message based on common acquisitions
    if (instNum === "016") { // HSBC
        bankingGuidance.push("HSBC Canada was acquired by RBC. Items are now processed through RBC systems.");
    } else if (instNum === "030" && institution.specialNotes?.includes("National Bank")) { // CWB to NBC
        bankingGuidance.push("Canadian Western Bank acquisition by National Bank is pending/in progress. Monitor for updates on processing.");
    }

  }

  // Deposit insurance assessment
  if (!institution.cdic) {
    currentRiskLevel = currentRiskLevel === 'low' ? 'medium' : currentRiskLevel;
    complianceNotes.push(`Not CDIC insured. Covered by: ${institution.depositInsurance}.`);
    bankingGuidance.push(`Understand the coverage limits and rules of ${institution.depositInsurance}.`);
    if (institution.type === 'Credit Union' || institution.type === 'Caisse Populaire') {
      bankingGuidance.push("Apply specific verification procedures for credit unions/caisses populaires if different.");
    }
  } else {
    complianceNotes.push("CDIC insured institution.");
  }

  // Regulatory oversight
  complianceNotes.push(`Regulated by: ${institution.regulatoryBody}.`);
  if (institution.regulatoryBody === 'Provincial') {
    bankingGuidance.push(`Adhere to specific ${institution.headquarters.split(', ')[1]} provincial regulatory requirements if applicable.`);
  }

  // Institution size/stability (example logic)
  if (institution.branches < 10 && institution.branches > 0) {
    complianceNotes.push("Small institution with limited branch network.");
    bankingGuidance.push("May warrant additional verification for large or unusual transactions.");
  } else if (institution.branches === 0) {
    complianceNotes.push("Digital-only institution with no physical branches.");
    bankingGuidance.push("Utilize digital verification channels and be aware of potentially different fraud patterns.");
  }

  // Enhanced compliance requirements
  if (institution.complianceLevel === 'Enhanced' || institution.complianceLevel === 'Special') {
    currentRiskLevel = currentRiskLevel === 'low' ? 'medium' : currentRiskLevel;
    complianceNotes.push(`Requires ${institution.complianceLevel} compliance monitoring and due diligence.`);
    bankingGuidance.push(`Apply enhanced due diligence (EDD) procedures as per internal policy for ${institution.complianceLevel} institutions.`);
  }

  if (institution.specialNotes) {
    complianceNotes.push(`Special Note: ${institution.specialNotes}`);
  }


  return {
    isValid: institution.status === 'Active' || institution.status === 'Acquired' || institution.status === 'Merged', // Active or transition is considered "valid" for processing with notes
    institution,
    message: `Institution: ${institution.commonName} (${instNum}). Status: ${institution.status}.`,
    riskLevel: currentRiskLevel,
    complianceNotes,
    bankingGuidance
  };
}

/**
 * Searches institutions based on a query string (name, number, etc.).
 * @param query The search term.
 * @returns An array of matching CanadianInstitution objects, limited to 20 results.
 */
export function searchInstitutions(query: string): CanadianInstitution[] {
  const searchTerm = query.toLowerCase().trim();
  if (!searchTerm || searchTerm.length < 2) return []; // Minimum 2 chars to search

  return Object.values(CANADIAN_BANKING_DATABASE).filter(inst =>
    inst.name.toLowerCase().includes(searchTerm) ||
    inst.commonName.toLowerCase().includes(searchTerm) ||
    inst.shortName.toLowerCase().includes(searchTerm) ||
    inst.institutionNumber.includes(searchTerm) || // Exact match for number usually
    inst.headquarters.toLowerCase().includes(searchTerm) ||
    (inst.swiftCode && inst.swiftCode.toLowerCase().includes(searchTerm)) ||
    inst.type.toLowerCase().replace(' ', '').includes(searchTerm.replace(' ', ''))
  ).slice(0, 20); // Limit results for performance
}

/**
 * Gets institutions primarily operating in a specific province.
 * @param province Two-letter province code (e.g., "ON", "QC").
 * @returns An array of CanadianInstitution objects.
 */
export function getInstitutionsByProvince(province: string): CanadianInstitution[] {
  const provinceUpper = province.toUpperCase();
  return Object.values(CANADIAN_BANKING_DATABASE).filter(inst =>
    inst.primaryProvinces.includes("All Provinces") || 
    inst.primaryProvinces.some(p => p.toUpperCase() === provinceUpper)
  );
}

/**
 * Gets institutions by their type.
 * @param type The type of institution (e.g., 'Bank', 'Credit Union').
 * @returns An array of CanadianInstitution objects.
 */
export function getInstitutionsByType(type: 'Bank' | 'Credit Union' | 'Trust Company' | 'Caisse Populaire'): CanadianInstitution[] {
  return Object.values(CANADIAN_BANKING_DATABASE).filter(inst => 
    inst.type === type
  );
}

export interface InstitutionRiskAssessment {
  riskScore: number; // 0-100 scale
  riskFactors: string[];
  recommendations: string[];
  complianceRequirements: string[];
}

/**
 * Assesses the risk associated with a specific financial institution.
 * @param institution The CanadianInstitution object.
 * @returns An InstitutionRiskAssessment object.
 */
export function assessInstitutionRisk(institution: CanadianInstitution): InstitutionRiskAssessment {
  let riskScore = 0;
  const riskFactors: string[] = [];
  const recommendations: string[] = [];
  
  // Derive initial compliance requirements from the validation function for consistency
  const validationResult = validateCanadianInstitution(institution.institutionNumber);
  const complianceRequirements: string[] = [...validationResult.complianceNotes]; // Initialize with notes from validation

  // Base institutional risk profile
  switch (institution.riskProfile) {
    case 'High': riskScore += 40; riskFactors.push("Institution classified with a high inherent risk profile."); break;
    case 'Medium': riskScore += 20; riskFactors.push("Institution classified with a medium inherent risk profile."); break;
    case 'Low': riskScore += 5; break; // Small base for any FI
  }

  // Deposit insurance status
  if (!institution.cdic) {
    riskScore += 15;
    riskFactors.push(`Not CDIC insured; covered by ${institution.depositInsurance}.`);
    recommendations.push(`Verify specifics of ${institution.depositInsurance} coverage and limits.`);
  }

  // Regulatory Body
  if (institution.regulatoryBody === 'Provincial') {
    riskScore += 5;
    riskFactors.push("Provincially regulated entity; ensure compliance with relevant provincial statutes.");
  }

  // Institution Status
  if (institution.status === 'Acquired' || institution.status === 'Merged') {
    riskScore += 15;
    riskFactors.push(`Institution status: ${institution.status}. Potential transition risks.`);
    recommendations.push("Confirm current processing channels and account validity with the acquiring/merged entity.");
  } else if (institution.status === 'Closed') {
    riskScore = 100; // Maximum risk
    riskFactors.push("Institution is CLOSED. Items should not be processed.");
    recommendations.push("Reject item. Contact customer for alternative payment method.");
  }

  // Operational Size (Branches)
  if (institution.branches === 0) { // Digital-only
    riskScore += 10;
    riskFactors.push("Digital-only bank; no physical branch network for recourse.");
    recommendations.push("Ensure robust digital verification methods are employed if dealing directly.");
  } else if (institution.branches < 20) { // Relatively small network
    riskScore += 5;
    riskFactors.push("Limited physical branch network.");
  }

  // Compliance Level
  if (institution.complianceLevel === 'Enhanced') {
    riskScore += 10;
    riskFactors.push("Institution requires enhanced compliance monitoring.");
    recommendations.push("Apply enhanced due diligence (EDD) procedures.");
  } else if (institution.complianceLevel === 'Special') {
    riskScore += 20;
    riskFactors.push("Institution under special compliance measures or scrutiny.");
    recommendations.push("Apply highest level of due diligence and consult internal compliance/risk teams.");
  }
  
  // Cap score at 100
  riskScore = Math.min(Math.max(riskScore, 0), 100);

  if (riskScore === 0 && riskFactors.length === 0) riskFactors.push("Standard low-risk profile for an active, CDIC-insured major bank.");

  return {
    riskScore,
    riskFactors,
    recommendations,
    complianceRequirements,
  };
}

// --- Integration Helper ---
export interface EnhancedMicrContext {
  originalMicr?: any; // The input MICR data object
  institutionValidation: InstitutionValidationResult;
  enhancedData: any; // Original MICR data potentially augmented
  bankingContext: { // Key details for quick reference
    bankName?: string;
    bankType?: CanadianInstitution['type'];
    customerService?: string;
    verificationPhone?: string;
    fraudReporting?: string;
    regulatoryBody?: CanadianInstitution['regulatoryBody'];
    depositInsurance?: string;
    riskProfile?: CanadianInstitution['riskProfile'];
    specialNotes?: string;
  } | null;
}

/**
 * Enhances existing MICR data with detailed institutional intelligence.
 * @param micrData An object containing at least an institutionNumber or a transitNumber.
 * @returns An object with original data, validation, enhanced data, and banking context.
 */
export function enhanceMicrWithBankingData(micrData: Record<string, any>): EnhancedMicrContext {
  let institutionNumber: string | undefined = micrData.institutionNumber;

  if (!institutionNumber && micrData.transitNumber && typeof micrData.transitNumber === 'string' && micrData.transitNumber.length >= 8) {
    // Extract FFF from DDDDDFFFC (5-digit Branch + 3-digit Institution + 1-digit Check Digit)
    institutionNumber = micrData.transitNumber.substring(5, 8);
  }

  const institutionValidation = validateCanadianInstitution(institutionNumber || "INVALID"); // Pass "INVALID" to get error if no number
  const institution = institutionValidation.institution;

  const enhancedData = {
    ...micrData,
    institutionDetailsFull: institution, // Add the full CanadianInstitution object
    calculatedInstitutionRisk: institution ? assessInstitutionRisk(institution) : null,
    derivedComplianceGuidance: institutionValidation.complianceNotes,
    derivedBankingGuidance: institutionValidation.bankingGuidance,
    isInstitutionValidForProcessing: institutionValidation.isValid,
  };

  const bankingContext = institution ? {
    bankName: institution.commonName,
    bankType: institution.type,
    customerService: institution.customerService,
    verificationPhone: institution.verificationPhone,
    fraudReporting: institution.fraudReportingPhone,
    regulatoryBody: institution.regulatoryBody,
    depositInsurance: institution.depositInsurance,
    riskProfile: institution.riskProfile,
    specialNotes: institution.specialNotes,
  } : null;

  return {
    originalMicr: micrData,
    institutionValidation,
    enhancedData,
    bankingContext,
  };
}

// Ensure all necessary exports
// Functions are already exported individually. Types are exported with their definition.
