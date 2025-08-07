import React, { useState, useEffect, useRef } from 'react';
import styles from '../styles/SidePanel.module.css';
import { SIDE_PANEL, TABS } from '../utils/constants';
import type { SidePanelProps } from '../types';
import { ArrowRightFromLine, BotMessageSquare, Code } from 'lucide-react';
import CodeEditTab from './CodeEditTab';
import ChatTab from './ChatTab';

export default function SidePanel({ isOpen, onClose }: SidePanelProps) {
  const [activeTab, setActiveTab] = useState<'code' | 'chat'>(TABS.CODE);
  const [width, setWidth] = useState<number>(SIDE_PANEL.DEFAULT_WIDTH);
  const sidePanelRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleResizeStart = (e: React.MouseEvent) => {
    isResizing.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', handleResizeEnd);
    document.body.style.userSelect = 'none';
    e.preventDefault();
  };

  const handleResize = (e: MouseEvent) => {
    if (!isResizing.current) return;
    
    const deltaX = startX.current - e.clientX;
    const newWidth = Math.max(SIDE_PANEL.MIN_WIDTH, Math.min(SIDE_PANEL.MAX_WIDTH, startWidth.current + deltaX));
    setWidth(newWidth);
  };

  const handleResizeEnd = () => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', handleResizeEnd);
    document.body.style.userSelect = '';
  };

  const switchTab = (tabName: 'code' | 'chat') => {
    setActiveTab(tabName);
  };

  useEffect(() => {
    return () => {
      if (isResizing.current) {
        handleResizeEnd();
      }
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div 
      ref={sidePanelRef}
      className={`${styles.sidePanel} ${isOpen ? styles.open : ''}`}
      style={{ width: `${width}px` }}
    >
      
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
      
      <div 
        className={styles.resizeHandle}
        onMouseDown={handleResizeStart}
      />
      
      <div className={styles.panelContent}>
        <div className={`${styles.tabContent} ${activeTab === TABS.CODE ? styles.active : ''}`}>
          <CodeEditTab />
        </div>
        <div className={`${styles.tabContent} ${activeTab === TABS.CHAT ? styles.active : ''}`}>
          <ChatTab />
        </div>
      </div>
    </div>
  );
}