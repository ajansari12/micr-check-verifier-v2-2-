
import React, { useState, useCallback, useMemo } from 'react';
import { ChequeVerificationResult, ReportType, ReportOptions, GeneratedReportData, CanadianInstitution } from '../types';
import LoadingSpinner from './LoadingSpinner';
import { CANADIAN_FINANCIAL_INSTITUTIONS } from '../constants';

interface ComplianceReportGeneratorProps {
  chequeResults: ChequeVerificationResult[] | null; // Array for batch, single item array for individual
  onClose: () => void;
  // onGenerateReport?: (type: ReportType, options: ReportOptions) => Promise<GeneratedReportData>; // For future async generation
}

const ComplianceReportGenerator: React.FC<ComplianceReportGeneratorProps> = ({
  chequeResults,
  onClose,
}) => {
  const [selectedReportType, setSelectedReportType] = useState<ReportType>('IndividualCheque');
  const [reportOptions, setReportOptions] = useState<ReportOptions>({
    template: 'technical',
    includeSensitiveData: true,
    language: 'en',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [generatedReportPreview, setGeneratedReportPreview] = useState<GeneratedReportData | null>(null);

  const availableReportTypes: { value: ReportType; label: string; disabled?: boolean }[] = [
    { value: 'IndividualCheque', label: 'Individual Cheque Verification Report' },
    { value: 'BatchSummary', label: 'Batch Processing Summary' },
    { value: 'ComplianceAudit', label: 'Compliance Audit Report (Placeholder)', disabled: true },
    { value: 'SecurityIncident', label: 'Security Incident Report (Placeholder)', disabled: true },
    { value: 'PerformanceMetrics', label: 'Performance Metrics Report (Placeholder)', disabled: true },
  ];

  const generatePreview = useCallback(() => {
    if (!chequeResults || chequeResults.length === 0) {
      setGeneratedReportPreview(null);
      return;
    }
    setIsLoading(true);

    let reportData: Partial<GeneratedReportData> = {
      reportId: `REP-${Date.now()}`,
      reportType: selectedReportType,
      generatedOn: new Date().toISOString(),
      reportOptionsApplied: reportOptions,
    };

    const result = chequeResults[0]; // For individual report preview

    switch (selectedReportType) {
      case 'IndividualCheque':
        if (!result) {
             setGeneratedReportPreview({
                ...reportData,
                title: "Individual Cheque Report - No Data",
                sections: [{ title: "Error", content: "No cheque data provided for individual report." }]
            } as GeneratedReportData);
            setIsLoading(false);
            return;
        }
        reportData.title = `Individual Cheque Verification Report - ID ${result.verificationId || 'N/A'}`;
        reportData.dataSourceDescription = `Based on Cheque Image: ${result.imageUrl.substring(0,30)}...`;
        reportData.executiveSummary = `Verification for cheque (Amount: ${result.amountNumerals || 'N/A'}) resulted in an overall risk level of ${result.securityAssessment?.fraudRiskLevel || 'Unknown'}. CPA006 Image Compliance: ${result.cpaImageQuality?.cpaStandard006Compliant ?? 'Unknown'}.`;
        reportData.sections = [
          { title: "Cheque Details", content: { Payee: result.payeeName, Amount: result.amountNumerals, Date: result.chequeDate, Currency: result.currencyDesignation } },
          { title: "MICR Information", content: { ...result.micrValidation, RawMICR: result.rawExtractedMicr, FI: result.institutionDetails?.name } },
          { title: "Image Quality (CPA006)", content: result.cpaImageQuality },
          { title: "Security Assessment", content: result.securityAssessment },
          { title: "AI Fraud Risk", content: result.aiFraudRiskAssessment },
          { title: "AI Compliance Checks", content: result.aiComplianceAnalysis },
          { title: "AI Institution Recognition", content: result.aiInstitutionRecognition },
          { title: "Processing Notes", content: result.processingNotes || "None." },
        ];
        break;
      case 'BatchSummary':
        reportData.title = `Batch Cheque Processing Summary - ${chequeResults.length} Cheques`;
        reportData.dataSourceDescription = `Based on a batch of ${chequeResults.length} cheques.`;
        const riskCounts = chequeResults.reduce((acc, r) => {
          const level = r.securityAssessment?.fraudRiskLevel || 'Unknown';
          acc[level] = (acc[level] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        const compliantCount = chequeResults.filter(r => r.cpaImageQuality?.cpaStandard006Compliant).length;
        reportData.executiveSummary = `${chequeResults.length} cheques processed. ${compliantCount} CPA006 compliant. Risk distribution: ${JSON.stringify(riskCounts)}.`;
        reportData.sections = [
          { title: "Batch Statistics", content: { TotalCheques: chequeResults.length, CPACompliant: compliantCount, RiskCounts: riskCounts } },
          { title: "High Risk Cheques (IDs)", content: chequeResults.filter(r => r.securityAssessment?.fraudRiskLevel === 'High' || r.securityAssessment?.fraudRiskLevel === 'Critical').map(r => r.verificationId || 'Unknown ID').join(', ') || "None" },
        ];
        break;
      default:
        reportData.title = `${selectedReportType} - Not Implemented`;
        reportData.sections = [{ title: "Content", content: "This report type is not fully implemented for preview." }];
        break;
    }
    setGeneratedReportPreview(reportData as GeneratedReportData);
    setIsLoading(false);
  }, [selectedReportType, reportOptions, chequeResults]);

  // Generate preview when type or results change
  React.useEffect(() => {
    generatePreview();
  }, [generatePreview]);

  const handleExportJSON = () => {
    if (!generatedReportPreview) return;
    const jsonString = JSON.stringify(generatedReportPreview, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `${generatedReportPreview.reportType}_${generatedReportPreview.reportId}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
    alert("JSON report download initiated.");
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow && generatedReportPreview) {
        const { title, executiveSummary, sections, generatedOn, reportId } = generatedReportPreview;
        let content = `<html><head><title>${title}</title><style>body{font-family:Arial,sans-serif;margin:20px;} h1,h2,h3{color:#1e3a8a;} table{width:100%;border-collapse:collapse;margin-bottom:15px;} th,td{border:1px solid #ddd;padding:8px;text-align:left;} th{background-color:#f0f8ff;} pre{background-color:#f5f5f5;padding:10px;border-radius:4px;overflow-x:auto;}</style></head><body>`;
        content += `<h1>${title}</h1><p><em>Report ID: ${reportId} | Generated: ${new Date(generatedOn).toLocaleString()}</em></p>`;
        if(executiveSummary) content += `<h2>Executive Summary</h2><p>${executiveSummary}</p>`;

        sections?.forEach(section => {
            content += `<h2>${section.title}</h2>`;
            if (typeof section.content === 'string' || typeof section.content === 'number' || typeof section.content === 'boolean') {
                content += `<p>${String(section.content)}</p>`;
            } else if (section.content && typeof section.content === 'object') {
                content += '<table>';
                for (const [key, value] of Object.entries(section.content)) {
                    content += `<tr><th>${key.replace(/([A-Z])/g, ' $1').trim()}</th><td>${value !== null && typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? 'N/A')}</td></tr>`;
                }
                content += '</table>';
            } else {
                content += '<p>N/A</p>';
            }
        });
        content += '</body></html>';
        printWindow.document.write(content);
        printWindow.document.close();
        printWindow.print();
    } else {
        alert("Could not open print window or no report to print.");
    }
};


  const renderReportPreview = () => {
    if (isLoading) return <div className="text-center p-10"><LoadingSpinner /> <p className="mt-2 text-slate-600">Generating preview...</p></div>;
    if (!generatedReportPreview) return <div className="text-center p-10 text-slate-500">Select report type and ensure data is available.</div>;

    const { title, executiveSummary, sections, generatedOn, reportId } = generatedReportPreview;
    return (
      <div id="report-preview-content" className="p-4 border border-slate-300 rounded-md bg-white max-h-[70vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-blue-800 mb-2">{title}</h2>
        <p className="text-xs text-slate-500 mb-3">Report ID: {reportId} | Generated: {new Date(generatedOn).toLocaleString()}</p>
        {executiveSummary && (
          <div className="mb-4 p-3 bg-blue-50 rounded border border-blue-100">
            <h3 className="text-md font-semibold text-blue-700 mb-1">Executive Summary</h3>
            <p className="text-sm text-slate-700">{executiveSummary}</p>
          </div>
        )}
        {sections?.map((section, index) => (
          <div key={index} className="mb-3">
            <h3 className="text-md font-semibold text-blue-700 border-b border-blue-200 pb-1 mb-1">{section.title}</h3>
            {typeof section.content === 'string' && <p className="text-sm text-slate-600">{section.content}</p>}
            {typeof section.content === 'object' && section.content !== null && (
              <div className="text-sm text-slate-600 space-y-1">
                {Object.entries(section.content).map(([key, value]) => (
                  <div key={key} className="grid grid-cols-3 gap-2">
                    <strong className="text-slate-500 col-span-1">{key.replace(/([A-Z])/g, ' $1').trim()}:</strong>
                    <span className="col-span-2 break-words">
                      {value !== null && typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? 'N/A')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };
  
  const commonButtonClasses = "px-4 py-2 text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 print:static print:bg-transparent print:p-0">
      <div className="bg-slate-50 rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col print:shadow-none print:border-0 print:max-h-full">
        {/* Header */}
        <header className="p-4 border-b border-slate-200 flex justify-between items-center print:hidden">
          <h2 className="text-xl font-semibold text-blue-800">Compliance Report Generator</h2>
          <button onClick={onClose} className="p-1 text-slate-500 hover:text-slate-700">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </header>

        {/* Main Content */}
        <main className="flex-grow p-4 overflow-y-auto space-y-4 print:overflow-visible">
          {/* Report Type and Options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:hidden">
            <div>
              <label htmlFor="reportType" className="block text-sm font-medium text-slate-700 mb-1">Report Type</label>
              <select
                id="reportType"
                value={selectedReportType}
                onChange={(e) => setSelectedReportType(e.target.value as ReportType)}
                className="block w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
              >
                {availableReportTypes.map(rt => (
                  <option key={rt.value} value={rt.value} disabled={rt.disabled}>{rt.label}</option>
                ))}
              </select>
            </div>
            {/* Placeholder for other options */}
            <div className="p-3 bg-slate-100 border border-slate-200 rounded-md">
              <h4 className="text-sm font-medium text-slate-700 mb-1">Customization (Placeholders)</h4>
              <div className="space-y-1 text-xs text-slate-500">
                <p>- Template: Executive, Technical</p>
                <p>- Language: English, French</p>
                <p>- Include Sensitive Data: Yes/No</p>
              </div>
            </div>
          </div>
          
          {/* Report Preview Section */}
          <div className="print:p-0">
            <h3 className="text-md font-semibold text-blue-700 mb-2 print:hidden">Report Preview</h3>
            {renderReportPreview()}
          </div>
        </main>

        {/* Footer Actions */}
        <footer className="p-4 border-t border-slate-200 flex flex-wrap justify-end gap-2 print:hidden">
          <button onClick={handleExportJSON} disabled={!generatedReportPreview} className={`${commonButtonClasses} bg-green-600 hover:bg-green-700 text-white focus:ring-green-500 disabled:bg-slate-300`}>Export JSON</button>
          <button onClick={() => alert("PDF Export Simulation: Report generation for PDF would occur here.")} disabled={!generatedReportPreview} className={`${commonButtonClasses} bg-slate-200 hover:bg-slate-300 text-slate-700 focus:ring-slate-400 disabled:bg-slate-300`}>Export PDF (Sim)</button>
          <button onClick={() => alert("Excel Export Simulation: Report generation for Excel would occur here.")} disabled={!generatedReportPreview} className={`${commonButtonClasses} bg-slate-200 hover:bg-slate-300 text-slate-700 focus:ring-slate-400 disabled:bg-slate-300`}>Export Excel (Sim)</button>
          <button onClick={handlePrint} disabled={!generatedReportPreview} className={`${commonButtonClasses} bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500 disabled:bg-slate-300`}>Print Report</button>
        </footer>
      </div>
    </div>
  );
};

export default ComplianceReportGenerator;