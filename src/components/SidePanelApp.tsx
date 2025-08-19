import { useAppContext } from '../contexts/AppContext';
import CodeEditTab from './CodeEditTab';
import ChatTab from './ChatTab';
import PanelHeader from './PanelHeader';
import UserTab from './UserTab';
import { TABS } from '../utils/constants';
import styles from '../styles/SidePanel.module.css';
import usePersistHistory from '../hooks/usePersistHistory';

export default function SidePanelApp() {
  const { state } = useAppContext();
  const { activeTab } = state;

  // 히스토리 영속화 활성화
  usePersistHistory();

  return (
    <div style={{ 
      width: '100%', 
      height: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
    }}>
      {/* Header at the top */}
      <div style={{ flexShrink: 0 }}>
        <PanelHeader />
      </div>
      
      {/* Content area below header */}
      <div style={{ 
        flex: 1, 
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div className={`${styles.tabContent} ${activeTab === TABS.CODE ? styles.active : ''}`}>
          <CodeEditTab />
        </div>
        <div className={`${styles.tabContent} ${activeTab === TABS.CHAT ? styles.active : ''}`}>
          <ChatTab />
        </div>
        <div className={`${styles.tabContent} ${activeTab === TABS.USER ? styles.active : ''}`}>
          <UserTab />
        </div>
      </div>
    </div>
  );
}