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
  
  const chequeBranchCode = useMemo(() => result.micrValidation?.transitNumber?.substring(0, 5) || null, [result.micrValidation]);
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
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="p-3 border border-slate-200 rounded-md bg-slate-50">
                  <h4 className="text-md font-semibold text-slate-700 mb-2">MICR Line Details</h4>
                  <div className="py-2 border-b border-slate-200 last:border-b-0">
                    <p className="text-sm font-medium text-slate-600">Raw Extracted MICR:</p>
                    <div className="mt-1 p-2 bg-blue-50 rounded border border-blue-200 font-mono break-words">
                      {result.rawExtractedMicr ? 
                        Object.entries(MICR_SYMBOLS_MAP).reduce(
                          (str, [key, symbol]) => str.replace(new RegExp(key, 'g'), symbol), 
                          result.rawExtractedMicr
                        ) : 
                        <span className="text-slate-500 italic">Not detected</span>
                      }
                    </div>
                  </div>
                  {renderField("Account Number", result.accountNumber, {mono: true, copyable: true})}
                  {renderField("Cheque/Serial Number", result.checkNumber, {mono: true, copyable: true})}
                  {renderField("Transaction Code", result.transactionCode, {mono: true})}
                  {renderField("Auxiliary On-Us", result.auxiliaryOnUs, {mono: true})}
                </div>
                
                {result.micrValidation && (
                  <div className="p-3 border border-slate-200 rounded-md bg-slate-50">
                    <h4 className="text-md font-semibold text-slate-700 mb-2">MICR Validation Status</h4>
                    {renderField("CPA Checksum Validation", null, {
                      status: result.micrValidation.transitNumberCpaChecksumValid
                    })}
                    {renderField("Check Digit Valid", null, {
                      status: result.micrValidation.checkDigitValid
                    })}
                    {renderField("E-13B Font Compliant", null, {
                      status: result.micrValidation.e13bFontEncodingCompliant
                    })}
                  </div>
                )}
              </div>
              
              <div className="space-y-4">
                {result.transitNumber && (
                  <div className="p-3 border border-slate-200 rounded-md bg-slate-50">
                    <h4 className="text-md font-semibold text-slate-700 mb-2">Transit/Routing Analysis</h4>
                    <div className="py-2 border-b border-slate-200 last:border-b-0">
                      <p className="text-sm font-medium text-slate-600 flex items-center">
                        Full Transit Number 
                        <StatusIndicator 
                          status={result.transitNumberValid} 
                          trueText="Valid" 
                          falseText="Invalid" 
                        />
                      </p>
                      <p className="text-lg font-mono font-semibold text-slate-700 mt-1">{result.transitNumber}</p>
                      <div className="mt-2 grid grid-cols-2 gap-2 bg-blue-50 p-2 rounded">
                        <div>
                          <p className="text-xs font-medium text-slate-500">Branch Code:</p>
                          <p className="font-mono">{result.transitNumber.substring(0, 5)}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-slate-500">Institution Code:</p>
                          <p className="font-mono">{result.transitNumber.substring(5, 8)}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-slate-500">Check Digit:</p>
                          <p className="font-mono">{result.transitNumber.substring(8, 9)}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-slate-500">MICR Format:</p>
                          <p className="text-xs">CPA Standard 006</p>
                        </div>
                      </div>
                    </div>
                    
                    {chequeBranchLocation && (
                      <div className="py-2 border-b border-slate-200 last:border-b-0">
                        <p className="text-sm font-medium text-slate-600">Branch Location:</p>
                        <p className="text-slate-700">{chequeBranchLocation}</p>
                      </div>
                    )}
                    
                    {result.institutionDetails && (
                      <div className="py-2 last:border-b-0">
                        <p className="text-sm font-medium text-slate-600">Institution:</p>
                        <p className="text-slate-700 font-medium">{result.institutionDetails.name}</p>
                        <p className="text-xs text-slate-500">{result.institutionDetails.type} • {result.institutionDetails.status}</p>
                      </div>
                    )}
                  </div>
                )}
                
                {result.processingNotes && (
                  <div className="p-3 border border-amber-200 rounded-md bg-amber-50">
                    <h4 className="text-sm font-semibold text-amber-800 mb-1">Processing Notes:</h4>
                    <p className="text-xs text-amber-700 italic">{result.processingNotes}</p>
                  </div>
                )}
              </div>
            </div>
          </DashboardCard>
        )}
        
        {activeTab === 'security' && (
          <DashboardCard title="Security Analysis" icon="🔒">
            {result.securityAssessment ? (
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="p-3 border border-slate-200 rounded-md bg-slate-50">
                    <h4 className="text-md font-semibold text-slate-700 mb-2">Security Risk Assessment</h4>
                    <div className="py-2 border-b border-slate-200 last:border-b-0">
                      <p className="text-sm font-medium text-slate-600">Risk Level:</p>
                      <div className={`mt-1 px-3 py-2 rounded-md font-semibold text-white inline-block ${
                        result.securityAssessment.fraudRiskLevel === 'Critical' ? 'bg-red-600' :
                        result.securityAssessment.fraudRiskLevel === 'High' ? 'bg-red-500' :
                        result.securityAssessment.fraudRiskLevel === 'Medium' ? 'bg-yellow-500 text-black' :
                        result.securityAssessment.fraudRiskLevel === 'Low' ? 'bg-green-500' :
                        'bg-slate-500'
                      }`}>
                        {result.securityAssessment.fraudRiskLevel || 'Unknown'}
                      </div>
                    </div>
                    
                    <div className="py-2 border-b border-slate-200 last:border-b-0">
                      <p className="text-sm font-medium text-slate-600">OSFI Reportable:</p>
                      <p className={`mt-1 ${result.securityAssessment.osfiReportableRisk ? 'text-red-600 font-semibold' : 'text-green-600'}`}>
                        {result.securityAssessment.osfiReportableRisk ? 'Yes - requires reporting' : 'No - standard processing'}
                      </p>
                    </div>
                    
                    <div className="py-2 border-b border-slate-200 last:border-b-0">
                      <p className="text-sm font-medium text-slate-600">Tamper Evidence:</p>
                      <p className={`mt-1 ${
                        result.securityAssessment.tamperEvidenceCheck === 'passed' ? 'text-green-600' :
                        result.securityAssessment.tamperEvidenceCheck === 'failed' ? 'text-red-600' :
                        'text-slate-600'
                      }`}>
                        {result.securityAssessment.tamperEvidenceCheck === 'passed' ? 'Passed - No tampering detected' :
                         result.securityAssessment.tamperEvidenceCheck === 'failed' ? 'Failed - Tampering suspected' :
                         'Unknown/Not assessed'}
                      </p>
                    </div>
                    
                    {result.securityAssessment.imageAuthenticityScore !== null && (
                      <div className="py-2 last:border-b-0">
                        <p className="text-sm font-medium text-slate-600">Image Authenticity Score:</p>
                        <ProgressBar 
                          score={result.securityAssessment.imageAuthenticityScore} 
                          maxScore={100} 
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          {result.securityAssessment.imageAuthenticityScore > 80 ? 'High authenticity - image appears unaltered' :
                           result.securityAssessment.imageAuthenticityScore > 50 ? 'Moderate authenticity - minor concerns' :
                           'Low authenticity - significant concerns with image'}
                        </p>
                      </div>
                    )}
                  </div>
                
                  {result.aiFraudRiskAssessment && (
                    <div className="p-3 border border-slate-200 rounded-md bg-slate-50">
                      <h4 className="text-md font-semibold text-slate-700 mb-2">AI Fraud Risk Analysis</h4>
                      
                      {result.aiFraudRiskAssessment.overallFraudRiskScore !== null && (
                        <div className="py-2 border-b border-slate-200">
                          <p className="text-sm font-medium text-slate-600">Overall Fraud Risk Score:</p>
                          <ProgressBar 
                            score={result.aiFraudRiskAssessment.overallFraudRiskScore} 
                            maxScore={100} 
                          />
                        </div>
                      )}
                      
                      {result.aiFraudRiskAssessment.keyRiskFactors?.length > 0 && (
                        <div className="py-2 border-b border-slate-200">
                          <p className="text-sm font-medium text-slate-600">Key Risk Factors:</p>
                          <ul className="mt-1 space-y-2">
                            {result.aiFraudRiskAssessment.keyRiskFactors.map((factor, idx) => (
                              <li key={idx} className="text-xs bg-slate-100 p-2 rounded">
                                <span className={`font-semibold ${
                                  factor.severity === 'High' ? 'text-red-600' :
                                  factor.severity === 'Medium' ? 'text-yellow-600' :
                                  'text-slate-600'
                                }`}>
                                  {factor.factor} ({factor.severity})
                                </span>
                                <p className="text-slate-600 mt-0.5">{factor.details}</p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {result.aiFraudRiskAssessment.recommendedActions?.length > 0 && (
                        <div className="py-2">
                          <p className="text-sm font-medium text-slate-600">Recommended Actions:</p>
                          <ul className="list-disc list-inside mt-1 text-xs text-slate-700 space-y-0.5">
                            {result.aiFraudRiskAssessment.recommendedActions.map((action, idx) => (
                              <li key={idx}>{action}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {result.aiFraudRiskAssessment.confidenceInAssessment && (
                        <p className="text-xs text-slate-500 mt-2 italic">
                          AI Confidence: {result.aiFraudRiskAssessment.confidenceInAssessment}%
                        </p>
                      )}
                    </div>
                  )}
                </div>
                
                <div className="space-y-4">
                  {result.securityAssessment.detectedSecurityFeatures && result.securityAssessment.detectedSecurityFeatures.length > 0 && (
                    <div className="p-3 border border-slate-200 rounded-md bg-slate-50">
                      <h4 className="text-md font-semibold text-slate-700 mb-2">Detected Security Features</h4>
                      <ul className="list-disc list-inside pl-1 space-y-1">
                        {result.securityAssessment.detectedSecurityFeatures.map((feature, idx) => (
                          <li key={idx} className="text-sm text-slate-700">{feature}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {result.securityAssessment.suspiciousPatternsObserved && result.securityAssessment.suspiciousPatternsObserved.length > 0 && (
                    <div className="p-3 border border-red-200 rounded-md bg-red-50">
                      <h4 className="text-md font-semibold text-red-700 mb-2">Suspicious Patterns Observed</h4>
                      <ul className="list-disc list-inside pl-1 space-y-1">
                        {result.securityAssessment.suspiciousPatternsObserved.map((pattern, idx) => (
                          <li key={idx} className="text-sm text-red-700">{pattern}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {result.securityAssessment.counterfeitLikelihoodScore !== null && (
                    <div className="p-3 border border-slate-200 rounded-md bg-slate-50">
                      <h4 className="text-md font-semibold text-slate-700 mb-2">Counterfeit Assessment</h4>
                      <p className="text-sm font-medium text-slate-600 mb-1">Counterfeit Likelihood Score:</p>
                      <ProgressBar 
                        score={result.securityAssessment.counterfeitLikelihoodScore} 
                        maxScore={100} 
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        {result.securityAssessment.counterfeitLikelihoodScore > 70 ? 'High likelihood of counterfeit - immediate action required' :
                         result.securityAssessment.counterfeitLikelihoodScore > 40 ? 'Moderate counterfeit concerns - verify with financial institution' :
                         'Low counterfeit likelihood - standard processing acceptable'}
                      </p>
                    </div>
                  )}
                  
                  <div className="p-3 border border-slate-200 rounded-md bg-slate-50">
                    <h4 className="text-md font-semibold text-slate-700 mb-2">Alteration Analysis</h4>
                    {renderField("Alterations Evident", result.securityAssessment.alterationsEvident)}
                    {renderField("Payee Name Altered", result.alterationsPayeeSuspected)}
                    {renderField("Amount Altered", result.alterationsAmountSuspected)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center bg-slate-100 rounded-lg">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-slate-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-slate-600 font-medium">Security assessment data not available</p>
                <p className="text-slate-500 text-sm mt-1">Try reanalyzing the cheque to generate security analysis</p>
              </div>
            )}
          </DashboardCard>
        )}
        
        {activeTab === 'imageQuality' && (
          <DashboardCard title="Image Quality Assessment" icon="📷">
            {result.cpaImageQuality ? (
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="p-3 border border-slate-200 rounded-md bg-slate-50">
                    <h4 className="text-md font-semibold text-slate-700 mb-2">CPA Standard 006 Compliance</h4>
                    <div className="py-2 border-b border-slate-200 last:border-b-0">
                      <p className="text-sm font-medium text-slate-600 flex items-center">
                        Overall Compliance Status
                        <StatusIndicator 
                          status={result.cpaImageQuality.cpaStandard006Compliant}
                          trueText="CPA 006 Compliant" 
                          falseText="Non-Compliant" 
                        />
                      </p>
                      <p className={`mt-1 text-sm ${result.cpaImageQuality.cpaStandard006Compliant ? 'text-green-600' : 'text-red-600'}`}>
                        {result.cpaImageQuality.cpaStandard006Compliant ? 
                          'This image meets CPA Standard 006 requirements' : 
                          'This image does not meet one or more CPA Standard 006 requirements'}
                      </p>
                    </div>
                    
                    <div className="py-2 border-b border-slate-200 last:border-b-0">
                      <p className="text-sm font-medium text-slate-600">MICR Line Readability:</p>
                      <div className={`mt-1 px-3 py-1 rounded inline-block text-white ${
                        result.cpaImageQuality.micrLineReadability === 'excellent' ? 'bg-green-600' :
                        result.cpaImageQuality.micrLineReadability === 'good' ? 'bg-green-500' :
                        result.cpaImageQuality.micrLineReadability === 'fair' ? 'bg-yellow-500 text-black' :
                        result.cpaImageQuality.micrLineReadability === 'poor' ? 'bg-red-500' :
                        'bg-slate-500'
                      }`}>
                        {result.cpaImageQuality.micrLineReadability || 'Unknown'}
                      </div>
                    </div>
                    
                    {result.cpaImageQuality.chequeDimensionsValid !== null && (
                      <div className="py-2 border-b border-slate-200 last:border-b-0">
                        <p className="text-sm font-medium text-slate-600 flex items-center">
                          Cheque Dimensions Valid
                          <StatusIndicator 
                            status={result.cpaImageQuality.chequeDimensionsValid}
                            trueText="Valid Dimensions" 
                            falseText="Invalid Dimensions" 
                          />
                        </p>
                      </div>
                    )}
                    
                    {result.cpaImageQuality.micrClearBandDetected !== null && (
                      <div className="py-2 last:border-b-0">
                        <p className="text-sm font-medium text-slate-600 flex items-center">
                          MICR Clear Band Detected
                          <StatusIndicator 
                            status={result.cpaImageQuality.micrClearBandDetected}
                            trueText="Clear Band Detected" 
                            falseText="Clear Band Not Detected" 
                          />
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          CPA Standard 006 requires a 5/8" clear band around the MICR line
                        </p>
                      </div>
                    )}
                  </div>
                  
                  {result.cpaImageQuality.imageResolutionDPI && (
                    <div className="p-3 border border-slate-200 rounded-md bg-slate-50">
                      <h4 className="text-md font-semibold text-slate-700 mb-2">Image Resolution</h4>
                      <p className="text-sm font-medium text-slate-600">Estimated Resolution:</p>
                      <p className="text-slate-700 text-lg font-semibold">
                        {result.cpaImageQuality.imageResolutionDPI} DPI
                      </p>
                      <p className={`text-xs ${
                        result.cpaImageQuality.imageResolutionDPI >= CPA_IMAGE_RESOLUTION_DPI.OPTIMAL ? 'text-green-600' :
                        result.cpaImageQuality.imageResolutionDPI >= CPA_IMAGE_RESOLUTION_DPI.RECOMMENDED ? 'text-green-500' :
                        result.cpaImageQuality.imageResolutionDPI >= CPA_IMAGE_RESOLUTION_DPI.MIN_FOR_MICR_READING ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {result.cpaImageQuality.imageResolutionDPI >= CPA_IMAGE_RESOLUTION_DPI.OPTIMAL ? 
                          'Excellent - exceeds CPA recommended resolution' :
                         result.cpaImageQuality.imageResolutionDPI >= CPA_IMAGE_RESOLUTION_DPI.RECOMMENDED ?
                          'Good - meets CPA recommended resolution' :
                         result.cpaImageQuality.imageResolutionDPI >= CPA_IMAGE_RESOLUTION_DPI.MIN_FOR_MICR_READING ?
                          'Acceptable - meets minimum for MICR reading' :
                          'Poor - below minimum recommended DPI for MICR reading'
                        }
                      </p>
                    </div>
                  )}
                </div>
                
                <div className="space-y-4">
                  {result.cpaImageQuality.printContrastRatio !== null && (
                    <div className="p-3 border border-slate-200 rounded-md bg-slate-50">
                      <h4 className="text-md font-semibold text-slate-700 mb-2">Print Contrast</h4>
                      <p className="text-sm font-medium text-slate-600">Print Contrast Ratio:</p>
                      <ProgressBar 
                        score={result.cpaImageQuality.printContrastRatio * 100} 
                        maxScore={100} 
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        CPA Standard 006 requires a minimum contrast ratio of 0.60 (60%)
                      </p>
                    </div>
                  )}
                  
                  <div className="p-3 border border-slate-200 rounded-md bg-slate-50">
                    <h4 className="text-md font-semibold text-slate-700 mb-2">Cheque Physical Properties</h4>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div>
                        <p className="text-xs font-medium text-slate-500">Standard Dimensions:</p>
                        <p className="text-slate-700">6.25" × 2.75" to 8.5" × 3.5"</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-500">Standard Aspect Ratio:</p>
                        <p className="text-slate-700">~2.27:1 (typical)</p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      CPA Standard 006 specifies acceptable cheque dimensions for processing
                    </p>
                  </div>
                  
                  <div className="p-3 border border-amber-200 rounded-md bg-amber-50">
                    <h4 className="text-md font-semibold text-amber-700 mb-2">Image Quality Tips</h4>
                    <ul className="list-disc list-inside text-xs text-amber-700 space-y-1">
                      <li>Use minimum 300 DPI for optimal MICR line reading</li>
                      <li>Ensure even lighting with no glare or shadows</li>
                      <li>Capture the full cheque with clear borders</li>
                      <li>Position cheque straight (not skewed or rotated)</li>
                      <li>Maintain high contrast between MICR line and background</li>
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center bg-slate-100 rounded-lg">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-slate-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p className="text-slate-600 font-medium">Image quality assessment not available</p>
                <p className="text-slate-500 text-sm mt-1">Try reanalyzing the cheque to generate image quality data</p>
              </div>
            )}
          </DashboardCard>
        )}
        
        {activeTab === 'institutions' && (
          <DashboardCard title="Institution Directory" icon="🏦">
            <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h4 className="text-md font-semibold text-blue-800 mb-2">Detected Institution</h4>
              {result.institutionDetails ? (
                <div className="space-y-3">
                  <div className="flex items-center">
                    <div className="w-12 h-12 bg-blue-700 rounded-full flex items-center justify-center text-white font-bold text-xl mr-3">
                      {result.institutionDetails.shortName.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h5 className="text-blue-900 font-semibold text-lg">{result.institutionDetails.commonName}</h5>
                      <p className="text-sm text-blue-800">{result.institutionDetails.name}</p>
                    </div>
                    {result.isInstitutionLocallyValidated && (
                      <span className="ml-auto bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium">
                        Validated
                      </span>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-slate-500 font-medium">Institution #:</p>
                      <p className="font-mono text-blue-800">{result.institutionDetails.institutionNumber}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 font-medium">Type:</p>
                      <p className="text-blue-800">{result.institutionDetails.type}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 font-medium">Status:</p>
                      <p className={`${
                        result.institutionDetails.status === 'Active' ? 'text-green-600' : 
                        result.institutionDetails.status === 'Merged' || result.institutionDetails.status === 'Acquired' ? 'text-amber-600' : 
                        'text-red-600'
                      } font-medium`}>
                        {result.institutionDetails.status}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500 font-medium">CDIC Insured:</p>
                      <p className="text-blue-800">{result.institutionDetails.cdic ? 'Yes' : 'No'}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 font-medium">Regulator:</p>
                      <p className="text-blue-800">{result.institutionDetails.regulatoryBody}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 font-medium">Risk Profile:</p>
                      <p className={`font-medium ${
                        result.institutionDetails.riskProfile === 'Low' ? 'text-green-600' : 
                        result.institutionDetails.riskProfile === 'Medium' ? 'text-amber-600' : 
                        'text-red-600'
                      }`}>
                        {result.institutionDetails.riskProfile}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 mt-2">
                    <a 
                      href={result.institutionDetails.website} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors shadow-sm"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 mr-1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                      </svg>
                      Website
                    </a>
                    
                    {result.institutionDetails.customerService && (
                      <a 
                        href={`tel:${result.institutionDetails.customerService.replace(/\s/g, '')}`}
                        className="inline-flex items-center px-3 py-1.5 text-xs bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 mr-1.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                        </svg>
                        Customer Service
                      </a>
                    )}
                    
                    {result.institutionDetails.verificationPhone && (
                      <a 
                        href={`tel:${result.institutionDetails.verificationPhone.replace(/\s/g, '')}`}
                        className="inline-flex items-center px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded-md hover:bg-green-200 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 mr-1.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Verification Line
                      </a>
                    )}
                  </div>
                  
                  {result.institutionDetails.specialNotes && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800 mt-2">
                      <p className="font-medium">Special Notes:</p>
                      <p className="mt-0.5">{result.institutionDetails.specialNotes}</p>
                    </div>
                  )}
                </div>
              ) : result.aiInstitutionRecognition && result.aiInstitutionRecognition.recognizedInstitutionName ? (
                <div>
                  <p className="text-blue-800 font-medium">AI recognized institution: {result.aiInstitutionRecognition.recognizedInstitutionName}</p>
                  <p className="text-sm text-slate-600 mt-1">Confidence: {result.aiInstitutionRecognition.confidenceScore || 'N/A'}%</p>
                  
                  {result.aiInstitutionRecognition.institutionTypeGuess && (
                    <p className="text-sm text-slate-600">Type: {result.aiInstitutionRecognition.institutionTypeGuess}</p>
                  )}
                  
                  {result.aiInstitutionRecognition.visualElementsUsed && result.aiInstitutionRecognition.visualElementsUsed.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-slate-500">Visual elements used for identification:</p>
                      <ul className="list-disc list-inside text-xs text-slate-600 mt-0.5">
                        {result.aiInstitutionRecognition.visualElementsUsed.map((element, idx) => (
                          <li key={idx}>{element}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  <p className="text-xs text-amber-600 mt-3">Note: This institution was recognized by AI but not validated against the banking database.</p>
                </div>
              ) : result.transitNumber ? (
                <div>
                  <p className="text-amber-700 font-medium">
                    Institution not definitively identified
                  </p>
                  <p className="text-sm text-slate-600 mt-1">
                    Transit number: {result.transitNumber}
                  </p>
                  <p className="text-sm text-slate-600">
                    Institution code: {result.transitNumber.substring(5, 8)}
                  </p>
                  <p className="text-xs text-amber-600 mt-2">
                    The institution could not be conclusively identified. Consider searching the directory below.
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-red-600 font-medium">No institution detected</p>
                  <p className="text-sm text-slate-600 mt-1">No institution could be identified from this cheque</p>
                  <p className="text-xs text-red-600 mt-2">
                    This may indicate a non-standard cheque format or poor image quality. Consider manual verification.
                  </p>
                </div>
              )}
            </div>
            
            <h4 className="text-lg font-semibold text-blue-800 mb-3">Canadian Financial Institutions Directory</h4>
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