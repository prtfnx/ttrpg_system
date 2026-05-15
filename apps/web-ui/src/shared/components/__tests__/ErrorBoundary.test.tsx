import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import {
  ErrorBoundary,
  PanelErrorBoundary,
  SafePaintPanel,
  SafeLightingPanel,
  SafeFogPanel,
  SafeCompendiumPanel,
  SafeComponent,
  DefaultErrorFallback,
} from '../ErrorBoundary';

// Suppress console.error during error boundary tests
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// A component that throws on demand
function ThrowingComponent({ shouldThrow }: { shouldThrow?: boolean }) {
  if (shouldThrow) throw new Error('Test error message');
  return <div>Child content</div>;
}

describe('ErrorBoundary (legacy)', () => {
  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(screen.getByText('Child content')).toBeTruthy();
  });

  it('shows default fallback on error', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('calls onError prop when error is caught', () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <ThrowingComponent shouldThrow />
      </ErrorBoundary>
    );
    expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.anything());
  });

  it('retries on "Try again" click', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    // After retry it will re-throw since ThrowingComponent always throws
    // But the boundary should have tried to reset
    expect(screen.queryByText('Something went wrong')).toBeTruthy();
  });

  it('renders element fallback when provided as ReactElement', () => {
    const fallbackEl = <div>Custom Fallback Element</div>;
    render(
      <ErrorBoundary fallback={fallbackEl as React.ComponentType<object>}>
        <ThrowingComponent shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText('Custom Fallback Element')).toBeTruthy();
  });

  it('renders component fallback when provided as React.FC', () => {
    const FallbackComp = () => <div>Fallback Component</div>;
    render(
      <ErrorBoundary fallback={FallbackComp}>
        <ThrowingComponent shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText('Fallback Component')).toBeTruthy();
  });
});

describe('PanelErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <PanelErrorBoundary>
        <ThrowingComponent />
      </PanelErrorBoundary>
    );
    expect(screen.getByText('Child content')).toBeTruthy();
  });

  it('shows DefaultErrorFallback on error', () => {
    render(
      <PanelErrorBoundary componentName="Test Panel">
        <ThrowingComponent shouldThrow />
      </PanelErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText(/Test Panel/)).toBeTruthy();
  });

  it('shows Try Again button when canRetry', () => {
    render(
      <PanelErrorBoundary maxRetries={3}>
        <ThrowingComponent shouldThrow />
      </PanelErrorBoundary>
    );
    expect(screen.getByText(/Try Again/i)).toBeTruthy();
  });

  it('shows error details when error is present', () => {
    render(
      <PanelErrorBoundary>
        <ThrowingComponent shouldThrow />
      </PanelErrorBoundary>
    );
    expect(screen.getByText('Error Details')).toBeTruthy();
    expect(screen.getByText('Test error message')).toBeTruthy();
  });

  it('calls onError prop', () => {
    const onError = vi.fn();
    render(
      <PanelErrorBoundary onError={onError}>
        <ThrowingComponent shouldThrow />
      </PanelErrorBoundary>
    );
    expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.anything());
  });

  it('reports to window.errorTracker when available', () => {
    const captureException = vi.fn();
    (window as typeof window & { errorTracker?: unknown }).errorTracker = { captureException };
    render(
      <PanelErrorBoundary componentName="TestComp">
        <ThrowingComponent shouldThrow />
      </PanelErrorBoundary>
    );
    expect(captureException).toHaveBeenCalled();
    delete (window as typeof window & { errorTracker?: unknown }).errorTracker;
  });
});

describe('DefaultErrorFallback', () => {
  it('renders with canRetry=true shows Try Again button', () => {
    const onRetry = vi.fn();
    render(<DefaultErrorFallback onRetry={onRetry} canRetry={true} />);
    expect(screen.getByText(/Try Again/i)).toBeTruthy();
  });

  it('hides Try Again when canRetry=false', () => {
    render(<DefaultErrorFallback onRetry={() => {}} canRetry={false} />);
    expect(screen.queryByText(/Try Again/i)).toBeNull();
  });

  it('calls onRetry when button clicked', () => {
    const onRetry = vi.fn();
    render(<DefaultErrorFallback onRetry={onRetry} canRetry={true} />);
    fireEvent.click(screen.getByRole('button', { name: /Try Again/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('shows componentName in message', () => {
    render(<DefaultErrorFallback onRetry={() => {}} canRetry={true} componentName="Fog Panel" />);
    expect(screen.getByText(/Fog Panel/)).toBeTruthy();
  });
});

describe('Safe wrapper components', () => {
  it('SafePaintPanel catches errors and shows paint error UI', () => {
    render(
      <SafePaintPanel>
        <ThrowingComponent shouldThrow />
      </SafePaintPanel>
    );
    expect(screen.getByText('Paint System Error')).toBeTruthy();
  });

  it('SafeLightingPanel catches errors and shows lighting error UI', () => {
    render(
      <SafeLightingPanel>
        <ThrowingComponent shouldThrow />
      </SafeLightingPanel>
    );
    expect(screen.getByText('Lighting System Error')).toBeTruthy();
  });

  it('SafeFogPanel catches errors and shows fog error UI', () => {
    render(
      <SafeFogPanel>
        <ThrowingComponent shouldThrow />
      </SafeFogPanel>
    );
    expect(screen.getByText('Fog System Error')).toBeTruthy();
  });

  it('SafeCompendiumPanel catches errors and shows compendium error UI', () => {
    render(
      <SafeCompendiumPanel>
        <ThrowingComponent shouldThrow />
      </SafeCompendiumPanel>
    );
    expect(screen.getByText('Compendium Error')).toBeTruthy();
  });

  it('SafeComponent renders children when no error', () => {
    render(
      <SafeComponent componentName="Test">
        <ThrowingComponent />
      </SafeComponent>
    );
    expect(screen.getByText('Child content')).toBeTruthy();
  });

  it('SafeComponent shows default fallback on error', () => {
    render(
      <SafeComponent componentName="Generic">
        <ThrowingComponent shouldThrow />
      </SafeComponent>
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });
});
