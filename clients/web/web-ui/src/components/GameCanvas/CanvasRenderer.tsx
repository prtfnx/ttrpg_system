import React from 'react';

export interface CanvasRendererProps extends React.CanvasHTMLAttributes<HTMLCanvasElement> {
  width?: number;
  height?: number;
  'data-testid'?: string;
}

/**
 * Pure canvas renderer component for testing and composition
 * Extracted from GameCanvas for better testability following React Testing Library best practices
 */
export const CanvasRenderer = React.forwardRef<HTMLCanvasElement, CanvasRendererProps>(({ 
  width = 800, 
  height = 600, 
  'data-testid': testId = 'game-canvas',
  className = 'game-canvas',
  style = { outline: 'none' },
  tabIndex = 0,
  ...props 
}, ref) => (
  <canvas
    ref={ref}
    data-testid={testId}
    className={className}
    tabIndex={tabIndex}
    style={style}
    width={width}
    height={height}
    {...props}
  />
));

CanvasRenderer.displayName = 'CanvasRenderer';

export default CanvasRenderer;