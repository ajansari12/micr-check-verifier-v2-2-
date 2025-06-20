import React, { useState, useCallback, useMemo } from 'react';
import { ChequeVerificationResult, CanadianChequeImageQuality, MicrValidationFields, SecurityAssessment, CanadianInstitution, DecisionIntelligence, ContactInfo } from '../types';
import LoadingSpinner from './LoadingSpinner'; 
import { MICR_SYMBOLS_MAP, CPA_CHEQUE_DIMENSIONS, CPA_IMAGE_RESOLUTION_DPI } from '../constants';
import { getBranchLocation } from '../services/micrValidationService';
import InstitutionSearchWidget from './InstitutionSearchWidget'; 
import { CANADIAN_BANKING_DATABASE } from '../services/canadianBankingDatabase'; 
// MicrLineVisualizer is typically imported here if used within this component
// import MicrLineVisualizer from './MicrLineVisualizer';


interface CanadianBankingDashboardProps {
  result: ChequeVerificationResult | null;
  isLoading: boolean;
  error: string | null; 
  onReanalyze?: () => void;
  onExportReport?: () => void;
  onPrint?: () => void;
  onCopyNotify?: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  onShowSecurityFeatureOverlay?: (annotations: any[]) => void; 
}

interface DashboardCardProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  icon?: React.ReactNode | string; 
  titleAction?: React.ReactNode;
}

const DashboardCard: React.FC<DashboardCardProps> = ({ title, children, className = '', icon, titleAction }) => (
  <section className={`bg-white shadow-md rounded-lg border border-slate-200 ${className}`}>
    <header className="bg-slate-50 px-4 py-3 border-b border-slate-200 rounded-t-lg flex justify-between items-center">
      <h3 className="text-lg font-semibold text-blue-800 flex items-center">
        {icon && <span className="mr-2 text-blue-700">{typeof icon === 'string' ? icon : icon}</span>}
        {title}
      </h3>
      {titleAction && <div className="ml-auto">{titleAction}</div>}
    </header>
    <div className="p-4 space-y-3 text-sm">
      {children}
    </div>
  </section>
);

interface StatusIndicatorProps {
  status: boolean | null | undefined;
  trueText?: string;
  falseText?: string;
  nullText?: string;
  showText?: boolean;
}

const StatusIndicator: React.FC<StatusIndicatorProps> = React.memo(({ status, trueText = "Pass/Valid", falseText = "Fail/Invalid", nullText = "N/A", showText = false }) => {
  let icon: React.ReactNode;
  let colorClass = '';
  let textToShow = '';

  if (status === true) {
    icon = <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" /></svg>;
    colorClass = 'text-green-600';
    textToShow = trueText;
  } else if (status === false) {
    icon = <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" /></svg>;
    colorClass = 'text-red-600';
    textToShow = falseText;
  } else {
    icon = <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM8.94 6.94a.75.75 0 11-1.061-1.061 3 3 0 112.871 5.026v.345a.75.75 0 01-1.5 0v-.5c0-.72.57-1.172 1.081-1.287A1.5 1.5 0 108.94 6.94zM10 15a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>;
    colorClass = 'text-slate-500';
    textToShow = nullText;
  }
  return <span className={`inline-flex items-center ${colorClass}`} title={textToShow}>{icon}{showText && <span className="ml-1.5 text-xs">{textToShow}</span>}</span>;
});


const ProgressBar: React.FC<{ score: number | null, maxScore?: number, label?: string }> = ({ score, maxScore = 100, label }) => {
    if (score === null || score === undefined) return label ? <p className="text-slate-500 text-xs">{label}: N/A</p> : <span className="text-slate-500 italic text-xs">N/A</span>;
    const percentage = (score / maxScore) * 100;
    let bgColor = 'bg-green-500';
    if (percentage < 40) bgColor = 'bg-red-500';
    else if (percentage < 70) bgColor = 'bg-yellow-500';

    return (
        <div className="w-full">
            {label && <p className="text-xs text-slate-600 mb-0.5">{label}: <span className="font-semibold">{score}/{maxScore}</span></p>}
            <div className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden">
                <div className={`h-full rounded-full ${bgColor} transition-all duration-500`} style={{ width: `${Math.max(0, Math.min(percentage, 100))}%` }}></div>
            </div>
        </div>
    );
};

type DashboardTabKey = 'decision' | 'micr' | 'security' | 'imageQuality' | 'institutions';

const CanadianBankingDashboard: React.FC<CanadianBankingDashboardProps> = ({
  result,
  isLoading,
  error,
  onReanalyze,
  onExportReport,
  onPrint,
  onCopyNotify,
  onShowSecurityFeatureOverlay,
}) => {
  const [activeTab, setActiveTab] = useState<DashboardTabKey>('decision'); // Default to new Decision tab

  const handleCopyToClipboard = useCallback((text: string | null | undefined, fieldName: string) => {
    if (!text) {
        onCopyNotify?.(`${fieldName} is not available to copy.`, 'warning');
        return;
    }
    navigator.clipboard.writeText(text)
      .then(() => onCopyNotify?.(`${fieldName} copied to clipboard!`, 'success'))
      .catch(() => onCopyNotify?.(`Failed to copy ${fieldName}.`, 'error'));
  }, [onCopyNotify]);
  
  const { decisionIntelligence } = result || {};

  const dashboardHeaderStatus = useMemo(() => {
    if (!result) return { text: 'Pending Analysis', color: 'bg-slate-400 text-white', riskLevelDisplay: "Risk: Unknown" };
    if (decisionIntelligence) {
      const { riskLevel, confidence } = decisionIntelligence.overallRiskAssessment;
      let color = 'bg-slate-500 text-white';
      let text = riskLevel.toUpperCase();
      switch(riskLevel) {
        case 'Accept': color = 'bg-green-600 text-white'; text = 'Accept'; break;
        case 'Review': color = 'bg-yellow-500 text-black'; text = 'Review'; break;
        case 'Investigate': color = 'bg-orange-600 text-white'; text = 'Investigate'; break;
        case 'Reject': color = 'bg-red-700 text-white'; text = 'Reject'; break;
      }
      return { text, color, riskLevelDisplay: `Assessment: ${text} (Conf: ${confidence}%)` };
    }
    // Fallback if decisionIntelligence is not yet available
    const riskLevel = result.securityAssessment?.fraudRiskLevel || 'Unknown';
    let color = 'bg-slate-500 text-white';
    if (riskLevel === 'Critical') color = 'bg-red-700 text-white';
    else if (riskLevel === 'High') color = 'bg-red-600 text-white';
    else if (riskLevel === 'Medium') color = 'bg-yellow-500 text-black';
    else if (riskLevel === 'Low') color = 'bg-green-600 text-white';
    return { text: `Risk: ${riskLevel}`, color, riskLevelDisplay: `Risk: ${riskLevel}` };
  }, [result, decisionIntelligence]);


  if (isLoading) {
    return (
      <div className="mt-4 print:mt-0">
        <div className="bg-slate-200 animate-pulse p-4 rounded-t-lg">
          <div className="h-6 bg-slate-300 rounded w-1/3"></div>
        </div>
        <div className="p-4 bg-slate-50 rounded-b-lg">
          <LoadingSpinner />
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="mt-4 print:mt-0">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p className="font-bold">Error:</p>
          <p>{error}</p>
        </div>
      </div>
    );
  }
  
  if (!result) {
    return (
      <div className="mt-4 print:mt-0">
        <div className="bg-slate-100 border border-slate-300 text-slate-600 px-4 py-3 rounded">
          <p>No verification result available.</p>
        </div>
      </div>
    );
  }
  
  // Destructure after null/error/loading checks
  const { verificationId, processingTimestamp, cpaImageQuality, micrValidation, securityAssessment, institutionDetails, aiComplianceAnalysis, aiInstitutionRecognition, aiFraudRiskAssessment } = result!;


  const renderField = (label: string, value: React.ReactNode | string | number | boolean | null | undefined, options?: { unit?: string, status?: boolean | null | undefined, copyable?: boolean, isList?: boolean, highlightValue?: boolean }) => {
    let displayValue: React.ReactNode = <span className="text-slate-500 italic">N/A</span>;
    let valueClasses = "text-slate-700 break-words";
    if (options?.highlightValue) valueClasses += " p-1 bg-sky-50 rounded font-medium";

    if (value !== null && typeof value !== 'undefined' && value !== "") {
        if (options?.isList && Array.isArray(value) && value.length > 0) {
            displayValue = (
                <ul className="list-disc list-inside pl-1 mt-0.5 space-y-0.5">
                    {value.map((item, idx) => <li key={idx} className={valueClasses}>{String(item)}</li>)}
                </ul>
            );
        } else if (options?.isList && Array.isArray(value) && value.length === 0) {
             displayValue = <span className="text-slate-500 italic">None listed</span>;
        } else if (typeof value === 'boolean') {
            displayValue = <StatusIndicator status={value} trueText="Yes" falseText="No" />;
        } else {
            displayValue = <span className={valueClasses}>{String(value)}{options?.unit}</span>;
        }
    } else if (options?.isList) {
        displayValue = <span className="text-slate-500 italic">None listed</span>;
    }


    return (
      <div className="py-1.5 border-b border-slate-100 last:border-b-0">
        <dt className="text-xs font-medium text-slate-500 flex justify-between items-center">
            <span>{label}</span>
            {typeof options?.status !== 'undefined' && <StatusIndicator status={options.status} />}
        </dt>
        <dd className="mt-0.5 flex items-center">
            <div className="flex-grow">{displayValue}</div>
            {options?.copyable && value && (
                <button onClick={() => handleCopyToClipboard(String(value), label)} title={`Copy ${label}`} className="ml-2 p-1 text-slate-400 hover:text-blue-600 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" /></svg>
                </button>
            )}
        </dd>
      </div>
    );
  };
  
  const formatMicrLineDisplay = (micr: string | null | undefined) => {
    if (!micr) return 'N/A';
    return micr;
  };
  
  const chequeBranchCode = useMemo(() => result.branchCode || result.micrValidation?.transitNumber?.substring(0, 5) || null, [result.branchCode, result.micrValidation]);
  const chequeInstitutionNumber = useMemo(() => result.institutionNumber || result.micrValidation?.transitNumber?.substring(5, 8) || null, [result.institutionNumber, result.micrValidation]);
  const chequeBranchLocation = useMemo(() => getBranchLocation(chequeBranchCode), [chequeBranchCode]);

  const TABS: { id: DashboardTabKey; label: string; icon: React.ReactNode | string }[] = [
    { id: 'decision', label: 'Decision & Actions', icon: '💡' },
    { id: 'micr', label: 'MICR Details', icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 mr-1.5 inline-block"><path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.162V6a2 2 0 00-2-2H3z" /><path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" /></svg> },
    { id: 'security', label: 'Security Analysis', icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 mr-1.5 inline-block"><path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" /></svg> },
    { id: 'imageQuality', label: 'Image Quality', icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 mr-1.5 inline-block"><path d="M11.983 1.904a3.003 3.003 0 00-3.966 0L3.66 6.64A3 3 0 002 8.996V15a3 3 0 003 3h10a3 3 0 003-3V8.996a3 3 0 00-1.66-2.356L11.983 1.904zM10 3a1 1 0 110 2 1 1 0 010-2zM6 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1z" /></svg> },
    { id: 'institutions', label: 'Institution Directory', icon: '🏦' },
  ];

  return (
    <div className="mt-4 print:mt-0">
      {/* Dashboard Header Section */}
      <div className="bg-blue-800 text-white p-4 rounded-t-lg shadow-md print:hidden">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-2">
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 text-sm font-semibold rounded-full shadow-sm ${dashboardHeaderStatus.color}`}>
              {dashboardHeaderStatus.text}
            </span>
          </div>
          <div className="text-xs text-blue-200 text-center sm:text-right">
            {processingTimestamp && <p>Verified: {new Date(processingTimestamp).toLocaleString()}</p>}
            {verificationId && <p>ID: {verificationId}</p>}
          </div>
          {/* Action buttons moved to tabs or main app header */}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-slate-300 bg-slate-50 print:hidden">
        <nav className="-mb-px flex space-x-1 px-4 overflow-x-auto" aria-label="Tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-shrink-0 whitespace-nowrap py-3 px-4 font-medium text-sm border-b-2 transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-400 rounded-t-md
                ${activeTab === tab.id 
                  ? 'border-blue-600 text-blue-700 bg-white' 
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
              aria-current={activeTab === tab.id ? 'page' : undefined}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content Area */}
      <div className="p-4 bg-slate-50 rounded-b-lg print:p-0">
        {activeTab === 'decision' && decisionIntelligence && (
          <DashboardCard title="Decision Intelligence & Actions" icon="💡" 
            titleAction={
                <div className={`px-3 py-1 text-xs font-bold rounded-full shadow-sm ${dashboardHeaderStatus.color}`}>
                    {dashboardHeaderStatus.text} (Conf: {decisionIntelligence.overallRiskAssessment.confidence}%)
                </div>
            }>
            <div className="mb-3 p-3 rounded-md border-l-4 bg-blue-50 border-blue-600">
                <p className="text-sm font-semibold text-blue-800">{decisionIntelligence.summaryStatement}</p>
            </div>
            
            <h4 className="text-sm font-semibold text-slate-700 mt-3 mb-1">Immediate Action Required:</h4>
            <p className="text-md font-bold text-red-700 p-2 bg-red-50 rounded border border-red-200">{decisionIntelligence.operationsGuidance.immediateAction}</p>

            <details className="mt-3 text-xs" open>
              <summary className="font-medium text-slate-600 cursor-pointer py-1">Reasons & Recommendations</summary>
              <dl className="mt-1 p-2 bg-slate-100 rounded border border-slate-200 space-y-2">
                {renderField("Reasons for Concern:", decisionIntelligence.overallRiskAssessment.reasonsForConcern, { isList: true })}
                {renderField("Recommended Operator Actions:", decisionIntelligence.overallRiskAssessment.recommendedActions, { isList: true })}
              </dl>
            </details>
            
            <details className="mt-3 text-xs">
              <summary className="font-medium text-slate-600 cursor-pointer py-1">Operational Guidance</summary>
              <dl className="mt-1 p-2 bg-slate-100 rounded border border-slate-200 space-y-1">
                {renderField("Documentation Required:", decisionIntelligence.operationsGuidance.documentationRequired, { isList: true })}
                {renderField("Processing Timeframe:", decisionIntelligence.operationsGuidance.processingTimeframe)}
                {decisionIntelligence.operationsGuidance.escalationPath && renderField("Escalation Path:", decisionIntelligence.operationsGuidance.escalationPath)}
              </dl>
            </details>

            <details className="mt-3 text-xs">
              <summary className="font-medium text-slate-600 cursor-pointer py-1">Institution Context</summary>
              <dl className="mt-1 p-2 bg-slate-100 rounded border border-slate-200 space-y-1">
                {renderField("Bank Name:", decisionIntelligence.institutionContext.bankName)}
                {renderField("Institution Risk Profile:", decisionIntelligence.institutionContext.institutionRiskProfile)}
                {decisionIntelligence.institutionContext.recentIssuesWithInstitution && decisionIntelligence.institutionContext.recentIssuesWithInstitution.length > 0 &&
                  renderField("Recent Intel:", decisionIntelligence.institutionContext.recentIssuesWithInstitution, {isList: true})
                }
                {decisionIntelligence.institutionContext.keyVerificationContacts && decisionIntelligence.institutionContext.keyVerificationContacts.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mt-1">Key Contacts:</p>
                    <ul className="list-disc list-inside pl-1 mt-0.5 space-y-0.5">
                      {decisionIntelligence.institutionContext.keyVerificationContacts.map((contact, i) => (
                        <li key={i} className="text-slate-700">{contact.type} ({contact.method}): {contact.details}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </dl>
            </details>
          </DashboardCard>
        )}
        
        {activeTab === 'micr' && (
          <DashboardCard title="MICR Analysis" icon="🔢">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="py-2 border-b border-slate-200">
                  <p className="text-sm font-medium text-slate-600">Raw Extracted MICR:</p>
                  <div className="p-2 bg-white rounded border border-slate-300 mt-1">
                    {formatMicrLineDisplay(result.rawExtractedMicr)}
                  </div>
                </div>
                <div className="py-2 border-b border-slate-200 last:border-b-0">
                  <p className="text-sm font-medium text-slate-600 flex items-center">
                    Full MICR Routing String:
                    <StatusIndicator 
                      status={result.transitNumberValid || result.micrValidation?.transitNumberCpaChecksumValid}
                      customText={{
                        true: "9-Digit Routing Valid (CPA Checksum)", 
                        false: "9-Digit Routing Invalid (CPA Checksum)", 
                        null: "Routing Not Validated / Not 9 Digits"
                      }}
                    />
                  </p>
                  <p className="text-slate-800 font-mono break-words mb-1">
                    {result.transitNumber || <span className="text-slate-500 italic">N/A</span>}
                  </p>
                  
                  {/* Branch and Institution breakdown */}
                  <div className="pl-4 text-xs space-y-0.5 mt-1 text-slate-700">
                    <p><span className="font-semibold">Branch Code:</span> <span className="font-mono">{chequeBranchCode || 'N/A'}</span></p>
                    <p><span className="font-semibold">Institution Number:</span> <span className="font-mono">{chequeInstitutionNumber || 'N/A'}</span></p>
                    {result.micrValidation?.checkDigitValid !== undefined && 
                      <p><span className="font-semibold">Check Digit Valid:</span> <StatusIndicator status={result.micrValidation.checkDigitValid} showText={true} /></p>}
                    {chequeBranchLocation && <p><span className="font-semibold">Branch Location:</span> {chequeBranchLocation}</p>}
                  </div>
                </div>

                {renderField("Account Number:", result.accountNumber, {mono: true, highlight: true, copyable: true})}
                {renderField("Cheque/Serial Number:", result.checkNumber, {mono: true, copyable: true})}
                {renderField("MICR Transaction Code:", result.transactionCode, {mono: true})}
                {renderField("Auxiliary On-Us / EPC:", result.auxiliaryOnUs, {mono: true})}
              </div>
              
              <div className="space-y-4">
                <div className="p-3 border border-slate-200 rounded-md bg-slate-50">
                  <h4 className="text-md font-semibold text-slate-700 mb-2">Institution Information:</h4>
                  {renderField("Institution Name:", result.institutionDetails?.commonName || result.institutionDetails?.name || result.aiInstitutionRecognition?.recognizedInstitutionName, {highlight: true})}
                  {renderField("Institution Type:", result.institutionDetails?.type || result.aiInstitutionRecognition?.institutionTypeGuess)}
                  {renderField("Institution Risk Profile:", result.institutionDetails?.riskProfile)}
                  {renderField("Regulatory Body:", result.institutionDetails?.regulatoryBody)}
                  {renderField("CDIC Insured:", result.institutionDetails?.cdic)}
                </div>
                
                <div className="p-3 border border-slate-200 rounded-md bg-slate-50">
                  <h4 className="text-md font-semibold text-slate-700 mb-2">MICR Validation Results:</h4>
                  {renderField("Format Valid:", result.micrValidation?.transitNumberCpaChecksumValid, {status: result.micrValidation?.transitNumberCpaChecksumValid})}
                  {renderField("E-13B Font Compliance:", result.micrValidation?.e13bFontEncodingCompliant, {status: result.micrValidation?.e13bFontEncodingCompliant})}
                  {renderField("CPA Standard 006 Compliant:", result.cpaImageQuality?.cpaStandard006Compliant, {status: result.cpaImageQuality?.cpaStandard006Compliant})}
                </div>
              </div>
            </div>
          </DashboardCard>
        )}
        
        {activeTab === 'security' && (
          <DashboardCard title="Security Analysis" icon="🔒">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="p-3 border border-slate-200 rounded-md bg-slate-50">
                  <h4 className="text-md font-semibold text-slate-700 mb-2">Security Assessment:</h4>
                  {renderField("Fraud Risk Level:", result.securityAssessment?.fraudRiskLevel, {highlight: true})}
                  {renderField("OSFI Reportable Risk:", result.securityAssessment?.osfiReportableRisk, {status: result.securityAssessment?.osfiReportableRisk === true ? false : true})}
                  {renderField("Image Authenticity Score:", result.securityAssessment?.imageAuthenticityScore, {unit: '/100'})}
                  {renderField("Counterfeit Likelihood Score:", result.securityAssessment?.counterfeitLikelihoodScore, {unit: '/100'})}
                </div>

                <div className="p-3 border border-slate-200 rounded-md bg-slate-50">
                  <h4 className="text-md font-semibold text-slate-700 mb-2">Detected Security Features:</h4>
                  {result.securityAssessment?.detectedSecurityFeatures && result.securityAssessment.detectedSecurityFeatures.length > 0 ? (
                    <ul className="list-disc list-inside pl-1 space-y-1">
                      {result.securityAssessment.detectedSecurityFeatures.map((feature, idx) => (
                        <li key={idx} className="text-slate-700">{feature}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-slate-500 italic">No specific security features detected or listed</p>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-3 border border-slate-200 rounded-md bg-slate-50">
                  <h4 className="text-md font-semibold text-slate-700 mb-2">Alteration Analysis:</h4>
                  {renderField("Tamper Evidence Check:", result.securityAssessment?.tamperEvidenceCheck)}
                  {renderField("Alterations Evident:", result.securityAssessment?.alterationsEvident, {status: result.securityAssessment?.alterationsEvident === true ? false : true})}
                  {renderField("Alterations in Payee:", result.alterationsPayeeSuspected, {status: result.alterationsPayeeSuspected === true ? false : true})}
                  {renderField("Alterations in Amount:", result.alterationsAmountSuspected, {status: result.alterationsAmountSuspected === true ? false : true})}
                </div>

                <div className="p-3 border border-slate-200 rounded-md bg-slate-50">
                  <h4 className="text-md font-semibold text-slate-700 mb-2">Suspicious Patterns:</h4>
                  {result.securityAssessment?.suspiciousPatternsObserved && result.securityAssessment.suspiciousPatternsObserved.length > 0 ? (
                    <ul className="list-disc list-inside pl-1 space-y-1">
                      {result.securityAssessment.suspiciousPatternsObserved.map((pattern, idx) => (
                        <li key={idx} className="text-slate-700">{pattern}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-green-600">No suspicious patterns detected</p>
                  )}
                </div>

                <div className="p-3 border border-orange-100 rounded-md bg-orange-50">
                  <h4 className="text-md font-semibold text-orange-700 mb-2">AI Risk Assessment:</h4>
                  {renderField("AI Fraud Risk Level:", result.aiFraudRiskAssessment?.riskLevel)}
                  {renderField("AI Risk Score:", result.aiFraudRiskAssessment?.overallFraudRiskScore, {unit: '/100'})}
                  {renderField("AI Confidence:", result.aiFraudRiskAssessment?.confidenceInAssessment, {unit: '%'})}
                </div>
              </div>
            </div>
          </DashboardCard>
        )}
        
        {activeTab === 'imageQuality' && (
          <DashboardCard title="Image Quality Assessment" icon="📷">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <h4 className="text-md font-semibold text-slate-700 mb-2">Cheque Image:</h4>
                  <img 
                    src={result.imageUrl} 
                    alt="Uploaded Check" 
                    className="rounded-md border border-slate-300 shadow-sm max-w-full h-auto max-h-96 object-contain"
                  />
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="p-3 border border-slate-200 rounded-md bg-slate-50">
                  <h4 className="text-md font-semibold text-slate-700 mb-2">CPA Standard 006 Compliance:</h4>
                  {renderField("Overall CPA006 Compliant:", result.cpaImageQuality?.cpaStandard006Compliant, {status: result.cpaImageQuality?.cpaStandard006Compliant})}
                  {renderField("MICR Line Readability:", result.cpaImageQuality?.micrLineReadability)}
                  {renderField("Cheque Dimensions Valid:", result.cpaImageQuality?.chequeDimensionsValid, {status: result.cpaImageQuality?.chequeDimensionsValid})}
                  {renderField("MICR Clear Band Detected:", result.cpaImageQuality?.micrClearBandDetected, {status: result.cpaImageQuality?.micrClearBandDetected})}
                  {renderField("Image Resolution (DPI):", result.cpaImageQuality?.imageResolutionDPI, {
                    status: result.cpaImageQuality?.imageResolutionDPI && result.cpaImageQuality.imageResolutionDPI >= CPA_IMAGE_RESOLUTION_DPI.MIN_FOR_MICR_READING ? true : 
                           result.cpaImageQuality?.imageResolutionDPI && result.cpaImageQuality.imageResolutionDPI < CPA_IMAGE_RESOLUTION_DPI.MIN_FOR_MICR_READING ? false : null
                  })}
                </div>

                <div className="p-3 border border-slate-200 rounded-md bg-slate-50">
                  <h4 className="text-md font-semibold text-slate-700 mb-2">Image Quality Metrics:</h4>
                  {renderField("Overall Clarity:", result.overallClarity)}
                  {renderField("Ink Color Acceptable:", result.inkColorAcceptable, {status: result.inkColorAcceptable})}
                  {result.designIssues && result.designIssues.length > 0 ? (
                    <div>
                      <p className="text-xs font-medium text-slate-500">Design Issues:</p>
                      <ul className="list-disc list-inside pl-1 mt-0.5 space-y-0.5">
                        {result.designIssues.map((issue, idx) => (
                          <li key={idx} className="text-slate-700">{issue}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    renderField("Design Issues:", "None detected", {})
                  )}
                </div>

                <div className="p-3 border border-slate-200 rounded-md bg-slate-50">
                  <h4 className="text-md font-semibold text-slate-700 mb-2">Image Enhancement Recommendations:</h4>
                  <ul className="list-disc list-inside pl-1 space-y-1">
                    {result.overallClarity === 'poor' && (
                      <>
                        <li className="text-slate-700">Use higher resolution camera or scanner</li>
                        <li className="text-slate-700">Ensure even lighting without shadows</li>
                        <li className="text-slate-700">Place cheque on contrasting background</li>
                      </>
                    )}
                    {result.cpaImageQuality?.micrLineReadability === 'poor' && (
                      <li className="text-slate-700">Ensure MICR line is clearly visible and unobstructed</li>
                    )}
                    {(result.overallClarity === 'good' && result.cpaImageQuality?.cpaStandard006Compliant) ? (
                      <li className="text-green-600">Image quality is good and meets CPA standards</li>
                    ) : (
                      <li className="text-slate-700">Use at least 300 DPI resolution for optimal results</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          </DashboardCard>
        )}
        
        {activeTab === 'institutions' && (
          <DashboardCard title="Institution Directory" icon="🏦">
            <InstitutionSearchWidget />
          </DashboardCard>
        )}
      </div>
      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          .print\\:mt-0 { margin-top: 0 !important; }
          .print\\:p-0 { padding: 0 !important; }
        }
      `}</style>
    </div>
  );
};

export default React.memo(CanadianBankingDashboard);