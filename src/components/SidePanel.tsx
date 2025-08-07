import React, { useEffect, useRef } from 'react';
import styles from '../styles/SidePanel.module.css';
import { SIDE_PANEL, TABS } from '../utils/constants';
import { useAppContext } from '../contexts/AppContext';
import CodeEditTab from './CodeEditTab';
import ChatTab from './ChatTab';
import PanelHeader from './PanelHeader';
import UserTab from './UserTab';
import FileListTab from './FileListTab';

interface SidePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SidePanel({ isOpen, onClose }: SidePanelProps) {
  const { state, actions } = useAppContext();
  const { activeTab, width } = state;
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
    actions.setWidth(newWidth);
  };

  const handleResizeEnd = () => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', handleResizeEnd);
    document.body.style.userSelect = '';
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
      <PanelHeader onClose={onClose} /> 
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
        <div className={`${styles.tabContent} ${activeTab === TABS.USER ? styles.active : ''}`}>
          <UserTab />
        </div>
        <div className={`${styles.tabContent} ${activeTab === TABS.FILELIST ? styles.active : ''}`}>
          <FileListTab />
        </div>
      </div>
    </div>
  );
}