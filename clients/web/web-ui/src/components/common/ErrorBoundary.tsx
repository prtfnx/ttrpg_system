import type { ErrorInfo, ReactNode } from 'react';
import React, { Component } from 'react';
import './ErrorBoundary.css';

// Extend Window interface for error tracking
declare global {
  interface Window {
    errorTracker?: {
      captureException: (error: Error, options?: any) => void;
    };
  }
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  retryCount: number;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: React.ComponentType<ErrorFallbackProps> | React.ReactElement;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  maxRetries?: number;
  componentName?: string;
}

interface ErrorFallbackProps {
  error?: Error;
  errorInfo?: ErrorInfo;
  onRetry: () => void;
  canRetry: boolean;
  componentName?: string;
}

class PanelErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`${this.props.componentName || 'Component'} error:`, error, errorInfo);
    
    // Report to error tracking service if available
    if (window.errorTracker) {
      window.errorTracker.captureException(error, {
        extra: errorInfo,
        tags: { 
          component: this.props.componentName || 'unknown',
          boundary: 'panel'
        }
      });
    }
    
    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
    
    this.setState({
      error,
      errorInfo
    });
  }

  handleRetry = () => {
    const maxRetries = this.props.maxRetries || 3;
    if (this.state.retryCount < maxRetries) {
      this.setState({
        hasError: false,
        error: undefined,
        errorInfo: undefined,
        retryCount: this.state.retryCount + 1
      });
    }
  };

  render() {
    if (this.state.hasError) {
      const fallback = this.props.fallback;
      const maxRetries = this.props.maxRetries || 3;
      
      // Handle both component and element types
      if (React.isValidElement(fallback)) {
        return fallback;
      }
      
      const FallbackComponent = fallback || DefaultErrorFallback;
      
      return (
        <FallbackComponent
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          onRetry={this.handleRetry}
          canRetry={this.state.retryCount < maxRetries}
          componentName={this.props.componentName}
        />
      );
    }

    return this.props.children;
  }
}

const DefaultErrorFallback: React.FC<ErrorFallbackProps> = ({ 
  error, 
  onRetry, 
  canRetry, 
  componentName 
}) => (
  <div className="panel-error-boundary">
    <div className="error-icon">⚠️</div>
    <h3>Something went wrong</h3>
    <p>The {componentName || 'panel'} encountered an error and couldn't load properly.</p>
    
    {error && (
      <details className="error-details">
        <summary>Error Details</summary>
        <pre className="error-message">{error.message}</pre>
        {import.meta.env?.DEV && error.stack && (
          <pre className="error-stack">{error.stack}</pre>
        )}
      </details>
    )}
    
    <div className="error-actions">
      {canRetry && (
        <button onClick={onRetry} className="retry-button">
          🔄 Try Again
        </button>
      )}
      <button 
        onClick={() => window.location.reload()} 
        className="reload-button"
      >
        🔃 Reload Page
      </button>
    </div>
  </div>
);

// Specialized error fallbacks for different panel types
const PaintPanelErrorFallback: React.FC<ErrorFallbackProps> = ({ onRetry, canRetry }) => (
  <div className="paint-panel-error">
    <div className="error-icon">🎨</div>
    <h4>Paint System Error</h4>
    <p>The paint system couldn't initialize. This might be due to:</p>
    <ul>
      <li>WASM module loading failure</li>
      <li>WebGL context issues</li>
      <li>Browser compatibility problems</li>
    </ul>
    
    <div className="error-actions">
      {canRetry && (
        <button onClick={onRetry} className="retry-button">
          🔄 Retry Paint System
        </button>
      )}
      
      <button 
        onClick={() => window.open('/help/paint-troubleshooting', '_blank')}
        className="help-button"
      >
        📚 Troubleshooting Guide
      </button>
    </div>
  </div>
);

const LightingPanelErrorFallback: React.FC<ErrorFallbackProps> = ({ onRetry, canRetry }) => (
  <div className="lighting-panel-error">
    <div className="error-icon">💡</div>
    <h4>Lighting System Error</h4>
    <p>The lighting system failed to initialize properly.</p>
    
    <div className="common-solutions">
      <h5>Common Solutions:</h5>
      <ul>
        <li>Check WebGL support in your browser</li>
        <li>Ensure hardware acceleration is enabled</li>
        <li>Update your graphics drivers</li>
      </ul>
    </div>
    
    <div className="error-actions">
      {canRetry && (
        <button onClick={onRetry} className="retry-button">
          🔄 Retry Lighting System
        </button>
      )}
    </div>
  </div>
);

const FogPanelErrorFallback: React.FC<ErrorFallbackProps> = ({ onRetry, canRetry }) => (
  <div className="fog-panel-error">
    <div className="error-icon">🌫️</div>
    <h4>Fog System Error</h4>
    <p>The fog of war system encountered an error.</p>
    
    <div className="error-actions">
      {canRetry && (
        <button onClick={onRetry} className="retry-button">
          🔄 Retry Fog System
        </button>
      )}
    </div>
  </div>
);

const CompendiumPanelErrorFallback: React.FC<ErrorFallbackProps> = ({ onRetry, canRetry, error }) => (
  <div className="compendium-panel-error">
    <div className="error-icon">📚</div>
    <h4>Compendium Error</h4>
    <p>Failed to load compendium data.</p>
    
    {error?.message?.includes('auth') && (
      <div className="auth-error-hint">
        <p>This might be an authentication issue. Try logging out and back in.</p>
      </div>
    )}
    
    <div className="error-actions">
      {canRetry && (
        <button onClick={onRetry} className="retry-button">
          🔄 Retry Loading
        </button>
      )}
      {error?.message?.includes('auth') && (
        <button 
          onClick={() => window.location.href = '/login'}
          className="auth-button"
        >
          🔐 Re-authenticate
        </button>
      )}
    </div>
  </div>
);

// Specialized error boundaries for different components
export const SafePaintPanel: React.FC<{ children: ReactNode }> = ({ children }) => (
  <PanelErrorBoundary 
    fallback={PaintPanelErrorFallback}
    componentName="Paint Panel"
    maxRetries={3}
  >
    {children}
  </PanelErrorBoundary>
);

export const SafeLightingPanel: React.FC<{ children: ReactNode }> = ({ children }) => (
  <PanelErrorBoundary 
    fallback={LightingPanelErrorFallback}
    componentName="Lighting Panel"
    maxRetries={3}
  >
    {children}
  </PanelErrorBoundary>
);

export const SafeFogPanel: React.FC<{ children: ReactNode }> = ({ children }) => (
  <PanelErrorBoundary 
    fallback={FogPanelErrorFallback}
    componentName="Fog Panel"
    maxRetries={3}
  >
    {children}
  </PanelErrorBoundary>
);

export const SafeCompendiumPanel: React.FC<{ children: ReactNode }> = ({ children }) => (
  <PanelErrorBoundary 
    fallback={CompendiumPanelErrorFallback}
    componentName="Compendium Panel"
    maxRetries={2}
  >
    {children}
  </PanelErrorBoundary>
);

export const SafeLayerPanel: React.FC<{ children: ReactNode }> = ({ children }) => (
  <PanelErrorBoundary componentName="Layer Panel">
    {children}
  </PanelErrorBoundary>
);

export const SafeEntitiesPanel: React.FC<{ children: ReactNode }> = ({ children }) => (
  <PanelErrorBoundary componentName="Entities Panel">
    {children}
  </PanelErrorBoundary>
);

export const SafeChatPanel: React.FC<{ children: ReactNode }> = ({ children }) => (
  <PanelErrorBoundary componentName="Chat Panel">
    {children}
  </PanelErrorBoundary>
);

// Generic safe wrapper for any component
export const SafeComponent: React.FC<{ 
  children: ReactNode;
  componentName?: string;
  fallback?: React.ComponentType<ErrorFallbackProps>;
  maxRetries?: number;
}> = ({ children, componentName, fallback, maxRetries }) => (
  <PanelErrorBoundary 
    componentName={componentName}
    fallback={fallback}
    maxRetries={maxRetries}
  >
    {children}
  </PanelErrorBoundary>
);

// Legacy ErrorBoundary for backward compatibility
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    retryCount: 0
  };

  public static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        // Use custom fallback if provided
        const fallback = this.props.fallback;
        
        // Handle both component and element types
        if (React.isValidElement(fallback)) {
          return fallback;
        }
        
        const FallbackComponent = fallback;
        return (
          <FallbackComponent
            error={this.state.error}
            errorInfo={this.state.errorInfo}
            onRetry={() => this.setState({ hasError: false, error: undefined })}
            canRetry={true}
            componentName={this.props.componentName}
          />
        );
      }

      return (
        <div className="error-boundary">
          <div className="error-content">
            <h2>Something went wrong</h2>
            <details style={{ whiteSpace: 'pre-wrap' }}>
              <summary>Error details</summary>
              {this.state.error?.toString()}
            </details>
            <button 
              onClick={() => this.setState({ hasError: false, error: undefined })}
              className="retry-button"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export { DefaultErrorFallback, PanelErrorBoundary };
export type { ErrorBoundaryProps, ErrorFallbackProps };

