import React, { useState, useEffect } from 'react';
import ImageInput from '@/components/ImageInput';
import CanadianBankingDashboard from '@/components/CanadianBankingDashboard';
import LoadingSpinner from '@/components/LoadingSpinner';
import { ChequeVerificationResult } from '../types'; // Assuming types are in parent dir
import { ImageQualityReport } from '../utils/imageUtils'; // Corrected import path

interface VerificationWizardProps {
  // Step control
  activeStep: number; // 1-5
  onStepChange: (step: number) => void;

  // Data & Callbacks for steps
  // Step 1: Consent
  userConsentGiven: boolean;
  onUserConsentChange: (consent: boolean) => void;

  // Step 2: Image Capture (Props for ImageInput)
  onImageSelected: (file: File, base64Preview: string) => void;
  onClearImage: () => void;
  isImageInputLoading: boolean; // Loading state specifically for ImageInput operations (file validation, camera init)
  isMobile: boolean;
  selectedImageFile: File | null; // To know if an image is ready for next step

  // Step 3: Pre-Validation
  imageQualityReport: ImageQualityReport | null;
  onConfirmAndAnalyze: () => void; // Callback to trigger actual AI analysis

  // Step 4: AI Progress
  isAIProcessing: boolean; // Main AI analysis loading state

  // Step 5: Results Review
  chequeResult: ChequeVerificationResult | null;
  analysisError: string | null;
  onReanalyze?: () => void;
  onDashboardExportReport?: () => void;
  onDashboardPrint?: () => void;
  onCopyNotify?: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

const VerificationWizard: React.FC<VerificationWizardProps> = ({
  activeStep,
  onStepChange,
  userConsentGiven,
  onUserConsentChange,
  onImageSelected,
  onClearImage,
  isImageInputLoading,
  isMobile,
  selectedImageFile,
  imageQualityReport,
  onConfirmAndAnalyze,
  isAIProcessing,
  chequeResult,
  analysisError,
  onReanalyze,
  onDashboardExportReport,
  onDashboardPrint,
  onCopyNotify,
}) => {
  const totalSteps = 5;

  const canProceedToNextStep = () => {
    if (activeStep === 1 && !userConsentGiven) return false;
    if (activeStep === 2 && !selectedImageFile) return false;
    if (activeStep === 3 && !imageQualityReport) return false; // Need quality report to confirm
    // Step 4 is auto, Step 5 is final
    return true;
  };
  
  const handleNext = () => {
    if (canProceedToNextStep() && activeStep < totalSteps) {
      if (activeStep === 3) { // After pre-validation confirmation
        onConfirmAndAnalyze(); // This will trigger AI processing, App.tsx should move to step 4
      } else {
        onStepChange(activeStep + 1);
      }
    }
  };

  const handleBack = () => {
    if (activeStep > 1) {
      // If going back from results (step 5) or AI processing (step 4),
      // typically you'd go back to image selection or pre-validation to allow changes.
      if (activeStep === 5 || activeStep === 4) {
        onStepChange(2); // Go back to image capture to allow re-selection/re-capture
        onClearImage(); // Clear the existing image and results
      } else {
        onStepChange(activeStep - 1);
      }
    }
  };

  const StepIndicator: React.FC<{ stepNumber: number; title: string; currentStep: number }> = ({ stepNumber, title, currentStep }) => {
    const isActive = stepNumber === currentStep;
    const isCompleted = stepNumber < currentStep;
    let bgColor = 'bg-slate-200';
    let textColor = 'text-slate-500';
    let borderColor = 'border-slate-300';

    if (isActive) {
      bgColor = 'bg-blue-600';
      textColor = 'text-white';
      borderColor = 'border-blue-700';
    } else if (isCompleted) {
      bgColor = 'bg-green-500';
      textColor = 'text-white';
      borderColor = 'border-green-600';
    }

    return (
      <div className={`flex items-center p-2 rounded-lg border ${borderColor} ${isActive ? 'ring-2 ring-blue-500 ring-offset-1' : ''} ${bgColor} transition-all duration-300`}>
        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mr-2 border-2 ${isActive ? 'border-blue-200 text-blue-700 bg-white' : isCompleted ? 'border-green-200 text-green-700 bg-white' : 'border-slate-400 text-slate-500 bg-slate-100'}`}>
          {isCompleted && !isActive ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
            </svg>
          ) : stepNumber}
        </div>
        <div className={`text-xs font-medium ${textColor}`}>
          <div>STEP {stepNumber}</div>
          <div className="font-semibold">{title}</div>
        </div>
      </div>
    );
  };
  
  const commonButtonClasses = "font-semibold py-2.5 px-5 rounded-md transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-sm";

  return (
    <div className="w-full max-w-5xl mx-auto bg-white shadow-xl rounded-xl border border-slate-200">
      {/* Wizard Header & Progress */}
      <div className="p-5 border-b border-slate-200 bg-slate-50 rounded-t-xl">
        <h2 className="text-xl sm:text-2xl font-bold text-blue-800 mb-3 text-center">Cheque Verification Process</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3">
          <StepIndicator stepNumber={1} title="Intro & Consent" currentStep={activeStep} />
          <StepIndicator stepNumber={2} title="Image Capture" currentStep={activeStep} />
          <StepIndicator stepNumber={3} title="Pre-Validation" currentStep={activeStep} />
          <StepIndicator stepNumber={4} title="AI Analysis" currentStep={activeStep} />
          <StepIndicator stepNumber={5} title="Results Review" currentStep={activeStep} />
        </div>
      </div>

      {/* Step Content Area */}
      <div className="p-5 sm:p-8 min-h-[400px]">
        {activeStep === 1 && (
          <div>
            <h3 className="text-lg font-semibold text-blue-700 mb-3">Step 1: Welcome & Compliance Overview</h3>
            <p className="text-sm text-slate-600 mb-2">This tool guides you through verifying a Canadian cheque using AI, adhering to banking standards.</p>
            <div className="space-y-3 text-xs text-slate-700 p-3 bg-blue-50 rounded-md border border-blue-100">
              <p><strong>Canadian Payments Association (CPA) Standard 006:</strong> This standard outlines rules for cheque specifications, including dimensions, MICR encoding, and image quality for clearing.</p>
              <p><strong>OSFI Security Requirements:</strong> We prioritize data security and adhere to guidelines for technology risk management. All data is handled with care.</p>
            </div>
             <div className="mt-6 p-3 bg-amber-50 border border-amber-200 rounded-md">
                <label htmlFor="userConsent" className="flex items-start text-sm text-amber-800">
                <input
                    type="checkbox"
                    id="userConsent"
                    checked={userConsentGiven}
                    onChange={(e) => onUserConsentChange(e.target.checked)}
                    className="h-4 w-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 mr-2 mt-0.5"
                />
                <span>I consent to the processing of the cheque image for verification purposes as outlined, and acknowledge the AI-assisted nature of this tool. I understand the importance of verifying critical information independently.</span>
                </label>
            </div>
          </div>
        )}

        {activeStep === 2 && (
          <div>
            <h3 className="text-lg font-semibold text-blue-700 mb-3">Step 2: Capture or Upload Cheque Image</h3>
            <ImageInput
              onImageSelected={onImageSelected}
              onClearImage={onClearImage}
              isLoading={isImageInputLoading}
              isMobile={isMobile}
            />
            {selectedImageFile && (
                <p className="text-sm text-green-600 mt-3 p-2 bg-green-50 rounded-md border border-green-200">
                    Image selected: <span className="font-semibold">{selectedImageFile.name}</span>. Ready to proceed to pre-validation.
                </p>
            )}
          </div>
        )}

        {activeStep === 3 && (
          <div>
            <h3 className="text-lg font-semibold text-blue-700 mb-3">Step 3: Pre-Processing Validation</h3>
            {isImageInputLoading && <LoadingSpinner />}
            {!isImageInputLoading && imageQualityReport && (
              <div className="p-4 bg-slate-50 rounded-md border border-slate-200">
                <h4 className="font-semibold text-slate-800 mb-1">Image Quality Assessment:</h4>
                <p className={`text-sm font-medium ${imageQualityReport.overallAssessment === 'good' ? 'text-green-600' : imageQualityReport.overallAssessment === 'fair' ? 'text-yellow-600' : 'text-red-600'}`}>
                  Overall Assessment: {imageQualityReport.overallAssessment.toUpperCase()}
                </p>
                <p className="text-xs text-slate-600">Resolution: {imageQualityReport.resolution.width}x{imageQualityReport.resolution.height}px</p>
                {imageQualityReport.suggestions.length > 0 && (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-blue-600 hover:text-blue-800 font-medium">View Suggestions ({imageQualityReport.suggestions.length})</summary>
                    <ul className="list-disc list-inside pl-4 mt-1 text-slate-500 space-y-0.5">
                      {imageQualityReport.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </details>
                )}
                <p className="text-xs text-slate-500 mt-3 italic">
                    Review the quality. If it's poor, you may go back to re-capture/re-upload. Otherwise, proceed to AI analysis.
                </p>
              </div>
            )}
            {!isImageInputLoading && !imageQualityReport && (
                <p className="text-sm text-slate-500">Please select an image in Step 2 to see pre-validation checks.</p>
            )}
          </div>
        )}

        {activeStep === 4 && (
          <div>
            <h3 className="text-lg font-semibold text-blue-700 mb-3">Step 4: AI Analysis in Progress</h3>
            <div className="flex flex-col items-center justify-center p-10 bg-blue-50 rounded-lg border border-blue-200">
              <LoadingSpinner size="h-12 w-12" color="text-blue-600" />
              <p className="mt-3 text-slate-700 font-medium">Analyzing cheque details, please wait...</p>
              <ul className="text-xs text-slate-500 mt-2 space-y-0.5 text-center">
                  <li>Extracting MICR line...</li>
                  <li>Identifying security features...</li>
                  <li>Assessing fraud risk...</li>
              </ul>
              <p className="text-xs text-slate-400 mt-1 italic">(This may take a few moments)</p>
            </div>
          </div>
        )}
        
        {activeStep === 5 && (
          <div>
            <h3 className="text-lg font-semibold text-blue-700 mb-1">Step 5: Verification Results</h3>
             {isAIProcessing && !chequeResult && !analysisError && ( // Still loading results specifically for this step
                <div className="flex flex-col items-center justify-center p-10">
                    <LoadingSpinner size="h-10 w-10" color="text-blue-600" />
                    <p className="mt-2 text-slate-600">Loading final results...</p>
                </div>
            )}
            {analysisError && !isAIProcessing && (
                 <div className="p-4 my-4 text-center bg-red-50 border border-red-300 text-red-700 rounded-lg">
                    <h4 className="font-semibold">Analysis Error</h4>
                    <p className="text-sm">{analysisError}</p>
                 </div>
            )}
            {chequeResult && !isAIProcessing && (
              <CanadianBankingDashboard
                result={chequeResult}
                isLoading={false} // AI Processing is done if we have a result here
                error={null} // Error is handled above
                onReanalyze={onReanalyze}
                onExportReport={onDashboardExportReport}
                onPrint={onDashboardPrint}
                onCopyNotify={onCopyNotify}
              />
            )}
          </div>
        )}
      </div>

      {/* Wizard Footer & Navigation */}
      <div className="p-5 border-t border-slate-200 bg-slate-50 rounded-b-xl flex justify-between items-center">
        <button
          onClick={handleBack}
          disabled={activeStep === 1 || isAIProcessing || isImageInputLoading }
          className={`${commonButtonClasses} bg-slate-200 hover:bg-slate-300 text-slate-700`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back
        </button>
        {activeStep < totalSteps ? (
          <button
            onClick={handleNext}
            disabled={!canProceedToNextStep() || isAIProcessing || isImageInputLoading || (activeStep ===3 && !imageQualityReport)}
            className={`${commonButtonClasses} bg-blue-600 hover:bg-blue-700 text-white`}
          >
            {activeStep === 3 ? 'Confirm & Analyze' : 'Next'}
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 ml-2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        ) : (
           <button
            onClick={() => { /* Potentially reset or finish */ onClearImage(); onStepChange(1); onUserConsentChange(false);}}
            className={`${commonButtonClasses} bg-green-600 hover:bg-green-700 text-white`}
            >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-2"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001a49.948 49.948 0 01-4.992.001zM21 12a9 9 0 11-18 0 9 9 0 0118 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            Start New Verification
            </button>
        )}
      </div>
    </div>
  );
};

export default VerificationWizard;