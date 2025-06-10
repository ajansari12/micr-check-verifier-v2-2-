
import React, { useState, useEffect, useCallback, useRef } from 'react';

interface AlertAction {
  label: string;
  onClick: () => void;
  type?: 'primary' | 'secondary' | 'danger'; // For styling hints
}

export interface CanadianBankingAlertInfoProps {
  id?: string; // For keying if multiple alerts are managed by a parent
  type: 'critical' | 'warning' | 'success' | 'info';
  title: string;
  message: React.ReactNode;
  details?: React.ReactNode; // For expandable details section
  cpaStandard?: string; // e.g., "CPA006 Sec 3.2"
  osfiGuideline?: string; // e.g., "OSFI B-13"
  actions?: AlertAction[];
  autoDismiss?: boolean;
  autoDismissDelay?: number; // in ms
  onDismiss: () => void;
  canDismiss?: boolean;
  icon?: React.ReactNode; // Custom icon if needed
  timestamp?: string; // ISO string
  showIcon?: boolean;
  className?: string;
}

const CanadianBankingAlerts: React.FC<CanadianBankingAlertInfoProps> = ({
  type,
  title,
  message,
  details,
  cpaStandard,
  osfiGuideline,
  actions = [],
  autoDismiss: autoDismissProp,
  autoDismissDelay = 5000,
  onDismiss,
  canDismiss = true,
  icon: customIcon,
  timestamp,
  showIcon = true,
  className = '',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [progressBarKey, setProgressBarKey] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const autoDismiss = autoDismissProp ?? (type === 'success' || type === 'info');

  const handleDismiss = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsVisible(false);
    // Delay unmounting for exit animation
    setTimeout(() => {
      onDismiss();
    }, 300); // Corresponds to transition duration
  }, [onDismiss]);

  useEffect(() => {
    requestAnimationFrame(() => {
        setIsVisible(true);
    });
    setProgressBarKey(prev => prev + 1); // Reset progress bar animation

    if (autoDismiss) {
      timerRef.current = setTimeout(() => {
        handleDismiss();
      }, autoDismissDelay);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [type, title, message, autoDismiss, autoDismissDelay, handleDismiss]);


  let baseClasses = 'w-full max-w-md p-4 rounded-lg shadow-xl relative overflow-hidden';
  let typeClasses = '';
  let iconElement: React.ReactNode = null;
  let progressTypeColorClass = '';
  let titleColorClass = '';
  let borderColorClass = '';

  const icons = {
    critical: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm-1.72 6.97a.75.75 0 1 0-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 1 0 1.06 1.06L12 13.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L13.06 12l1.72-1.72a.75.75 0 1 0-1.06-1.06L12 10.94l-1.72-1.72Z" clipRule="evenodd" />
      </svg>
    ),
    warning: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.519 13.007c1.155 2-0.283 4.497-2.598 4.497H4.48c-2.316 0-3.753-2.497-2.598-4.497L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" />
      </svg>
    ),
    success: (
       <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.06-1.06l-3.093 3.093L9.186 9.936a.75.75 0 0 0-1.06 1.061l2.78 2.78a.75.75 0 0 0 1.061 0l4.153-4.153Z" clipRule="evenodd" />
      </svg>
    ),
    info: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 0 1 .67 1.34l-.04.022c-1.147.573-2.438-.463-2.127-1.706l.71-2.836-.042.02a.75.75 0 1 1-.671-1.34l.041-.022ZM12 9a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" />
      </svg>
    ),
  };

  switch (type) {
    case 'critical':
      typeClasses = 'bg-red-50 text-red-800';
      borderColorClass = 'border-red-500';
      titleColorClass = 'text-red-700';
      iconElement = customIcon || icons.critical;
      progressTypeColorClass = 'bg-red-600';
      break;
    case 'warning':
      typeClasses = 'bg-yellow-50 text-yellow-800';
      borderColorClass = 'border-yellow-500';
      titleColorClass = 'text-yellow-700';
      iconElement = customIcon || icons.warning;
      progressTypeColorClass = 'bg-yellow-500';
      break;
    case 'success':
      typeClasses = 'bg-green-50 text-green-800';
      borderColorClass = 'border-green-500';
      titleColorClass = 'text-green-700';
      iconElement = customIcon || icons.success;
      progressTypeColorClass = 'bg-green-600';
      break;
    case 'info':
      typeClasses = 'bg-blue-50 text-blue-800';
      borderColorClass = 'border-blue-500';
      titleColorClass = 'text-blue-700';
      iconElement = customIcon || icons.info;
      progressTypeColorClass = 'bg-blue-600';
      break;
  }

  const handleCopyDetails = () => {
    const textToCopy = `Title: ${title}\nMessage: ${typeof message === 'string' ? message : 'Complex message content'}\nDetails: ${typeof details === 'string' ? details : details ? 'Complex details content' : 'N/A'}\nCPA: ${cpaStandard || 'N/A'}\nOSFI: ${osfiGuideline || 'N/A'}\nTimestamp: ${timestamp || new Date().toISOString()}`;
    navigator.clipboard.writeText(textToCopy).then(() => {
      // Optionally show a temporary "Copied!" message or use a more sophisticated notification
    }).catch(err => console.error('Failed to copy details: ', err));
  };

  return (
    <div
      className={`fixed top-5 right-5 z-50 transition-all duration-300 ease-in-out transform border-l-4
                  ${isVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 -translate-y-5'}
                  ${baseClasses} ${typeClasses} ${borderColorClass} ${className}`}
      role={type === 'critical' || type === 'warning' ? 'alertdialog' : 'alert'}
      aria-labelledby="alert-title"
      aria-describedby="alert-message"
    >
      <div className="flex items-start">
        {showIcon && iconElement && (
          <div className={`flex-shrink-0 mr-3 ${titleColorClass}`}>
            {iconElement}
          </div>
        )}
        <div className="flex-grow">
          <h3 id="alert-title" className={`text-md font-semibold ${titleColorClass}`}>{title}</h3>
          <div id="alert-message" className="text-sm mt-1 break-words">{message}</div>
          {(cpaStandard || osfiGuideline || timestamp) && (
            <div className="mt-1.5 text-xs text-slate-500">
              {cpaStandard && <span>CPA: {cpaStandard} | </span>}
              {osfiGuideline && <span>OSFI: {osfiGuideline} | </span>}
              {timestamp && <span>Time: {new Date(timestamp).toLocaleString()}</span>}
            </div>
          )}

          {details && (
            <details className="mt-2 text-xs" open={isDetailsOpen} onToggle={(e) => setIsDetailsOpen((e.target as HTMLDetailsElement).open)}>
              <summary className="cursor-pointer font-medium text-blue-600 hover:text-blue-800 select-none">
                {isDetailsOpen ? 'Hide Details' : 'Show Details'}
              </summary>
              <div className="mt-1 p-2 bg-slate-100 dark:bg-slate-700 rounded border border-slate-200 dark:border-slate-600 max-h-48 overflow-y-auto">
                {typeof details === 'string' ? <pre className="whitespace-pre-wrap">{details}</pre> : details}
              </div>
            </details>
          )}

          {actions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {actions.map((action, index) => (
                <button
                  key={index}
                  onClick={action.onClick}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1
                    ${action.type === 'primary' ? `bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500` :
                      action.type === 'danger' ? `bg-red-600 hover:bg-red-700 text-white focus:ring-red-500` :
                      `bg-slate-200 hover:bg-slate-300 text-slate-700 focus:ring-slate-400 dark:bg-slate-600 dark:hover:bg-slate-500 dark:text-slate-200 dark:focus:ring-slate-500`
                    }`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="ml-3 flex-shrink-0 space-y-1">
          {canDismiss && (
            <button
              onClick={handleDismiss}
              className={`p-1 rounded-md inline-flex items-center justify-center
                          focus:outline-none focus:ring-2 
                          ${typeClasses.includes('red') ? 'hover:bg-red-100 focus:ring-red-400' :
                            typeClasses.includes('yellow') ? 'hover:bg-yellow-100 focus:ring-yellow-400' :
                            typeClasses.includes('green') ? 'hover:bg-green-100 focus:ring-green-400' :
                            'hover:bg-blue-100 focus:ring-blue-400'
                          }`}
              aria-label="Dismiss alert"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
           <button
              onClick={handleCopyDetails}
              className={`p-1 rounded-md inline-flex items-center justify-center
                          focus:outline-none focus:ring-2 
                          ${typeClasses.includes('red') ? 'hover:bg-red-100 focus:ring-red-400' :
                            typeClasses.includes('yellow') ? 'hover:bg-yellow-100 focus:ring-yellow-400' :
                            typeClasses.includes('green') ? 'hover:bg-green-100 focus:ring-green-400' :
                            'hover:bg-blue-100 focus:ring-blue-400'
                          }`}
              title="Copy alert details to clipboard"
              aria-label="Copy alert details"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" /></svg>
            </button>
        </div>
      </div>

      {autoDismiss && isVisible && (
        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/5 dark:bg-white/5 overflow-hidden">
          <div
            key={progressBarKey}
            className={`h-full ${progressTypeColorClass} origin-left animate-progress-bar-shrink`}
            style={{ animationDuration: `${autoDismissDelay}ms` }}
          />
        </div>
      )}
    </div>
  );
};

export default CanadianBankingAlerts;
