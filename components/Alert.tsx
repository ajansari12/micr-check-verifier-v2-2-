import React, { useState, useEffect, useCallback } from 'react';

interface AlertProps {
  message: string;
  type: 'error' | 'success' | 'info' | 'warning';
  onClose: () => void;
  autoClose?: boolean;
  autoCloseDelay?: number; // in ms
  showIcon?: boolean;
  className?: string;
}

const Alert: React.FC<AlertProps> = React.memo(({
  message,
  type,
  onClose,
  autoClose = false,
  autoCloseDelay = 5000,
  showIcon = true,
  className = '',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [progressBarKey, setProgressBarKey] = useState(0);

  // Memoize internalCloseHandler to stabilize its reference if used in deps
  const internalCloseHandler = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => {
      onClose();
    }, 300); 
  }, [onClose]);

  useEffect(() => {
    requestAnimationFrame(() => {
        setIsVisible(true);
    });
    
    setProgressBarKey(prev => prev + 1); 

    let timerId: ReturnType<typeof setTimeout> | undefined;
    if (autoClose) {
      timerId = setTimeout(() => {
        internalCloseHandler();
      }, autoCloseDelay);
    }

    return () => {
      if (timerId) {
        clearTimeout(timerId);
      }
    };
  // internalCloseHandler is memoized, onClose is expected to be memoized by parent
  }, [message, type, autoClose, autoCloseDelay, internalCloseHandler]); 


  let baseClasses = 'p-4 rounded-lg shadow-xl flex items-start relative overflow-hidden';
  let typeClasses = '';
  let iconElement: React.ReactNode = null;
  let progressTypeColorClass = '';

  const icons = {
    success: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.06-1.06l-3.093 3.093L9.186 9.936a.75.75 0 0 0-1.06 1.061l2.78 2.78a.75.75 0 0 0 1.061 0l4.153-4.153Z" clipRule="evenodd" />
      </svg>
    ),
    error: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm-1.72 6.97a.75.75 0 1 0-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 1 0 1.06 1.06L12 13.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L13.06 12l1.72-1.72a.75.75 0 1 0-1.06-1.06L12 10.94l-1.72-1.72Z" clipRule="evenodd" />
      </svg>
    ),
    info: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 0 1 .67 1.34l-.04.022c-1.147.573-2.438-.463-2.127-1.706l.71-2.836-.042.02a.75.75 0 1 1-.671-1.34l.041-.022ZM12 9a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" />
      </svg>
    ),
    warning: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.519 13.007c1.155 2-0.283 4.497-2.598 4.497H4.48c-2.316 0-3.753-2.497-2.598-4.497L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" />
      </svg>
    ),
    close: (
       <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
         <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
       </svg>
    )
  };

  switch (type) {
    case 'error':
      typeClasses = 'bg-red-100 border border-red-400 text-red-700';
      iconElement = icons.error;
      progressTypeColorClass = 'bg-red-500';
      break;
    case 'success':
      typeClasses = 'bg-green-100 border border-green-400 text-green-700';
      iconElement = icons.success;
      progressTypeColorClass = 'bg-green-500';
      break;
    case 'info':
      typeClasses = 'bg-blue-100 border border-blue-400 text-blue-700';
      iconElement = icons.info;
      progressTypeColorClass = 'bg-blue-500';
      break;
    case 'warning':
      typeClasses = 'bg-yellow-100 border border-yellow-400 text-yellow-700';
      iconElement = icons.warning;
      progressTypeColorClass = 'bg-yellow-500';
      break;
  }

  return (
    <div
      className={`fixed top-5 right-5 z-50 max-w-sm w-full
                  transition-all duration-300 ease-in-out transform
                  ${isVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 -translate-y-5'}
                  ${baseClasses} ${typeClasses} ${className}`}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <div className="flex-shrink-0 mr-3">
        {showIcon && iconElement && React.cloneElement<React.SVGProps<SVGSVGElement>>(
            iconElement as React.ReactElement, 
            { className: `w-6 h-6 ${type === 'error' ? 'text-red-500' : type === 'success' ? 'text-green-500' : type === 'info' ? 'text-blue-500' : 'text-yellow-500'}`}
        )}
      </div>
      <div className="flex-grow text-sm mr-3 break-words">
        {message}
      </div>
      <div className="flex-shrink-0 ml-auto pl-3">
        <button
          onClick={internalCloseHandler}
          className={`-mx-1.5 -my-1.5 p-1.5 rounded-md inline-flex items-center justify-center
                      focus:outline-none focus:ring-2 
                      ${ type === 'error' ? 'hover:bg-red-200 focus:ring-red-400' 
                       : type === 'success' ? 'hover:bg-green-200 focus:ring-green-400'
                       : type === 'info' ? 'hover:bg-blue-200 focus:ring-blue-400'
                       : 'hover:bg-yellow-200 focus:ring-yellow-400'}`}
          aria-label="Close alert"
        >
          <span className="sr-only">Dismiss</span>
          {React.cloneElement<React.SVGProps<SVGSVGElement>>(
            icons.close as React.ReactElement, 
            { className: `w-5 h-5 ${type === 'error' ? 'text-red-500' : type === 'success' ? 'text-green-500' : type === 'info' ? 'text-blue-500' : 'text-yellow-500'}`}
          )}
        </button>
      </div>

      {autoClose && (
        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/10 dark:bg-white/10 rounded-b-lg overflow-hidden">
          <div
            key={progressBarKey}
            className={`h-full ${progressTypeColorClass} origin-left animate-progress-bar-shrink`}
            style={{ animationDuration: `${autoCloseDelay}ms` }}
          />
        </div>
      )}
    </div>
  );
});

export default Alert;
