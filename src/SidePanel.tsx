import React, { useState, useEffect, useRef } from 'react';
import styles from './SidePanel.module.css';

interface SidePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SidePanel({ isOpen, onClose }: SidePanelProps) {
  const [activeTab, setActiveTab] = useState<'code' | 'chat'>('code');
  const [width, setWidth] = useState(420);
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
    const newWidth = Math.max(350, Math.min(800, startWidth.current + deltaX));
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
          className={`${styles.tabBtn} ${activeTab === 'code' ? styles.active : ''}`}
          onClick={() => switchTab('code')}
        >
          코드 수정
        </button>
        <button 
          className={`${styles.tabBtn} ${activeTab === 'chat' ? styles.active : ''}`}
          onClick={() => switchTab('chat')}
        >
          채팅
        </button>
      </div>
      
      <div className={styles.panelContent}>
        <div className={`${styles.tabContent} ${activeTab === 'code' ? styles.active : ''}`}>
          {/* 코드 수정 탭 내용 */}
          <div>코드 수정 탭</div>
        </div>
        <div className={`${styles.tabContent} ${activeTab === 'chat' ? styles.active : ''}`}>
          {/* 채팅 탭 내용 */}
          <div>채팅 탭</div>
        </div>
      </div>
    </div>
  );
}