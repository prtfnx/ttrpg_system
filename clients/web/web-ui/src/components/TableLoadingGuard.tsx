/**
 * TableLoadingGuard Component
 * Displays loading state or errors while table is loading
 * Implements Phase 4: Initialization Guard
 */

import React from 'react';
import { useGameStore } from '../store';
import styles from './TableLoadingGuard.module.css';

interface TableLoadingGuardProps {
  children: React.ReactNode;
}

export const TableLoadingGuard: React.FC<TableLoadingGuardProps> = ({ children }) => {
  const { activeTableId, tableReady, tableLoadError } = useGameStore();

  // Show error if table failed to load
  if (tableLoadError) {
    return (
      <div className={styles.errorContainer}>
        <div className={styles.errorIcon}>⚠️</div>
        <h2>Table Load Error</h2>
        <p className={styles.errorMessage}>{tableLoadError}</p>
        <button 
          className={styles.retryButton}
          onClick={() => {
            useGameStore.getState().setTableLoadError(null);
            useGameStore.getState().requestTableList();
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // Show loading if table is not ready
  if (!tableReady || !activeTableId) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <h3>Loading Table...</h3>
        <p>Connecting to game server</p>
      </div>
    );
  }

  // Table is ready, render children
  return <>{children}</>;
};
