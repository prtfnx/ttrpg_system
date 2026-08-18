import clsx from 'clsx';
import type { FC } from 'react';
import styles from '../AdvancedMeasurementPanel.module.css';

type TabType = 'measure' | 'shapes' | 'grids' | 'settings';

interface TabNavigationProps {
  selectedTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export const TabNavigation: FC<TabNavigationProps> = ({ selectedTab, onTabChange }) => (
  <div className={styles.tabNavigation}>
    {(['measure', 'shapes', 'grids', 'settings'] as TabType[]).map(tab => (
      <button
        type="button"
        key={tab}
        className={clsx(styles['tab-btn'], selectedTab === tab && styles.active)}
        onClick={() => onTabChange(tab)}
        aria-pressed={selectedTab === tab}
      >
        {tab.charAt(0).toUpperCase() + tab.slice(1)}
      </button>
    ))}
  </div>
);

export type { TabType };
