import React from 'react';
import './LoadingSpinner.css';

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  color?: string;
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'medium',
  color = 'currentColor',
  className = ''
}) => {
  return (
    <div 
      className={`loading-spinner loading-spinner-${size} ${className}`}
      style={{ color }}
      role="status"
      aria-label="Loading"
    >
      <div className="spinner-circle"></div>
    </div>
  );
};