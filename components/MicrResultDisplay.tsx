import React, { useState, useCallback, useMemo } from 'react';
import { ChequeVerificationResult } from '../types.ts'; // Updated type
import { MICR_SYMBOLS_MAP } from '../constants.ts';

interface ChequeResultDisplayProps {
  result: ChequeVerificationResult;
  onCopyNotify?: (message: string, type: 'success' | 'error') => void; // Optional callback for copy notifications
}

type TabKey = 'overview' | 'security' | 'rawData';

interface RiskProfile {
  score: number;
  level: 'Low' | 'Medium' | 'High';
  issues: string[];
}

const formatMicrString = (micrString: string | null | undefined): React.ReactNode => {
  if (!micrString) return <span className="text-slate-500 italic">N/A</span>;
  
  let formatted = micrString;
  Object.entries(MICR_SYMBOLS_MAP).forEach(([key, symbol]) => {
    formatted = formatted.replace(new RegExp(key, 'g'), symbol);
  });

  return <span className="font-mono text-md break-all">{formatted}</span>;
};

const StatusIcon: React.FC<{ status: boolean | null | undefined, customText?: {true: string, false: string, null: string}, showText?: boolean }> = React.memo(({ status, customText, showText = false }) => {
  let icon: React.ReactNode;
  let colorClass = '';
  let text = '';

  if (status === true) {
    icon = <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 inline"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
    colorClass = 'text-green-600';
    text = customText?.true || "OK / Detected / Valid";
  } else if (status === false) {
    icon = <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 inline"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>;
    colorClass = 'text-red-600';
    text = customText?.false || "Issue / Not Detected / Invalid";
  } else {
    icon = <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 inline"><path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" /></svg>;
    colorClass = 'text-slate-500';
    text = customText?.null || "N/A / Not Determined";
  }
  return <span className={`ml-1 ${colorClass}`} title={text}>{icon} {showText && <span className="ml-1 text-sm">{text}</span>}</span>;
});


const MicrResultDisplayInner: React.FC<ChequeResultDisplayProps> = ({ result, onCopyNotify }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  const { 
    imageUrl, rawExtractedMicr, transitNumber, accountNumber, checkNumber, transactionCode,
    auxiliaryOnUs, transitNumberValid, payeeName, amountNumerals, amountWords, currencyDesignation,
    chequeDate, chequeDateValid, chequeDateFormatRecognized, printedDateIndicatorsPresent,
    isStaleDated, isPostDated, signaturePresent, voidPantographDetected, alterationsPayeeSuspected,
    alterationsAmountSuspected, inkColorAcceptable, designIssues, overallClarity, processingNotes
  } = result;

  const riskProfile: RiskProfile = useMemo(() => {
    let score = 0;
    const issues: string[] = [];

    if (transitNumberValid === false) { 
      score += 2; 
      issues.push("MICR Transit Number Invalid"); 
    }
    if (alterationsPayeeSuspected === true) { 
      score += 3; 
      issues.push("Suspected Payee Alteration"); 
    }
    if (alterationsAmountSuspected === true) { 
      score += 3; 
      issues.push("Suspected Amount Alteration"); 
    }
    if (isStaleDated === true) { 
      score += 1; 
      issues.push("Cheque Stale-Dated"); 
    }
    if (isPostDated === true) { 
      score += 2; 
      issues.push("Cheque Post-Dated"); 
    }
    if (signaturePresent === false) { 
      score += 2; 
      issues.push("Signature Not Detected"); 
    }
    if (voidPantographDetected === true) { 
      score += 1; 
      issues.push("Void Pantograph Suspected"); 
    }
    if (inkColorAcceptable === false) { 
      score += 1; 
      issues.push("Unsuitable Ink Color"); 
    }
    if (designIssues && designIssues.length > 0) { 
      score += 1; 
      issues.push(`Design/Clarity Issues (${designIssues.join(', ')})`); 
    }
    if (chequeDateValid === false) {
      score +=1;
      issues.push("Cheque Date Appears Invalid");
    }

    let level: 'Low' | 'Medium' | 'High';
    if (score >= 6) level = 'High';
    else if (score >= 3) level = 'Medium';
    else level = 'Low';

    return { score, level, issues };
  }, [ transitNumberValid, alterationsPayeeSuspected, alterationsAmountSuspected, isStaleDated, isPostDated, signaturePresent, voidPantographDetected, inkColorAcceptable, designIssues, chequeDateValid ]);

  const renderField = useCallback((label: string, value: string | number | boolean | null | undefined, options?: { mono?: boolean, status?: boolean | null | undefined, customStatusText?: {true: string, false: string, null: string}, highlight?: boolean }) => {
    let displayValue: React.ReactNode;
    let valueClasses = options?.mono ? "font-mono " : "";
    valueClasses += "break-words text-slate-800";
    if (options?.highlight) valueClasses += " p-1 rounded bg-sky-50";


    if (value === null || typeof value === 'undefined' || value === "") {
      displayValue = <span className="text-slate-500 italic">N/A</span>;
    } else if (typeof value === 'boolean') {
      displayValue = value ? "Yes" : "No";
    } else {
      displayValue = String(value);
    }
    
    return (
      <div className="py-2 border-b border-slate-200 last:border-b-0">
        <p className="text-sm font-medium text-slate-600 flex items-center">{label}
         {typeof options?.status !== 'undefined' && <StatusIcon status={options.status} customText={options.customStatusText} />}
        </p>
        <p className={valueClasses}>{displayValue}</p>
      </div>
    );
  }, []);
  
  const renderListField = useCallback((label: string, items: string[] | null | undefined) => {
    return (
      <div className="py-2 border-b border-slate-200 last:border-b-0">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        {items && items.length > 0 ? (
          <ul className="list-disc list-inside text-slate-800 text-sm">
            {items.map((item, index) => <li key={index}>{item}</li>)}
          </ul>
        ) : (
          <p className="text-slate-500 italic">None detected / N/A</p>
        )}
      </div>
    );
  }, []);

  const renderTransitDetails = useCallback(() => {
    let branchTransit: string | null = null;
    let institutionNo: string | null = null;
    let checkDigit: string | null = null;

    if (transitNumber && transitNumber.length === 9 && /^\d+$/.test(transitNumber) ) {
        branchTransit = transitNumber.substring(0, 5);
        institutionNo = transitNumber.substring(5, 8);
        checkDigit = transitNumber.substring(8, 9);
    }

    return (
        <div className="py-2 border-b border-slate-200 last:border-b-0">
            <p className="text-sm font-medium text-slate-600 flex items-center">
                Full MICR Routing String:
                <StatusIcon 
                    status={transitNumberValid} 
                    customText={{
                        true: "9-Digit Routing Valid (CPA Checksum)", 
                        false: "9-Digit Routing Invalid (CPA Checksum)", 
                        null: "Routing Not Validated / Not 9 Digits"
                    }}
                />
            </p>
            <p className="text-slate-800 font-mono break-words mb-1">
                {transitNumber || <span className="text-slate-500 italic">N/A</span>}
            </p>
            {branchTransit && institutionNo && (
                 <div className="pl-4 text-xs space-y-0.5 mt-1 text-slate-700">
                    <p><span className="font-semibold">Branch Transit (Cheque):</span> <span className="font-mono">{branchTransit}</span></p>
                    <p><span className="font-semibold">Financial Institution:</span> <span className="font-mono">{institutionNo}</span></p>
                    {checkDigit && <p><span className="font-semibold">Check Digit:</span> <span className="font-mono">{checkDigit}</span></p>}
                </div>
            )}
        </div>
    );
  }, [transitNumber, transitNumberValid]);

  const downloadFile = useCallback((content: string, fileName: string, contentType: string) => {
    const a = document.createElement("a");
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    document.body.appendChild(a); // Required for Firefox
    a.click();
    document.body.removeChild(a); // Clean up
    URL.revokeObjectURL(a.href);
  }, []);

  const handleExportJSON = useCallback(() => {
    downloadFile(JSON.stringify(result, null, 2), `cheque_analysis_${result.checkNumber || 'data'}.json`, 'application/json');
    setIsExportMenuOpen(false);
  }, [result, downloadFile]);

  const handleExportCSV = useCallback(() => {
    let csvContent = "Key,Value\n";
    for (const [key, value] of Object.entries(result)) {
      const stringValue = Array.isArray(value) ? JSON.stringify(value) : (value !== null && typeof value !== 'undefined' ? String(value) : '');
      csvContent += `"${key}","${stringValue.replace(/"/g, '""')}"\n`;
    }
    downloadFile(csvContent, `cheque_analysis_${result.checkNumber || 'data'}.csv`, 'text/csv');
    setIsExportMenuOpen(false);
  }, [result, downloadFile]);

  const handleCopySummary = useCallback(() => {
    const summary = `Cheque Analysis Summary:
---------------------------
Risk Level: ${riskProfile.level} (Score: ${riskProfile.score})
${riskProfile.issues.length > 0 ? 'Key Issues: ' + riskProfile.issues.join('; ') + '\n' : ''}
Payee Name: ${payeeName || 'N/A'}
Amount (Numerals): ${amountNumerals || 'N/A'}
Amount (Words): ${amountWords || 'N/A'}
Cheque Date: ${chequeDate || 'N/A'} (Valid: ${chequeDateValid === null ? 'N/A' : chequeDateValid})
Transit Number: ${transitNumber || 'N/A'} (Valid: ${transitNumberValid === null ? 'N/A' : transitNumberValid})
Account Number: ${accountNumber || 'N/A'}
Check Number: ${checkNumber || 'N/A'}
Raw MICR: ${rawExtractedMicr || 'N/A'}
---------------------------
Analysis performed on: ${new Date().toLocaleString()}
`;
    navigator.clipboard.writeText(summary)
      .then(() => {
        if (onCopyNotify) onCopyNotify("Summary copied to clipboard!", 'success');
        else alert("Summary copied to clipboard!");
      })
      .catch(err => {
        console.error("Failed to copy summary: ", err);
        if (onCopyNotify) onCopyNotify("Failed to copy summary.", 'error');
        else alert("Failed to copy summary.");
      });
    setIsExportMenuOpen(false);
  }, [riskProfile, payeeName, amountNumerals, amountWords, chequeDate, chequeDateValid, transitNumber, transitNumberValid, accountNumber, checkNumber, rawExtractedMicr, onCopyNotify]);
  
  const riskBannerClasses = useMemo(() => ({
    Low: 'bg-green-100 border-green-500 text-green-700',
    Medium: 'bg-yellow-100 border-yellow-500 text-yellow-700',
    High: 'bg-red-100 border-red-500 text-red-700',
  }), []);

  const renderOverviewTab = useCallback(() => (
    <div className="grid md:grid-cols-2 gap-x-6 gap-y-4 pt-4">
      <div className="space-y-4">
        <div>
          <h4 className="text-md font-semibold text-slate-700 mb-2">Cheque Image:</h4>
          <img 
            src={imageUrl} 
            alt="Uploaded Check" 
            className="rounded-md border border-slate-300 shadow-sm max-w-full h-auto max-h-96 object-contain"
          />
        </div>
        <section className="p-3 border border-slate-200 rounded-md bg-slate-50">
          <h4 className="text-md font-semibold text-slate-700 mb-2">Key Information:</h4>
          {renderField("Payee Name", payeeName, { highlight: true })}
          {renderField("Amount (Numerals)", amountNumerals, { mono: true, highlight: true })}
          {renderField("Amount (Words)", amountWords)}
          {renderField("Currency Designation", currencyDesignation)}
          {renderField("Cheque Date", chequeDate, {mono: true, status: chequeDateValid, customStatusText: {true: "Date Appears Valid", false: "Date Appears Invalid", null: "Date Validity Not Determined"}})}
        </section>
      </div>
      <div className="space-y-4">
         <section className="p-3 border border-slate-200 rounded-md bg-slate-50">
            <h4 className="text-md font-semibold text-slate-700 mb-2">MICR Line Details:</h4>
            <div className="py-2 border-b border-slate-200">
                <p className="text-sm font-medium text-slate-600">Raw Extracted MICR:</p>
                <div className="p-2 bg-white rounded border border-slate-300 mt-1">
                {formatMicrString(rawExtractedMicr)}
                </div>
            </div>
            {renderTransitDetails()}
            {renderField("Account Number", accountNumber, {mono: true, highlight: true})}
            {renderField("Cheque/Serial Number", checkNumber, {mono: true})}
            {renderField("MICR Transaction Code", transactionCode, {mono: true})}
            {renderField("Auxiliary On-Us / EPC", auxiliaryOnUs, {mono: true})}
          </section>
          {processingNotes && (
            <section className="p-3 border border-amber-200 rounded-md bg-amber-50">
              <h4 className="text-md font-semibold text-amber-700 mb-1">AI Processing Notes:</h4>
              <p className="text-xs text-amber-600 italic">{processingNotes}</p>
            </section>
          )}
      </div>
    </div>
  ), [imageUrl, payeeName, amountNumerals, amountWords, currencyDesignation, chequeDate, chequeDateValid, rawExtractedMicr, renderTransitDetails, accountNumber, checkNumber, transactionCode, auxiliaryOnUs, processingNotes, renderField]);

  const renderSecurityChecksTab = useCallback(() => (
    <div className="pt-4 space-y-4">
        <section className="p-3 border border-slate-200 rounded-md bg-slate-50">
            <h4 className="text-md font-semibold text-slate-700 mb-2">MICR & Transit Validation:</h4>
             {renderField("MICR Routing String Valid", transitNumberValid, {status: transitNumberValid, customStatusText: {true: "Valid (CPA Checksum)", false: "Invalid (CPA Checksum)", null: "Not Validated / Not 9 Digits"}})}
        </section>
        <section className="p-3 border border-slate-200 rounded-md bg-slate-50">
            <h4 className="text-md font-semibold text-slate-700 mb-2">Date Integrity:</h4>
            {renderField("Cheque Date Valid Format/Plausibility", chequeDateValid, {status: chequeDateValid, customStatusText: {true: "Date Appears Valid", false: "Date Appears Invalid", null: "Date Validity Not Determined"}})}
            {renderField("Recognized Date Format", chequeDateFormatRecognized)}
            {renderField("Printed Date Indicators (M D Y)", printedDateIndicatorsPresent, {status: printedDateIndicatorsPresent, customStatusText: {true: "Present", false: "Not Detected", null: "N/A"}})}
            {renderField("Stale-Dated (Over 6 months old)", isStaleDated, {status: isStaleDated === null ? null : !isStaleDated, customStatusText: { true: "Not Stale-Dated", false: "Potentially Stale-Dated", null: "Stale Date Check N/A"}})}
            {renderField("Post-Dated (Date in future)", isPostDated, {status: isPostDated === null ? null : !isPostDated, customStatusText: { true: "Not Post-Dated", false: "Post-Dated", null: "Post Date Check N/A"}})}
        </section>
        <section className="p-3 border border-slate-200 rounded-md bg-slate-50">
            <h4 className="text-md font-semibold text-slate-700 mb-2">Alterations & Authenticity:</h4>
            {renderField("Signature Presence", signaturePresent, {status: signaturePresent, customStatusText: {true: "Detected", false: "Not Detected", null: "N/A"}})}
            {renderField("Suspected Alteration in Payee", alterationsPayeeSuspected, {status: alterationsPayeeSuspected === null ? null : !alterationsPayeeSuspected, customStatusText: {true: "No Alterations Detected", false: "Alterations Suspected", null: "Alteration Check N/A"}})}
            {renderField("Suspected Alteration in Amount", alterationsAmountSuspected, {status: alterationsAmountSuspected === null ? null : !alterationsAmountSuspected, customStatusText: {true: "No Alterations Detected", false: "Alterations Suspected", null: "Alteration Check N/A"}})}
            {renderField("Void Pantograph Security Feature", voidPantographDetected, {status: voidPantographDetected, customStatusText: {true: "Void Pantograph Suspected", false: "Void Pantograph Not Suspected", null: "Void Pantograph Check N/A"}})}
            {renderField("Ink Color Acceptable (Dark)", inkColorAcceptable, {status: inkColorAcceptable, customStatusText: {true: "Acceptable", false: "Not Acceptable (e.g. light color)", null: "N/A"}})}
        </section>
        <section className="p-3 border border-slate-200 rounded-md bg-slate-50">
            <h4 className="text-md font-semibold text-slate-700 mb-2">Design & Clarity:</h4>
            {renderListField("Potential Design/Clarity Issues", designIssues)}
            {renderField("Overall Image Clarity for OCR", overallClarity)}
        </section>
    </div>
  ), [ transitNumberValid, chequeDateValid, chequeDateFormatRecognized, printedDateIndicatorsPresent, isStaleDated, isPostDated, signaturePresent, alterationsPayeeSuspected, alterationsAmountSuspected, voidPantographDetected, inkColorAcceptable, designIssues, overallClarity, renderField, renderListField ]);

  const renderRawDataTab = useCallback(() => (
    <div className="pt-4">
      <h4 className="text-md font-semibold text-slate-700 mb-2">Raw JSON Data:</h4>
      <pre className="bg-slate-800 text-slate-100 p-4 rounded-md text-xs overflow-x-auto max-h-96">
        {JSON.stringify(result, null, 2)}
      </pre>
    </div>
  ), [result]);

  const tabCommonClasses = "py-2 px-4 font-medium text-sm rounded-t-lg transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-400";
  const activeTabClasses = "bg-blue-600 text-white";
  const inactiveTabClasses = "text-slate-600 hover:bg-slate-200 hover:text-slate-800";
  
  return (
    <div className="mt-6 bg-white shadow-lg rounded-lg">
      <div className={`p-4 border-b-4 ${riskBannerClasses[riskProfile.level]}`}>
        <div className="flex justify-between items-center">
            <h3 className="text-xl font-semibold ">Overall Risk Assessment: {riskProfile.level}</h3>
            <span className="text-sm font-medium">(Score: {riskProfile.score})</span>
        </div>
        {riskProfile.issues.length > 0 && (
          <div className="mt-1 text-xs">
            <strong className="block">Key Issues Detected:</strong>
            <ul className="list-disc list-inside ml-1">
              {riskProfile.issues.slice(0,3).map(issue => <li key={issue}>{issue}</li>)}
              {riskProfile.issues.length > 3 && <li>And {riskProfile.issues.length - 3} more... (see Security Checks tab)</li>}
            </ul>
          </div>
        )}
      </div>
      
      <div className="p-4 sm:p-6">
        <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold text-slate-800">Cheque Analysis Details</h3>
            <div className="relative">
                <button
                    onClick={() => setIsExportMenuOpen(prev => !prev)}
                    className="bg-slate-600 hover:bg-slate-700 text-white font-semibold py-2 px-3 rounded-md text-xs transition duration-150 ease-in-out flex items-center"
                    aria-haspopup="true"
                    aria-expanded={isExportMenuOpen}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                    Export Options
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-3 h-3 ml-1.5 transform transition-transform duration-200 ${isExportMenuOpen ? 'rotate-180' : ''}`}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                </button>
                {isExportMenuOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-xl z-20 py-1 border border-slate-200">
                        <button onClick={handleCopySummary} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 flex items-center"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" /></svg>Copy Summary</button>
                        <button onClick={handleExportJSON} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 flex items-center"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>Export as JSON</button>
                        <button onClick={handleExportCSV} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 flex items-center"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-2"><path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5V7.5M10.5 19.5V7.5m0 12V3.375M3.375 7.5h7.125M10.5 3.375h7.125M3.375 3.375c0-1.036.84-1.875 1.875-1.875h13.5c1.035 0 1.875.84 1.875 1.875v1.875M17.625 7.5c.621 0 1.125.504 1.125 1.125v9.75M17.625 7.5h-1.875" /></svg>Export as CSV</button>
                    </div>
                )}
            </div>
        </div>

        <div className="border-b border-slate-300">
            <nav className="-mb-px flex space-x-1" aria-label="Tabs">
            {(['overview', 'security', 'rawData'] as TabKey[]).map((tab) => (
                <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`${tabCommonClasses} ${activeTab === tab ? activeTabClasses : inactiveTabClasses}`}
                aria-current={activeTab === tab ? 'page' : undefined}
                >
                {tab === 'overview' && <><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-1.5 inline-block"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>Overview</>}
                {tab === 'security' && <><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-1.5 inline-block"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>Security Checks</>}
                {tab === 'rawData' && <><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-1.5 inline-block"><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" /></svg>Raw Data</>}
                </button>
            ))}
            </nav>
        </div>

        <div className="mt-1">
            {activeTab === 'overview' && renderOverviewTab()}
            {activeTab === 'security' && renderSecurityChecksTab()}
            {activeTab === 'rawData' && renderRawDataTab()}
        </div>
      </div>
    </div>
  );
};

// Wrap the display component with React.memo for performance optimization
const MicrResultDisplay = React.memo(MicrResultDisplayInner);
export default MicrResultDisplay;