import type { FC } from 'react';

type TabType = 'measure' | 'shapes' | 'grids' | 'templates' | 'settings';

interface TabNavigationProps {
  selectedTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export const TabNavigation: FC<TabNavigationProps> = ({ selectedTab, onTabChange }) => (
  <div className="tab-navigation">
    {(['measure', 'shapes', 'grids', 'templates', 'settings'] as TabType[]).map(tab => (
      <button
        key={tab}
        className={`tab-btn ${selectedTab === tab ? 'active' : ''}`}
        onClick={() => onTabChange(tab)}
      >
        {tab.charAt(0).toUpperCase() + tab.slice(1)}
      </button>
    ))}
  </div>
);

export type { TabType };
