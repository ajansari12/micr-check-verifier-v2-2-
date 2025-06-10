import React from 'react';
import LoadingSpinner from './LoadingSpinner'; 

interface BankingHeaderProps {
  isProcessing: boolean;
  complianceStatus: 'compliant' | 'warning' | 'non-compliant' | 'unknown';
  osfiCompliant: boolean;
  onSettingsClick: () => void;
  onExportClick: () => void;
  onDocsClick?: () => void; 
  // New props for mode switching
  currentAppMode: 'single' | 'batch';
  onSwitchAppMode: (mode: 'single' | 'batch') => void;
}

const BankingHeader: React.FC<BankingHeaderProps> = React.memo(({
  isProcessing,
  complianceStatus,
  osfiCompliant,
  onSettingsClick,
  onExportClick,
  onDocsClick = () => alert("Compliance documentation clicked (placeholder)"),
  currentAppMode,
  onSwitchAppMode,
}) => {

  const getComplianceBadgeClasses = () => {
    switch (complianceStatus) {
      case 'compliant':
        return 'bg-green-600 text-white';
      case 'warning':
        return 'bg-yellow-400 text-black';
      case 'non-compliant':
        return 'bg-red-600 text-white';
      default: // unknown
        return 'bg-slate-500 text-white';
    }
  };

  const complianceText = {
    compliant: "Compliant",
    warning: "Warning",
    non_compliant: "Non-Compliant", // internal key
    unknown: "Unknown"
  };
  const currentComplianceText = complianceStatus === 'non-compliant' ? complianceText.non_compliant : complianceText[complianceStatus];

  const modeButtonBaseClass = "px-3 py-1.5 text-xs font-medium rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-50";
  const activeModeClass = "bg-white text-blue-800";
  const inactiveModeClass = "bg-blue-700 hover:bg-blue-600 text-white";

  return (
    <header className="bg-blue-900 text-white shadow-lg sticky top-0 z-40 print:hidden">
      <div className="container mx-auto px-4 py-3 flex flex-col xl:flex-row justify-between items-center">
        {/* Branding Section */}
        <div className="flex items-center mb-3 xl:mb-0 text-center xl:text-left">
          <span className="text-3xl text-red-600 mr-3 motion-safe:animate-pulse" aria-hidden="true">🍁</span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Canadian Cheque Verifier</h1>
            <h2 className="text-sm text-blue-300 font-light">CPA Standard 006 Compliant Analysis</h2>
          </div>
        </div>

        {/* Mode Switcher - Centered or appropriately placed */}
        <div className="my-3 xl:my-0 xl:mx-auto">
            <div className="flex space-x-1 bg-blue-800 p-0.5 rounded-lg shadow">
                 <button
                    onClick={() => onSwitchAppMode('single')}
                    className={`${modeButtonBaseClass} ${currentAppMode === 'single' ? activeModeClass : inactiveModeClass}`}
                    aria-pressed={currentAppMode === 'single'}
                 >
                    Single Cheque
                 </button>
                 <button
                    onClick={() => onSwitchAppMode('batch')}
                    className={`${modeButtonBaseClass} ${currentAppMode === 'batch' ? activeModeClass : inactiveModeClass}`}
                    aria-pressed={currentAppMode === 'batch'}
                >
                    Batch Operations
                </button>
            </div>
        </div>


        {/* Status & Actions Section */}
        <div className="flex flex-col sm:flex-row items-center space-y-3 sm:space-y-0 sm:space-x-4 w-full xl:w-auto justify-center xl:justify-end flex-wrap">
          {/* Status Indicators */}
          <div className="flex items-center space-x-3 flex-wrap justify-center">
            <div
              className={`px-3 py-1 text-xs font-semibold rounded-full shadow ${getComplianceBadgeClasses()}`}
              title={`Overall system compliance status: ${currentComplianceText}`}
            >
              Compliance: {currentComplianceText}
            </div>
            <div 
              className="flex items-center text-xs font-medium text-blue-200"
              title={osfiCompliant ? "OSFI Regulatory Guidelines Adhered" : "OSFI Compliance Review Pending/Needed"}
            >
              {osfiCompliant ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 mr-1 text-green-400">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 mr-1 text-yellow-400">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                </svg>
              )}
              OSFI Compliant
            </div>
            {isProcessing && (
              <div className="flex items-center text-xs font-medium text-blue-200" aria-live="polite">
                <LoadingSpinner size="h-4 w-4" color="text-white" />
                <span className="ml-1.5">Processing...</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2 border-t border-blue-700 sm:border-t-0 sm:border-l sm:border-blue-700 pt-3 sm:pt-0 sm:pl-4 mt-3 sm:mt-0">
            <button
              onClick={onDocsClick}
              className="px-3 py-1.5 text-xs bg-blue-700 hover:bg-blue-600 text-white rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-50 flex items-center"
              title="View Compliance Documentation"
              aria-label="View Compliance Documentation"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 mr-1">
                <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.586l-1.293-1.293a.75.75 0 00-1.06 1.06l2.5 2.5a.75.75 0 001.06 0l2.5-2.5a.75.75 0 10-1.06-1.06l-1.293 1.293V2.75z" />
                <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
              </svg>
              Docs
            </button>
            <button
              onClick={onExportClick}
              className="px-3 py-1.5 text-xs bg-blue-700 hover:bg-blue-600 text-white rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-50 flex items-center"
              title="Export Compliance Report"
              aria-label="Export Compliance Report"
            >
               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 mr-1">
                <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.378 2H4.5zm5.75 2.5a.75.75 0 00-1.5 0v2.5h-2.5a.75.75 0 000 1.5h2.5v2.5a.75.75 0 001.5 0v-2.5h2.5a.75.75 0 000-1.5h-2.5v-2.5z" clipRule="evenodd" />
              </svg>
              Export
            </button>
            <button
              onClick={onSettingsClick}
              className="p-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-50"
              title="Open Settings"
              aria-label="Open Application Settings"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M11.078 2.25c-.217-.009-.434-.009-.656 0l-.094.004l-.096.005l-.041.002l-.023.001l-.013.001l-.009.001l-.003.000l-.002.000a.75.75 0 00-.68.391l-1.592 3.285a.75.75 0 00.063 1.01l1.005.861a1.084 1.084 0 01.378 1.424l-.11.192a1.084 1.084 0 01-1.424.378l-1.005-.862a.75.75 0 00-1.01.063L3.61 11.39a.75.75 0 00-.39.68l-.001.002v.003l.000.009l.001.013l.001.023l.002.041l.005.096l.004.094c0 .222 0 .439.009.656l.004.094l.005.096l.002.041l.001.023l.001.013l.000.009v.003l.001.002a.75.75 0 00.39.68l3.286 1.592a.75.75 0 001.01-.063l.862-1.005a1.084 1.084 0 011.424-.378l.192.11a1.084 1.084 0 01.378 1.424l-.861 1.005a.75.75 0 00.063 1.01l1.592 3.285a.75.75 0 00.68.391l.002.000l.003 0l.009-.001l.013-.001l.023-.001l.041-.002l.096-.005l.094-.004c.222-.009.439-.009.656 0l.094.004l.096.005l.041.002l.023.001l.013.001l.009.001l.003.000l.002.000a.75.75 0 00.68-.39l1.592-3.286a.75.75 0 00-.063-1.01l-1.005-.862a1.084 1.084 0 01-.378-1.424l.11-.192a1.084 1.084 0 011.424-.378l1.005.861a.75.75 0 001.01.063l3.285-1.592a.75.75 0 00.39-.68l.001-.002v-.003l-.000-.009l-.001-.013l-.001-.023l-.002-.041l-.005-.096l-.004-.094a10.02 10.02 0 00-.009-.656l-.004-.094l-.005-.096l-.002-.041l-.001-.023l-.001-.013l0-.009v-.003l-.001-.002a.75.75 0 00-.39-.68L15.39 3.61a.75.75 0 00-1.01.063l-.861 1.005a1.084 1.084 0 01-1.424.378l-.192-.11a1.084 1.084 0 01-.378-1.424l.862-1.005a.75.75 0 00-.063-1.01L11.76.64a.75.75 0 00-.681-.39zM10 8.75a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
});

export default BankingHeader;
