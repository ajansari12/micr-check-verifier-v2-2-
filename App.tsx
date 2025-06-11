import React, { useState, useEffect, useCallback, Profiler, ProfilerOnRenderCallback, useMemo } from 'react';
// Components
import LoadingSpinner from '@/components/LoadingSpinner';
import CanadianBankingAlerts from '@/components/CanadianBankingAlerts';
import { CanadianBankingAlertInfoProps } from '@/components/CanadianBankingAlerts'; 
import ErrorBoundary from '@/components/ErrorBoundary';
import BankingHeader from '@/components/BankingHeader';
import VerificationWizard from '@/components/VerificationWizard';
import ComplianceReportGenerator from '@/components/ComplianceReportGenerator'; 
import OperationsDashboard from '@/components/OperationsDashboard'; 
import InstitutionSearchWidget from '@/components/InstitutionSearchWidget'; 

// Services & Utils
import { 
  analyzeChequeDetails, 
  analyzeSecurityFeaturesAI,
  analyzeCanadianBankingComplianceAI,
  detectCanadianInstitutionAI,
  assessFraudRiskAI,
  generateDecisionIntelligenceAI // New
} from './services/geminiService.ts';
import {
  loadImageFromFile,
  detectImageQuality, 
  preprocessImage,
  blobToBase64Data,
  ImageQualityReport,
  detectCanadianChequeImageQuality
} from './utils/imageUtils.ts';
import * as micrValidationService from './services/micrValidationService.ts';
import { enhanceMicrWithBankingData, assessInstitutionRisk as assessDbInstitutionRisk, CanadianInstitution } from './services/canadianBankingDatabase.ts'; 
// Types
import { 
  ChequeVerificationResult,
  MicrValidationFields,
  EnhancedMicrContext,
  InstitutionRiskAssessment,
  ChequeBatch, 
  BatchCheque,
  ChequeData, // For initial AI results
  InstitutionContextForDecision, // New
  DecisionIntelligence, // New
  ContactInfo, // New
  SecurityAssessment, // Ensure it's imported if not already
  ComplianceAnalysisResult,
  InstitutionRecognitionResult,
  FraudRiskAssessment as AIFraudRiskAssessment // Alias to avoid conflict with DB one if any
} from './types.ts';


const onRenderCallback: ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime
) => {
  // console.log(`Profiler [${id}]: phase=${phase}, actualDuration=${actualDuration.toFixed(2)}ms, baseDuration=${baseDuration.toFixed(2)}ms, startTime=${startTime.toFixed(2)}, commitTime=${commitTime.toFixed(2)}`);
};

type AppMode = 'idle' | 'wizardActive';
type AppOperatingMode = 'single' | 'batch';

const App: React.FC = () => {
  // Single Cheque Mode States
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [imageBase64Preview, setImageBase64Preview] = useState<string | null>(null);
  const [imageBase64ForApi, setImageBase64ForApi] = useState<string | null>(null);
  const [imageQualityReportForWizard, setImageQualityReportForWizard] = useState<ImageQualityReport | null>(null);
  const [htmlImageElementForAnalysis, setHtmlImageElementForAnalysis] = useState<HTMLImageElement | null>(null);
  const [chequeResult, setChequeResult] = useState<ChequeVerificationResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false); 
  const [isProcessingImage, setIsProcessingImage] = useState<boolean>(false); 
  const [alertInfo, setAlertInfo] = useState<CanadianBankingAlertInfoProps | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [appMode, setAppMode] = useState<AppMode>('idle');
  const [wizardActiveStep, setWizardActiveStep] = useState<number>(1);
  const [userConsentGiven, setUserConsentGiven] = useState<boolean>(false);
  const [isReportingModeActive, setIsReportingModeActive] = useState<boolean>(false); 

  // Batch Operations Mode States
  const [appOperatingMode, setAppOperatingMode] = useState<AppOperatingMode>('single');
  const [mockBatches, setMockBatches] = useState<ChequeBatch[]>([]);
  const [isUploadingBatchGlobal, setIsUploadingBatchGlobal] = useState<boolean>(false);


  useEffect(() => {
    const mobileCheck = navigator.maxTouchPoints > 0 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    setIsMobile(mobileCheck);
  }, []);

  const clearImage = useCallback(() => {
    setSelectedImageFile(null);
    setImageBase64Preview(null);
    setImageBase64ForApi(null);
    setChequeResult(null);
    setHtmlImageElementForAnalysis(null);
    setImageQualityReportForWizard(null);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  }, []);

  const handleImageSelected = useCallback(async (file: File, base64PreviewUrl: string) => {
    setSelectedImageFile(file);
    setImageBase64Preview(base64PreviewUrl);
    setChequeResult(null);
    setAlertInfo({ title: "Processing Image", message: "Validating and preparing image for analysis...", type: 'info', autoDismiss: true, autoDismissDelay: 3000, onDismiss: () => setAlertInfo(null) });
    setIsProcessingImage(true);
    setImageQualityReportForWizard(null);
    setHtmlImageElementForAnalysis(null);

    try {
      const imageElement = await loadImageFromFile(file);
      setHtmlImageElementForAnalysis(imageElement); 
      const qualityReport = await detectImageQuality(imageElement, file.name);
      setImageQualityReportForWizard(qualityReport);
      
      if (qualityReport.overallAssessment !== 'good') {
        setAlertInfo({
          title: `Image Quality: ${qualityReport.overallAssessment.toUpperCase()}`,
          message: `${qualityReport.suggestions.slice(0,1).join(' ')} Review suggestions in Step 3.`,
          type: qualityReport.overallAssessment === 'poor' ? 'warning' : 'info',
          autoDismiss: true, autoDismissDelay: 7000, onDismiss: () => setAlertInfo(null)
        });
      }

      const preprocessedBlob = await preprocessImage(file, {
        maxWidth: 1920, maxHeight: 1080, quality: 0.92, targetMimeType: 'image/jpeg',
      });
      const base64ApiData = await blobToBase64Data(preprocessedBlob);
      setImageBase64ForApi(base64ApiData);
      setWizardActiveStep(3); 
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setAlertInfo({ title: "Image Processing Error", message: `Failed to process image: ${errorMessage}. Please try again or use a different image.`, type: 'critical', onDismiss: () => setAlertInfo(null) });
      setImageBase64ForApi(null);
      setHtmlImageElementForAnalysis(null);
      setImageQualityReportForWizard(null);
    } finally {
      setIsProcessingImage(false);
    }
  }, []);

  const handleCopyNotification = useCallback((message: string, type: 'warning' | 'success' | 'info' | 'error') => {
    const alertType: CanadianBankingAlertInfoProps['type'] = type === 'error' ? 'critical' : type;
    setAlertInfo({ 
        title: type === 'success' ? "Copied!" : type === 'error' ? "Copy Failed" : "Info", 
        message, 
        type: alertType, 
        autoDismiss: true, 
        autoDismissDelay: 3000, 
        onDismiss: () => setAlertInfo(null) 
    });
  }, []);

  const processCheckImage = useCallback(async (isReanalysis = false) => {
    if (!imageBase64ForApi || !selectedImageFile || !htmlImageElementForAnalysis) {
      setAlertInfo({ title: "Image Not Ready", message: "Image data is not fully prepared. Please complete image selection.", type: 'warning', autoDismiss: true, autoDismissDelay: 5000, onDismiss: () => setAlertInfo(null) });
      return;
    }
    
    setIsLoading(true);
    if (appOperatingMode === 'single') setWizardActiveStep(4); 
    setAlertInfo({ title: "Comprehensive Analysis Started", message: "Analyzing cheque with AI and cross-referencing banking data...", type: 'info', autoDismiss: false, onDismiss: () => setAlertInfo(null) });
    
    if (!isReanalysis) setChequeResult(null); 
    
    try {
      // 1. Initial AI Analyses
      const [
        baseChequeData, 
        securityData, 
        complianceData, 
        institutionDataAI, 
        fraudDataAI
      ] = await Promise.all([
        analyzeChequeDetails(imageBase64ForApi),
        analyzeSecurityFeaturesAI(imageBase64ForApi),
        analyzeCanadianBankingComplianceAI(imageBase64ForApi),
        detectCanadianInstitutionAI(imageBase64ForApi),
        assessFraudRiskAI(imageBase64ForApi)
      ]);

      const initialAggregatedAiResult: Partial<ChequeVerificationResult> = {
        ...baseChequeData,
        securityAssessment: securityData,
        aiComplianceAnalysis: complianceData,
        aiInstitutionRecognition: institutionDataAI,
        aiFraudRiskAssessment: fraudDataAI,
      };

      // 2. Enhance with Canadian Banking Database
      const bankingEnhancement = enhanceMicrWithBankingData(initialAggregatedAiResult);
      const institutionDetailsFromDb = bankingEnhancement.institutionValidation.institution;

      // 3. Generate Decision Intelligence
      let decisionIntel: DecisionIntelligence | null = null;
      const institutionContextForDecision: InstitutionContextForDecision | null = institutionDetailsFromDb ? {
        bankName: institutionDetailsFromDb.commonName,
        institutionRiskProfile: institutionDetailsFromDb.riskProfile === 'Low' ? 'Standard' : institutionDetailsFromDb.riskProfile === 'Medium' ? 'Enhanced Monitoring' : 'High Risk',
        recentIssuesWithInstitution: institutionDetailsFromDb.specialNotes ? [institutionDetailsFromDb.specialNotes.substring(0,150) + (institutionDetailsFromDb.specialNotes.length > 150 ? '...' : '')] : [], // Simplified
        keyVerificationContacts: [
          ...(institutionDetailsFromDb.customerService ? [{ type: 'Customer Service' as const, method: 'Phone' as const, details: institutionDetailsFromDb.customerService }] : []),
          ...(institutionDetailsFromDb.verificationPhone ? [{ type: 'Verification' as const, method: 'Phone' as const, details: institutionDetailsFromDb.verificationPhone }] : []),
          ...(institutionDetailsFromDb.fraudReportingPhone ? [{ type: 'Fraud Department' as const, method: 'Phone' as const, details: institutionDetailsFromDb.fraudReportingPhone }] : []),
        ],
      } : null;
      
      // Pass a summary of findings for Decision Intelligence
      const findingsForDecisionAI: Partial<ChequeData> = {
        transitNumber: baseChequeData.transitNumber,
        transitNumberValid: baseChequeData.transitNumberValid,
        payeeName: baseChequeData.payeeName,
        amountNumerals: baseChequeData.amountNumerals,
        chequeDate: baseChequeData.chequeDate,
        chequeDateValid: baseChequeData.chequeDateValid,
        signaturePresent: baseChequeData.signaturePresent,
        alterationsAmountSuspected: baseChequeData.alterationsAmountSuspected,
        alterationsPayeeSuspected: baseChequeData.alterationsPayeeSuspected,
        // Add key flags from securityData, fraudDataAI etc. if needed by decision prompt
        processingNotes: `Initial Security Risk: ${securityData?.fraudRiskLevel}, AI Fraud Risk: ${fraudDataAI?.riskLevel}`
      };

      decisionIntel = await generateDecisionIntelligenceAI(findingsForDecisionAI, institutionContextForDecision);
      
      // 4. Client-side Date Calculations
      let isStale: boolean | null = null;
      let isPost: boolean | null = null;
      if (baseChequeData.chequeDate && typeof baseChequeData.chequeDate === 'string' && baseChequeData.chequeDateValid !== false) {
         try { 
            const parts = baseChequeData.chequeDate.split(/[-/. :]/);
            if (parts.length === 3) {
                const year = parseInt(parts[0]); const month = parseInt(parts[1]) -1; const day = parseInt(parts[2]);
                 if (!isNaN(year) && !isNaN(month) && !isNaN(day) && year > 1000 && month >=0 && month <=11 && day >=1 && day <=31) {
                    const chequeDateObj = new Date(year, month, day);
                    if (chequeDateObj.getFullYear() === year && chequeDateObj.getMonth() === month && chequeDateObj.getDate() === day) {
                        const today = new Date(); today.setHours(0,0,0,0);
                        chequeDateObj.setHours(0,0,0,0);
                        const sixMonthsAgo = new Date(today); sixMonthsAgo.setMonth(today.getMonth() - 6);
                        isStale = chequeDateObj < sixMonthsAgo;
                        isPost = chequeDateObj > today;
                    }
                }
            }
         } catch (e) { console.warn("Client-side date validation error:", e); }
      }

      // 5. Client-side MICR Checksum Validation
      const micrValidationFields: MicrValidationFields | null = baseChequeData.transitNumber
        ? {
            transitNumber: baseChequeData.transitNumber,
            transitNumberCpaChecksumValid: micrValidationService.validateTransitNumber(baseChequeData.transitNumber).isValid,
            checkDigitValid: baseChequeData.transitNumber.length === 9 ? micrValidationService.validateTransitNumber(baseChequeData.transitNumber).calculatedCheckDigit === baseChequeData.transitNumber.charAt(8) : null,
            accountNumber: baseChequeData.accountNumber,
            checkNumber: baseChequeData.checkNumber,
            transactionCode: baseChequeData.transactionCode || null,
            e13bFontEncodingCompliant: null, 
            cpaStandard006TransactionCodeKnown: null,
          }
        : null;
      
      // 6. CPA Image Quality (Client-side)
      const cpaQualityData = await detectCanadianChequeImageQuality(htmlImageElementForAnalysis);

      // 7. Aggregate all results
      const fullResult: ChequeVerificationResult = {
        ...(initialAggregatedAiResult as ChequeData), // Base AI data
        securityAssessment: securityData,
        aiComplianceAnalysis: complianceData,
        aiInstitutionRecognition: institutionDataAI,
        aiFraudRiskAssessment: fraudDataAI,
        
        isStaleDated: isStale, 
        isPostDated: isPost,   
        imageUrl: imageBase64Preview!,
        verificationId: `VER-${Date.now()}-${Math.random().toString(36).substring(2,7)}`,
        processingTimestamp: new Date().toISOString(),
        
        cpaImageQuality: cpaQualityData,
        micrValidation: micrValidationFields, 
        
        institutionDetails: institutionDetailsFromDb,
        bankingIntelligence: bankingEnhancement,
        isInstitutionLocallyValidated: bankingEnhancement.institutionValidation.isValid,
        institutionalRiskAssessment: institutionDetailsFromDb ?
          assessDbInstitutionRisk(institutionDetailsFromDb) : null,
        
        decisionIntelligence: decisionIntel, // << ADDED THE NEW DECISION INTELLIGENCE
      };

      setChequeResult(fullResult);
      setAlertInfo({ title: "Analysis Complete", message: fullResult.decisionIntelligence?.summaryStatement || "Cheque analysis successful. Review the results.", type: 'success', autoDismiss: true, autoDismissDelay: 7000, onDismiss: () => setAlertInfo(null) });
      if (appOperatingMode === 'single') setWizardActiveStep(5);
    } catch (err: any) {
      console.error("Error processing check image:", err);
      let errorMessage = "An error occurred during Cheque analysis. ";
      if (err.message) errorMessage += err.message;
      else if (typeof err === 'string') errorMessage += err;
      let errorDetails = `Stack Trace: ${err.stack || 'Not available'}`;
      if (err.response && err.response.data) errorDetails += `\nResponse Data: ${JSON.stringify(err.response.data)}`;
      
      setAlertInfo({ 
        title: "Analysis Failed", message: errorMessage, type: 'critical', details: errorDetails, 
        actions: [{ label: "Retry Analysis", onClick: () => processCheckImage(true), type: 'primary' }],
        onDismiss: () => setAlertInfo(null) 
      });
      if (appOperatingMode === 'single') setWizardActiveStep(5); 
    } finally {
      setIsLoading(false);
    }
  }, [imageBase64ForApi, selectedImageFile, imageBase64Preview, htmlImageElementForAnalysis, appOperatingMode]);

  const errorBoundaryFallback = (
    <div className="p-4 my-6 text-center bg-red-50 border border-red-200 rounded-lg">
      <h2 className="text-xl font-semibold text-red-700">Application Error</h2>
      <p className="text-red-600">Sorry, something went wrong. Please try refreshing the page.</p>
    </div>
  );

  const headerProcessingStatus = useMemo(() => isLoading || isProcessingImage || isUploadingBatchGlobal, [isLoading, isProcessingImage, isUploadingBatchGlobal]);
  
  const bankingHeaderComplianceStatus = useMemo((): 'critical' | 'warning' | 'compliant' | 'unknown' => {
    if (appOperatingMode === 'batch' || !chequeResult || !chequeResult.decisionIntelligence) return 'unknown';
    
    const decisionRisk = chequeResult.decisionIntelligence.overallRiskAssessment.riskLevel;
    if (decisionRisk === 'Reject' || decisionRisk === 'Investigate') return 'critical'; // Maps to 'non-compliant' for header
    if (decisionRisk === 'Review') return 'warning';
    if (decisionRisk === 'Accept') return 'compliant';
    return 'unknown';
  }, [chequeResult, appOperatingMode]);

  const headerOsfiCompliant = useMemo(() => {
    if (appOperatingMode === 'batch' || !chequeResult ) return true; // Default to compliant if no data or in batch mode
    if (chequeResult.decisionIntelligence) {
        const decisionRisk = chequeResult.decisionIntelligence.overallRiskAssessment.riskLevel;
        if (decisionRisk === 'Reject' || decisionRisk === 'Investigate') return false; // These imply OSFI-level concerns
    }
    // Fallback to older logic if decisionIntelligence is not present, though it should be
    return !(chequeResult.securityAssessment?.osfiReportableRisk);
  }, [chequeResult, appOperatingMode]);

  const handleStartVerification = () => {
    clearImage(); 
    setUserConsentGiven(false); 
    setWizardActiveStep(1); 
    setAppMode('wizardActive');
  };
  
  const resetWizardAndApp = () => {
    clearImage();
    setUserConsentGiven(false);
    setWizardActiveStep(1);
    setAppMode('idle');
    setAlertInfo(null);
    setIsReportingModeActive(false);
  }

  const handleHeaderExportClick = () => {
    if (appOperatingMode === 'single' && chequeResult) {
        setIsReportingModeActive(true);
    } else if (appOperatingMode === 'batch') {
        setAlertInfo({title: "Batch Reporting", message: "Batch report generation will be available from the Operations Dashboard.", type: 'info', autoDismiss: true, autoDismissDelay: 4000, onDismiss: () => setAlertInfo(null)});
    } else {
        setAlertInfo({title: "No Data to Report", message: "Please verify a cheque first to generate a report.", type: 'info', autoDismiss: true, autoDismissDelay: 3000, onDismiss: () => setAlertInfo(null)});
    }
  };

  const handleHeaderModeSwitch = (mode: AppOperatingMode) => {
    setAppOperatingMode(mode);
    setIsReportingModeActive(false); 
    if (mode === 'single') {
        resetWizardAndApp(); 
    }
  };

  const handleBatchSubmit = useCallback((files: FileList, mockBatchId: string, mockTotalCheques: number) => {
    setIsUploadingBatchGlobal(true);
    const newBatch: ChequeBatch = {
      batchId: mockBatchId,
      originalFilename: files[0]?.name || "Batch File",
      uploadTimestamp: new Date().toISOString(),
      totalCheques: mockTotalCheques,
      processedCheques: 0,
      status: 'uploading',
      cheques: Array.from({ length: mockTotalCheques }, (_, i) => ({
        id: `cheque_${i + 1}`,
        status: 'pending',
      })),
    };
    setMockBatches(prev => [newBatch, ...prev]);

    setTimeout(() => {
      setMockBatches(prev => prev.map(b => b.batchId === mockBatchId ? { ...b, status: 'queued' } : b));
      setIsUploadingBatchGlobal(false);

      setTimeout(() => {
        setMockBatches(prev => prev.map(b => b.batchId === mockBatchId ? { ...b, status: 'processing' } : b));
        
        let processedCount = 0;
        const processInterval = setInterval(() => {
          if (processedCount >= mockTotalCheques) {
            clearInterval(processInterval);
            setMockBatches(prev => prev.map(b => {
              if (b.batchId === mockBatchId) {
                const hasErrors = b.cheques.some(c => c.status === 'error');
                const finalBatchStatus: ChequeBatch['status'] = hasErrors ? 'partially_completed' : 'completed';
                return { 
                  ...b, 
                  status: finalBatchStatus,
                  processedCheques: mockTotalCheques
                };
              }
              return b;
            }));
            return;
          }

          processedCount++;
          setMockBatches(prevBatches => prevBatches.map(currentBatch => {
            if (currentBatch.batchId === mockBatchId) {
              const updatedCheques: BatchCheque[] = currentBatch.cheques.map((cheque, index) => {
                if (index === processedCount - 1) { 
                  const isError = Math.random() < 0.1; 
                  const newStatusForCheque: BatchCheque['status'] = isError ? 'error' : 'completed';
                  
                  const updatedChequeItem: BatchCheque = {
                    ...cheque,
                    status: newStatusForCheque,
                    statusMessage: isError ? 'Simulated processing error' : 'Processed successfully',
                  };
                  return updatedChequeItem;
                }
                return cheque;
              });
              
              const updatedBatchData: ChequeBatch = {
                ...currentBatch, 
                processedCheques: processedCount, 
                cheques: updatedCheques,
                status: (processedCount < mockTotalCheques) ? 'processing' : currentBatch.status,
              };
              return updatedBatchData;
            }
            return currentBatch;
          }));
        }, 700); 
      }, 1000); 
    }, 2000); 
  }, []);


  return (
    <Profiler id="AppRoot" onRender={onRenderCallback}>
      <BankingHeader
        isProcessing={headerProcessingStatus}
        complianceStatus={bankingHeaderComplianceStatus === 'critical' ? 'non-compliant' : bankingHeaderComplianceStatus}
        osfiCompliant={headerOsfiCompliant}
        onSettingsClick={() => setAlertInfo({title: "Settings", message: "Settings panel placeholder.", type: 'info', onDismiss: () => setAlertInfo(null)})}
        onExportClick={handleHeaderExportClick}
        onDocsClick={() => setAlertInfo({title: "Documentation", message: "Compliance documentation placeholder.", type: 'info', onDismiss: () => setAlertInfo(null)})}
        currentAppMode={appOperatingMode}
        onSwitchAppMode={handleHeaderModeSwitch}
      />
      <div className="min-h-screen bg-slate-100 flex flex-col items-center pt-6 sm:pt-8 px-4 pb-12 print:bg-white print:pt-0">
        <div className="text-center mb-1 sm:mb-2 print:hidden">
           {(appOperatingMode === 'single' && appMode === 'idle' && !isReportingModeActive) && (
            <p className="text-slate-600 text-sm">
              Single Cheque Verification Mode
              <span className="block text-xs text-blue-500 mt-0.5">
                ({isMobile ? 'Mobile View Optimized' : 'Desktop View'})
              </span>
            </p>
           )}
            {(appOperatingMode === 'batch' && !isReportingModeActive) && (
            <p className="text-slate-600 text-sm">
              Batch Operations Mode
            </p>
           )}
        </div>

        {alertInfo && (
          <CanadianBankingAlerts
            {...alertInfo}
          />
        )}

        <ErrorBoundary fallback={errorBoundaryFallback}>
          <main className="w-full max-w-6xl mx-auto mt-1 print:mt-0"> 
            {!isReportingModeActive && appOperatingMode === 'single' && appMode === 'idle' && (
              <div className="text-center p-8 bg-white rounded-xl shadow-xl border border-slate-200 print:hidden max-w-2xl mx-auto">
                <h2 className="text-2xl font-semibold text-blue-800 mb-4">Ready to Verify a Single Cheque?</h2>
                <p className="text-slate-600 mb-6">
                  Our guided process will help you capture and analyze your Canadian cheque.
                </p>
                <button
                  onClick={handleStartVerification}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg text-lg transition duration-150 ease-in-out shadow-md hover:shadow-lg"
                >
                  Start Single Verification
                </button>
              </div>
            )}
            
            {!isReportingModeActive && appOperatingMode === 'single' && appMode === 'wizardActive' && (
              <VerificationWizard
                activeStep={wizardActiveStep}
                onStepChange={setWizardActiveStep}
                userConsentGiven={userConsentGiven}
                onUserConsentChange={setUserConsentGiven}
                onImageSelected={handleImageSelected}
                onClearImage={resetWizardAndApp} 
                isImageInputLoading={isProcessingImage}
                isMobile={isMobile}
                selectedImageFile={selectedImageFile}
                imageQualityReport={imageQualityReportForWizard}
                onConfirmAndAnalyze={() => processCheckImage(false)}
                isAIProcessing={isLoading}
                chequeResult={chequeResult}
                analysisError={alertInfo?.type === 'critical' && wizardActiveStep === 5 ? String(alertInfo.message) : null}
                onReanalyze={() => processCheckImage(true)}
                onDashboardExportReport={() => setIsReportingModeActive(true)}
                onDashboardPrint={() => { setAlertInfo({title: "Printing", message: "Preparing dashboard for printing...", type: 'info', autoDismiss: true, autoDismissDelay: 200, onDismiss: () => setAlertInfo(null)}); setTimeout(()=>window.print(), 300); }}
                onCopyNotify={handleCopyNotification}
              />
            )}

            {!isReportingModeActive && appOperatingMode === 'batch' && (
              <OperationsDashboard
                batches={mockBatches}
                onBatchSubmit={handleBatchSubmit}
                isUploadingBatch={isUploadingBatchGlobal}
              />
            )}

            {isReportingModeActive && (
                <ComplianceReportGenerator
                    chequeResults={chequeResult ? [chequeResult] : null} 
                    onClose={() => setIsReportingModeActive(false)}
                />
            )}

          </main>
        </ErrorBoundary>
        <footer className="mt-12 mb-8 text-center text-sm text-slate-500 print:hidden">
          <p>&copy; {new Date().getFullYear()} Canadian Cheque Verifier. Powered by AI.</p>
          <p className="text-xs mt-1">This tool provides AI-assisted analysis. Verify critical information independently.</p>
        </footer>
      </div>
    </Profiler>
  );
};

export default App;