import clsx from 'clsx';
import React from 'react';
import styles from './LoadingSpinner.module.css';

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
      className={clsx(styles.loadingSpinner, styles[size], className)}
      style={{ color }}
      role="status"
      aria-label="Loading"
    >
      <div className={styles.spinnerCircle}></div>
    </div>
  );
};