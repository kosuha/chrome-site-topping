import React, { useState, useEffect, useRef } from 'react';
import styles from '../styles/SidePanel.module.css';
import { SIDE_PANEL, TABS } from '../utils/constants';
import type { SidePanelProps } from '../types';

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
      <div 
        className={styles.resizeHandle}
        onMouseDown={handleResizeStart}
      />
      
      <div className={styles.panelHeader}>
        <h3 className={styles.title}>Site Topping</h3>
        <button className={styles.closeBtn} onClick={onClose}>
          &times;
        </button>
      </div>
      
      <div className={styles.tabBar}>
        <button 
          className={`${styles.tabBtn} ${activeTab === TABS.CODE ? styles.active : ''}`}
          onClick={() => switchTab(TABS.CODE)}
        >
          코드 수정
        </button>
        <button 
          className={`${styles.tabBtn} ${activeTab === TABS.CHAT ? styles.active : ''}`}
          onClick={() => switchTab(TABS.CHAT)}
        >
          채팅
        </button>
      </div>
      
      <div className={styles.panelContent}>
        <div className={`${styles.tabContent} ${activeTab === TABS.CODE ? styles.active : ''}`}>
          {/* 코드 수정 탭 내용 */}
          <div>코드 수정 탭</div>
        </div>
        <div className={`${styles.tabContent} ${activeTab === TABS.CHAT ? styles.active : ''}`}>
          {/* 채팅 탭 내용 */}
          <div>채팅 탭</div>
        </div>
      </div>
    </div>
  );
}