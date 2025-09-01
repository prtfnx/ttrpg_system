import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { logger } from '../utils/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Production-ready error boundary component
 * Catches JavaScript errors anywhere in the child component tree
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error for monitoring in production
    logger.error('Error boundary caught an error', { error, errorInfo });
    
    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);

    // In production, you could send this to an error reporting service
    if (import.meta.env.PROD) {
      // Example: Sentry.captureException(error, { extra: errorInfo });
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // Render custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default production error UI
      return (
        <div style={{
          padding: '20px',
          margin: '20px',
          border: '1px solid #ff6b6b',
          borderRadius: '8px',
          backgroundColor: '#ffe0e0',
          color: '#d63031'
        }}>
          <h3>🚨 Something went wrong</h3>
          <p>The application encountered an error. Please refresh the page to continue.</p>
          <details style={{ marginTop: '10px' }}>
            <summary style={{ cursor: 'pointer' }}>Error details</summary>
            <pre style={{ 
              marginTop: '10px', 
              padding: '10px', 
              backgroundColor: '#fff', 
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '12px',
              overflow: 'auto'
            }}>
              {this.state.error?.message}
              {'\n\n'}
              {this.state.error?.stack}
            </pre>
          </details>
          <button 
            onClick={() => window.location.reload()}
            style={{
              marginTop: '15px',
              padding: '8px 16px',
              backgroundColor: '#0984e3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
