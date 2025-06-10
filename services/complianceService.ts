
import { ComplianceLogEntry, OSFIIncidentRecord, AppPerformanceMetric } from '../types'; // Assuming these types are in types.ts

// --- Service-Specific Types & Interfaces ---

export interface TransactionLogData {
  transactionId: string;
  chequeDetailsId: string; // Link to the specific cheque processed
  userId: string; // User performing the transaction
  ipAddress: string;
  timestamp: string; // ISO 8601
  action: 'cheque_submission' | 'verification_request' | 'risk_assessment_complete' | 'manual_review_escalation';
  outcome: 'success' | 'failure' | 'pending';
  riskScoreAtAction?: number | null;
  processingTimeMs?: number;
  consentGivenForProcessing?: boolean; // For PIPEDA
  pipedaConsentType?: string; // e.g., 'cheque_processing_v1.0'
  relatedComplianceLogEntryId?: string; // If this action creates a more detailed log
}

export type ReportType = 'DailySummary' | 'WeeklyTrends' | 'MonthlyCompliance' | 'OSFIIncident';

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface ComplianceReport {
  reportId: string;
  reportType: ReportType;
  generatedOn: string; // ISO 8601
  periodCovered: DateRange;
  executiveSummary?: string;
  data: Record<string, any>; // Flexible data structure based on report type
  // e.g., for Daily: { transactionVolume: 100, avgProcessingTime: 500, highRiskFlags: 5 }
  // e.g., for OSFIIncident: OSFIIncidentRecord
}

export interface SuspiciousActivity {
  activityId: string;
  description: string;
  detectedOn: string; // ISO 8601
  involvedEntities: string[]; // e.g., User IDs, IP Addresses, Cheque IDs
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  recommendedAction?: string;
}

export interface EncryptedAuditExport {
  exportId: string;
  encryptedData: string; // Base64 encoded encrypted string (simulated)
  encryptionAlgorithm: string; // e.g., "AES-256-GCM"
  exportTimestamp: string; // ISO 8601
  dataHash?: string; // SHA-256 hash of the original data before encryption (for integrity check)
}

export interface RetentionComplianceStatus {
  lastChecked: string; // ISO 8601
  isCompliant: boolean;
  details: string; // e.g., "All logs within 7-year retention policy." or "X logs overdue for archival/deletion."
}


// --- Suggested Constants (Ideally in constants.ts) ---
const OSFI_CRITICAL_RISK_SCORE_THRESHOLD = 70;
const AUDIT_LOG_STANDARD_RETENTION_DAYS = 7 * 365; // 7 years
const SUSPICIOUS_ACTIVITY_THRESHOLDS = {
  HIGH_RISK_TX_COUNT: 5,
  HIGH_RISK_TX_WINDOW_HOURS: 24,
};
const MOCK_CLIENT_ENCRYPTION_KEY_NAME = 'mock-audit-export-key-for-demo'; // For conceptual demonstration


// --- Mock Data Store (Simulates backend logging) ---
// In a real app, this would be API calls to a secure backend.
let mockAuditLogStore: ComplianceLogEntry[] = [];
let mockTransactionStore: TransactionLogData[] = [];


// --- Service Functions ---

/**
 * 1. Logs a transaction with relevant compliance data.
 * In a real system, this would securely send data to a backend logging service.
 */
export const logTransaction = (data: TransactionLogData): ComplianceLogEntry => {
  console.log("ComplianceService: Logging transaction", data);
  mockTransactionStore.push(data);

  // Create a more detailed audit log entry for this transaction
  const auditEntry: ComplianceLogEntry = {
    timestamp: data.timestamp,
    userOrSystemIdentifier: data.userId || 'System',
    actionPerformed: `Transaction: ${data.action} - ${data.outcome}`,
    targetEntityId: data.transactionId,
    associatedRiskLevel: data.riskScoreAtAction !== undefined && data.riskScoreAtAction !== null ? 
        (data.riskScoreAtAction >= OSFI_CRITICAL_RISK_SCORE_THRESHOLD ? 'Critical' : 
         data.riskScoreAtAction >= 50 ? 'High' : 
         data.riskScoreAtAction >= 25 ? 'Medium' : 'Low') 
        : null,
    details: {
      ipAddress: data.ipAddress,
      processingTimeMs: data.processingTimeMs,
      chequeId: data.chequeDetailsId,
      pipedaConsent: data.consentGivenForProcessing,
      consentType: data.pipedaConsentType,
    },
  };
  mockAuditLogStore.push(auditEntry);
  console.log("ComplianceService: Created Audit Log Entry", auditEntry);
  // In a real app, this auditEntry would be sent to a secure, tamper-evident backend log.
  return auditEntry;
};

/**
 * 2. Checks if an OSFI report is required based on a log entry's risk level.
 * Triggers a notification or simulated escalation if needed.
 */
export const checkOSFIReporting = (logEntry: ComplianceLogEntry): void => {
  if (logEntry.associatedRiskLevel === 'Critical' || 
      (logEntry.details?.riskScore && typeof logEntry.details.riskScore === 'number' && logEntry.details.riskScore >= OSFI_CRITICAL_RISK_SCORE_THRESHOLD)) {
    console.warn(`OSFI REPORT REQUIRED: Critical risk detected for action "${logEntry.actionPerformed}" (ID: ${logEntry.targetEntityId}). Initiating incident reporting protocol.`);
    // In a real app:
    // - Create an OSFIIncidentRecord.
    // - Send a notification to compliance officers.
    // - Potentially integrate with an automated incident management system.
    // - Ensure report is filed within 24 hours.
    alert(`SIMULATED OSFI ALERT: Critical risk detected for action: ${logEntry.actionPerformed}. An OSFI report would be required within 24 hours.`);
  }
};

/**
 * 3. Generates a compliance report.
 * This is a simplified version; real reports would query a backend data warehouse.
 */
export const generateComplianceReport = (type: ReportType, period: DateRange): ComplianceReport => {
  console.log(`ComplianceService: Generating ${type} report for period ${period.startDate.toISOString()} to ${period.endDate.toISOString()}`);
  let reportData: Record<string, any> = {};
  let summary = `Report for ${period.startDate.toLocaleDateString()} - ${period.endDate.toLocaleDateString()}.`;

  const relevantLogs = mockAuditLogStore.filter(log => {
    const logDate = new Date(log.timestamp);
    return logDate >= period.startDate && logDate <= period.endDate;
  });

  switch (type) {
    case 'DailySummary':
      const dailyTransactions = mockTransactionStore.filter(tx => {
        const txDate = new Date(tx.timestamp);
        return txDate >= period.startDate && txDate <= period.endDate;
      });
      reportData = {
        transactionVolume: dailyTransactions.length,
        successfulTransactions: dailyTransactions.filter(tx => tx.outcome === 'success').length,
        failedTransactions: dailyTransactions.filter(tx => tx.outcome === 'failure').length,
        avgProcessingTimeMs: dailyTransactions.length > 0 ? 
          dailyTransactions.reduce((sum, tx) => sum + (tx.processingTimeMs || 0), 0) / dailyTransactions.length 
          : 0,
        criticalRiskEvents: relevantLogs.filter(log => log.associatedRiskLevel === 'Critical').length,
      };
      summary = `Daily summary: ${dailyTransactions.length} transactions processed.`;
      break;
    case 'WeeklyTrends':
      // Simplified: Count occurrences of risk levels
      reportData = {
        lowRiskCount: relevantLogs.filter(log => log.associatedRiskLevel === 'Low').length,
        mediumRiskCount: relevantLogs.filter(log => log.associatedRiskLevel === 'Medium').length,
        highRiskCount: relevantLogs.filter(log => log.associatedRiskLevel === 'High').length,
        criticalRiskCount: relevantLogs.filter(log => log.associatedRiskLevel === 'Critical').length,
        // Trend analysis would require more historical data and complex logic
        trendIndicators: ["Trend analysis placeholder: Data shows consistent processing times."]
      };
      summary = `Weekly trend report: ${relevantLogs.length} relevant audit events.`;
      break;
    case 'MonthlyCompliance':
      reportData = {
        totalAuditedActions: relevantLogs.length,
        osfiComplianceChecks: "All critical incidents (if any) logged for review.",
        pipedaConsentChecks: "Consent logging mechanisms in place (simulated).",
        dataRetentionStatus: validateDataRetention().details, // Simulate check
      };
      summary = `Monthly compliance overview: ${relevantLogs.length} actions audited.`;
      break;
    case 'OSFIIncident':
      // This would typically be generated per incident, not for a date range covering multiple.
      // For this example, let's find the first critical incident in the period.
      const criticalIncident = relevantLogs.find(log => log.associatedRiskLevel === 'Critical');
      if (criticalIncident) {
        const incidentRecord: Partial<OSFIIncidentRecord> = { // Using Partial as we are simulating
          recordId: `INC-${Date.now()}`,
          incidentOccurrenceTimestamp: criticalIncident.timestamp,
          eventType: "Critical Risk Detected: " + criticalIncident.actionPerformed,
          eventCriticality: 'High', // Should be 'Critical' from OSFI context
          eventDescription: `Details: ${JSON.stringify(criticalIncident.details)}`,
          involvedSystems: ["ChequeVerifierApp-Client"],
          assessedImpact: "Requires further investigation.",
          actionsTakenAndPlanned: ["Logged for review", "Compliance team notified (simulated)"],
          reportingFinancialInstitutionCode: "APP-CLIENT-SIMULATED"
        };
        reportData = incidentRecord as OSFIIncidentRecord; // Cast as we are simulating
        summary = `OSFI Incident Report for event on ${criticalIncident.timestamp}.`;
      } else {
        reportData = { message: "No critical incidents found in the specified period for OSFI reporting." };
        summary = `No critical OSFI incidents to report for this period.`;
      }
      break;
    default:
      throw new Error(`Unsupported report type: ${type}`);
  }

  return {
    reportId: `REP-${type.toUpperCase()}-${Date.now()}`,
    reportType: type,
    generatedOn: new Date().toISOString(),
    periodCovered: period,
    executiveSummary: summary,
    data: reportData,
  };
};

/**
 * 4. Detects suspicious patterns from a series of logs.
 * This is a simplified example. Real-world detection is more complex.
 */
export const detectSuspiciousPatterns = (logs: ComplianceLogEntry[]): SuspiciousActivity[] => {
  const suspiciousActivities: SuspiciousActivity[] = [];
  if (!logs || logs.length < SUSPICIOUS_ACTIVITY_THRESHOLDS.HIGH_RISK_TX_COUNT) {
    return suspiciousActivities;
  }

  // Example: 5+ high-risk transactions from the same user in 24 hours
  const userRiskCounts: Record<string, { count: number, firstTimestamp: Date, lastTimestamp: Date }> = {};

  logs.forEach(log => {
    if (log.associatedRiskLevel === 'High' || log.associatedRiskLevel === 'Critical') {
      const userId = log.userOrSystemIdentifier;
      const logTimestamp = new Date(log.timestamp);

      if (!userRiskCounts[userId]) {
        userRiskCounts[userId] = { count: 0, firstTimestamp: logTimestamp, lastTimestamp: logTimestamp };
      }
      userRiskCounts[userId].count++;
      userRiskCounts[userId].lastTimestamp = logTimestamp;

      // Check if within 24-hour window
      const timeDiffHours = (userRiskCounts[userId].lastTimestamp.getTime() - userRiskCounts[userId].firstTimestamp.getTime()) / (1000 * 60 * 60);
      
      if (userRiskCounts[userId].count >= SUSPICIOUS_ACTIVITY_THRESHOLDS.HIGH_RISK_TX_COUNT && timeDiffHours <= SUSPICIOUS_ACTIVITY_THRESHOLDS.HIGH_RISK_TX_WINDOW_HOURS) {
        suspiciousActivities.push({
          activityId: `SUSP-USER-${userId}-${Date.now()}`,
          description: `User ${userId} had ${userRiskCounts[userId].count} high/critical risk transactions within ${SUSPICIOUS_ACTIVITY_THRESHOLDS.HIGH_RISK_TX_WINDOW_HOURS} hours.`,
          detectedOn: new Date().toISOString(),
          involvedEntities: [userId],
          severity: 'Medium', // Escalate to Medium, could be High based on actual risk scores
          recommendedAction: "Review user activity and associated transactions.",
        });
        // Reset count for this user to avoid repeated alerts for the same batch, or use more complex state management
        userRiskCounts[userId].count = 0; 
      } else if (timeDiffHours > SUSPICIOUS_ACTIVITY_THRESHOLDS.HIGH_RISK_TX_WINDOW_HOURS) {
        // Reset if window passed
        userRiskCounts[userId] = { count: 1, firstTimestamp: logTimestamp, lastTimestamp: logTimestamp };
      }
    }
  });

  // Add more pattern detection logic (e.g., systematic MICR failures, security feature failures)
  // This would require analyzing `log.details` or specific event types.

  if (suspiciousActivities.length > 0) {
      console.warn("ComplianceService: Detected suspicious patterns.", suspiciousActivities);
  }
  return suspiciousActivities;
};

/**
 * 5. Exports audit logs for a given period (Simulated with mock encryption).
 * In a real app, this would involve fetching from secure storage and using strong, server-side encryption.
 */
export const exportAuditLogs = async (startDate: Date, endDate: Date): Promise<EncryptedAuditExport> => {
  const logsToExport = mockAuditLogStore.filter(log => {
    const logDate = new Date(log.timestamp);
    return logDate >= startDate && logDate <= endDate;
  });

  const dataString = JSON.stringify(logsToExport);

  // --- SIMULATED CLIENT-SIDE ENCRYPTION (FOR DEMONSTRATION ONLY) ---
  // DO NOT USE THIS FOR PRODUCTION. Real encryption must be server-side with proper key management.
  let encryptedData = "Error: Client-side encryption simulation failed.";
  let dataHash = "Error: Hash calculation failed.";
  try {
    // Mock encryption: simple Base64 encoding
    encryptedData = btoa(unescape(encodeURIComponent(dataString))); 
    
    // Mock Hashing (SHA-256 if available, otherwise simple checksum)
    if (typeof crypto !== 'undefined' && crypto.subtle) {
        const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(dataString));
        dataHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    } else {
        let checksum = 0;
        for (let i = 0; i < dataString.length; i++) { checksum = (checksum + dataString.charCodeAt(i)) % 1000000; }
        dataHash = `mock_checksum_${checksum}`;
    }
    console.log(`ComplianceService: Simulated audit log export. Original size: ${dataString.length} bytes, "Encrypted" size: ${encryptedData.length} bytes. Hash: ${dataHash}`);
  } catch (e) {
    console.error("Error during simulated encryption/hashing:", e);
  }
  // --- END OF SIMULATED ENCRYPTION ---

  return {
    exportId: `EXPORT-${Date.now()}`,
    encryptedData: encryptedData, // This would be truly encrypted data from backend
    encryptionAlgorithm: "SIMULATED_AES-256-GCM_with_Base64",
    exportTimestamp: new Date().toISOString(),
    dataHash: dataHash,
  };
};

/**
 * 6. Schedules automatic reporting (Conceptual).
 * Frontend cannot reliably schedule background tasks. This would be a backend cron job.
 */
export const scheduleAutomaticReporting = (): void => {
  console.info("ComplianceService: Automatic reporting scheduling would be configured on the backend (e.g., cron jobs) to call generateComplianceReport and distribute it.");
  // Example:
  // BackendScheduler.addJob('DailySummaryReport', '0 1 * * *', () => generateAndDistributeReport('DailySummary'));
  // BackendScheduler.addJob('WeeklyTrendsReport', '0 2 * * 1', () => generateAndDistributeReport('WeeklyTrends'));
};

/**
 * 7. Validates data retention policies (Simulated).
 * In a real system, this involves checking database records against retention rules.
 */
export const validateDataRetention = (): RetentionComplianceStatus => {
  const now = new Date();
  let nonCompliantCount = 0;
  mockAuditLogStore.forEach(log => {
    const logAgeDays = (now.getTime() - new Date(log.timestamp).getTime()) / (1000 * 60 * 60 * 24);
    if (logAgeDays > AUDIT_LOG_STANDARD_RETENTION_DAYS) {
      nonCompliantCount++;
    }
  });

  const isCompliant = nonCompliantCount === 0;
  return {
    lastChecked: now.toISOString(),
    isCompliant,
    details: isCompliant ? 
      `All ${mockAuditLogStore.length} (simulated) logs are within the ${AUDIT_LOG_STANDARD_RETENTION_DAYS}-day retention policy.` :
      `${nonCompliantCount} (simulated) logs found exceeding the ${AUDIT_LOG_STANDARD_RETENTION_DAYS}-day retention policy. Requires archival or deletion.`,
  };
};

/**
 * 8. Anonymizes personal data from a given data object (Simulated).
 * This is a placeholder. Real anonymization is complex and context-dependent.
 * For PIPEDA compliance for data analysis or if data needs to be shown in non-production.
 */
export const anonymizePersonalData = <T extends Record<string, any>>(data: T): Partial<T> => {
  const anonymizedData: Partial<T> = { ...data };
  
  const fieldsToAnonymize: (keyof T)[] = [
    'userOrSystemIdentifier', 'userId', 'ipAddress', 'payeeName', 'accountNumber', 
    // Add other PII fields from your types like ChequeData, TransactionLogData etc.
  ] as (keyof T)[];

  const fieldsToHashInstead: (keyof T)[] = ['targetEntityId', 'transactionId', 'chequeDetailsId'] as (keyof T)[];


  for (const key in anonymizedData) {
    if (fieldsToAnonymize.includes(key)) {
      if (typeof anonymizedData[key] === 'string') {
        // @ts-ignore
        anonymizedData[key] = `ANON_${String(anonymizedData[key]).substring(0,3)}***`;
      } else if (typeof anonymizedData[key] === 'number') {
        // @ts-ignore
        anonymizedData[key] = 12345; // Replace numbers
      }
    } else if (fieldsToHashInstead.includes(key)) {
         if (typeof anonymizedData[key] === 'string') {
            // @ts-ignore
            anonymizedData[key] = `HASHED***${String(anonymizedData[key]).slice(-4)}`;
         }
    }
  }

  // For nested objects or arrays, recursive anonymization would be needed.
  // Example: if data.details contains PII.
  if (anonymizedData.details && typeof anonymizedData.details === 'object') {
    // @ts-ignore
    anonymizedData.details = anonymizePersonalData(anonymizedData.details as Record<string,any>);
  }
  
  console.log("ComplianceService: Anonymizing data (simulated). Original fields might include:", Object.keys(data).join(', '));
  return anonymizedData;
};

// --- Performance Metric Logging (Example) ---
/**
 * Logs an application performance metric.
 * In a real system, this would send data to a performance monitoring backend.
 */
export const logPerformanceMetric = (metric: AppPerformanceMetric): void => {
    console.log(`ComplianceService (PerfMetric): ${metric.metricKey}=${metric.metricValue} ${metric.metricUnit || ''}`, metric.tags || {});
    // In a real app, send to Prometheus, Datadog, OpenTelemetry collector, etc.
};
