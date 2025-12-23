import React, { ReactNode, ErrorInfo } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// Simple Error Boundary Class Component
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false, error: null };
  readonly props!: Readonly<ErrorBoundaryProps>;

  constructor(props: ErrorBoundaryProps) {
    super(props);
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("React Error Boundary Caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="bg-white p-8 rounded-xl shadow-xl border border-red-100 max-w-lg w-full">
            <h2 className="text-2xl font-bold text-red-600 mb-4 flex items-center gap-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
              Application Error
            </h2>
            <p className="text-slate-600 mb-4">Something went wrong while rendering the interface.</p>
            <div className="bg-slate-100 p-4 rounded-lg overflow-x-auto mb-6">
              <code className="text-xs text-red-800 font-mono break-all">
                {this.state.error?.message || 'Unknown Error'}
              </code>
            </div>
            <button 
              onClick={() => window.location.reload()} 
              className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Try Reloading
            </button>
          </div>
        </div>
      );
    }

    // Fix: Access children from props
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

try {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
} catch (error: any) {
  console.error("Root Mount Error:", error);
  // Fallback to basic HTML if React fails completely
  rootElement.innerHTML = `<div style="padding: 40px; text-align: center;">
    <h1 style="color: #e11d48; font-family: sans-serif;">Critical Startup Failure</h1>
    <p style="color: #475569;">React failed to initialize.</p>
    <pre style="background: #f1f5f9; padding: 10px; border-radius: 4px; display: inline-block; text-align: left;">${error?.message || String(error)}</pre>
  </div>`;
}