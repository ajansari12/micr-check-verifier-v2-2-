import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(_: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ error, errorInfo });
    // You can also log the error to an error reporting service here
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg shadow-md" role="alert">
          <h2 className="text-xl font-semibold mb-2">Oops, something went wrong.</h2>
          <p className="mb-1">We're sorry for the inconvenience. Please try refreshing the page or contact support if the problem persists.</p>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer font-medium">Error Details (Development Only)</summary>
              <pre className="mt-1 p-2 bg-red-50 text-red-600 rounded overflow-auto text-xs">
                {this.state.error?.toString()}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
