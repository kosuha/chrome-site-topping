import { useEffect } from 'react';
import styles from '../styles/SidePanel.module.css';
import { TABS } from '../utils/constants';
import { useAppContext } from '../contexts/AppContext';
import { ArrowRightFromLine, BotMessageSquare, Code, User, Eye, EyeClosed, Upload } from 'lucide-react';
import { applyCodeToPage, removeCodeFromPage } from '../services/codePreview';
import { useDebounce } from '../hooks/useDebounce';

interface PanelHeaderProps {
  onClose: () => void;
}

export default function PanelHeader({ onClose }: PanelHeaderProps) {
  const { state, actions } = useAppContext();
  const { activeTab } = state;
  
  // 코드 변경을 500ms 디바운스
  const debouncedCSS = useDebounce(state.editorCode.css, 500);
  const debouncedJS = useDebounce(state.editorCode.javascript, 2000);

  const switchTab = (tabName: 'code' | 'chat' | 'user') => {
    actions.setActiveTab(tabName);
  };

  const handleDeploy = async () => {
    // MVP: 배포 기능 구현 예정
    console.log('Deploy current code:', state.editorCode);
    // TODO: 서버로 코드 전송
  };

  const handlePreviewToggle = async () => {
    if (state.isPreviewMode) {
      removeCodeFromPage();
    } else {
      await applyCodeToPage(state.editorCode.css, state.editorCode.javascript);
    }
    actions.togglePreviewMode();
  };

  // 프리뷰 모드일 때 디바운스된 코드 변경시 적용
  useEffect(() => {
    if (state.isPreviewMode) {
      applyCodeToPage(debouncedCSS, debouncedJS);
    }
  }, [debouncedCSS, debouncedJS, state.isPreviewMode]);

  return (
    <div className={styles.panelHeader}>
      <div className={styles.tabBar}>
        <button className={styles.tabBtn} onClick={onClose}>
          <ArrowRightFromLine size={24} />
        </button>
        <button 
          className={`${styles.tabBtn} ${state.isPreviewMode ? styles.activePreview : ''}`}
          onClick={handlePreviewToggle}
          title={state.isPreviewMode ? "미리보기 숨기기" : "미리보기 보기"}
        >
          {state.isPreviewMode ? <Eye size={24} /> : <EyeClosed size={24} />}
        </button>
        <button 
          className={styles.tabBtn}
          onClick={handleDeploy}
          title="배포"
        >
          <Upload size={24} />
        </button>
      </div>

      {/* divider */}
      <div className={styles.divider}></div>

      <div className={styles.tabBar}>
        <button 
          className={`${styles.tabBtn} ${activeTab === TABS.CHAT ? styles.active : ''}`}
          onClick={() => switchTab(TABS.CHAT)}
        >
          <BotMessageSquare size={24} />
        </button>
        <button 
          className={`${styles.tabBtn} ${activeTab === TABS.CODE ? styles.active : ''}`}
          onClick={() => switchTab(TABS.CODE)}
        >
          <Code size={24} />
        </button>
        {/* <button className={`${styles.tabBtn} ${activeTab === TABS.FILELIST ? styles.active : ''}`}
          onClick={() => switchTab(TABS.FILELIST)}
        >
          <FolderOpen size={24} />
        </button> */}
        <button className={`${styles.tabBtn} ${activeTab === TABS.USER ? styles.active : ''}`}
          onClick={() => switchTab('user')}
        >
          <User size={24} />
        </button>
      </div>
    </div>
  );
}