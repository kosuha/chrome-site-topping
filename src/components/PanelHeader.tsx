import React from 'react';
import styles from '../styles/SidePanel.module.css';
import { TABS } from '../utils/constants';
import { useAppContext } from '../contexts/AppContext';
import { ArrowRightFromLine, BotMessageSquare, Code } from 'lucide-react';

interface PanelHeaderProps {
  onClose: () => void;
}

export default function PanelHeader({ onClose }: PanelHeaderProps) {
  const { state, actions } = useAppContext();
  const { activeTab } = state;

  const switchTab = (tabName: 'code' | 'chat') => {
    actions.setActiveTab(tabName);
  };

  return (
    <div className={styles.panelHeader}>
      <button className={styles.closeBtn} onClick={onClose}>
        <ArrowRightFromLine size={24} />
      </button>
      <div className={styles.tabBar}>
        <button 
          className={`${styles.tabBtn} ${activeTab === TABS.CODE ? styles.active : ''}`}
          onClick={() => switchTab(TABS.CODE)}
        >
          <Code size={24} />
        </button>
        <button 
          className={`${styles.tabBtn} ${activeTab === TABS.CHAT ? styles.active : ''}`}
          onClick={() => switchTab(TABS.CHAT)}
        >
          <BotMessageSquare size={24} />
        </button>
      </div>
    </div>
  );
}