import { useEffect, useState } from 'react';
import styles from '../styles/SidePanel.module.css';
import { TABS } from '../utils/constants';
import { useAppContext } from '../contexts/AppContext';
import { ArrowRightFromLine, BotMessageSquare, Code, User, Eye, EyeClosed, Upload, ArrowBigLeft, ArrowBigRight, Crosshair } from 'lucide-react';
import { applyCodeToPage, disablePreview } from '../services/codePreview';
import { useDebounce } from '../hooks/useDebounce';
import { SiteIntegrationService } from '../services/siteIntegration';
import { enableElementInspector, disableElementInspector, isElementInspectorActive } from '../services/elementInspector';

interface PanelHeaderProps {
  onClose: () => void;
}

export default function PanelHeader({ onClose }: PanelHeaderProps) {
  const { state, actions } = useAppContext();
  const { activeTab } = state;
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployStatus, setDeployStatus] = useState<{ type: 'success' | 'error' | null; message: string | null }>({ type: null, message: null });
  const siteService = SiteIntegrationService.getInstance();
  
  // 요소 선택(인스펙터) 상태
  const [isPicking, setIsPicking] = useState(false);
  
  // 코드 변경을 500ms 디바운스
  const debouncedCSS = useDebounce(state.editorCode.css, 500);
  const debouncedJS = useDebounce(state.editorCode.javascript, 2000);

  const switchTab = (tabName: 'code' | 'chat' | 'user') => {
    actions.setActiveTab(tabName);
  };

  const handleDeploy = async () => {
    if (isDeploying) return;

    try {
      setIsDeploying(true);
      setDeployStatus({ type: null, message: null });

      // 현재 도메인에 해당하는 사이트 찾기
      const sites = await siteService.getUserSites();
      const currentDomain = window.location.hostname;
      const currentSite = Array.isArray(sites) ? sites.find((site: any) => site.domain === currentDomain) : null;

      if (!currentSite) {
        setDeployStatus({ 
          type: 'error', 
          message: `현재 도메인 ${currentDomain}이 등록되지 않았습니다. UserTab에서 사이트를 먼저 등록해주세요.` 
        });
        return;
      }

      if (!currentSite.site_code) {
        setDeployStatus({ 
          type: 'error', 
          message: '사이트 코드가 없습니다. 사이트 등록을 다시 확인해주세요.' 
        });
        return;
      }

      // CSS와 JavaScript 코드를 분리해서 배포
      const cssContent = state.editorCode.css || '';
      const jsContent = state.editorCode.javascript || '';

      // 서버에 배포 (CSS와 JS 분리)
      await siteService.deployScript(currentSite.site_code, cssContent, jsContent);
      
      setDeployStatus({ 
        type: 'success', 
        message: `${currentSite.site_name || currentSite.domain}에 성공적으로 배포되었습니다!` 
      });

    } catch (error) {
      console.error('배포 실패:', error);
      setDeployStatus({ 
        type: 'error', 
        message: error instanceof Error ? error.message : '배포 중 오류가 발생했습니다.' 
      });
    } finally {
      setIsDeploying(false);
    }
  };

  const handlePreviewToggle = async () => {
    if (state.isPreviewMode) {
      disablePreview();
    } else {
      await applyCodeToPage(state.editorCode.css, state.editorCode.javascript);
    }
    actions.togglePreviewMode();
  };

  // 요소 선택 토글
  const handlePickerToggle = () => {
    const nowActive = isElementInspectorActive();
    if (nowActive) {
      disableElementInspector();
      setIsPicking(false);
    } else {
      enableElementInspector();
      setIsPicking(true);
    }
  };

  // 프리뷰 모드일 때 디바운스된 코드 변경시 적용
  useEffect(() => {
    if (state.isPreviewMode) {
      applyCodeToPage(debouncedCSS, debouncedJS);
    }
  }, [debouncedCSS, debouncedJS, state.isPreviewMode]);

  // 배포 상태 메시지를 3초 후 자동으로 숨김
  useEffect(() => {
    if (deployStatus.type) {
      const timer = setTimeout(() => {
        setDeployStatus({ type: null, message: null });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [deployStatus.type]);

  // 요소 선택 모드 메시지 동기화 및 언마운트 정리
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.source !== window || !e.data) return;
      const data = e.data as any;
      if (data.type === 'SITE_TOPPING_PICKER_START') setIsPicking(true);
      if (data.type === 'SITE_TOPPING_PICKER_STOP' || data.type === 'SITE_TOPPING_ELEMENT_PICKED') setIsPicking(false);
    };
    window.addEventListener('message', handler);
    return () => {
      window.removeEventListener('message', handler);
      disableElementInspector();
    };
  }, []);

  const handleClose = () => {
    // 패널 닫을 때 인스펙터 종료
    disableElementInspector();
    onClose();
  };

  return (
    <div className={styles.panelHeader}>
      <div className={styles.tabBar}>
        <button className={styles.tabBtn} onClick={handleClose}>
          <ArrowRightFromLine size={24} />
        </button>
        <button 
          className={`${styles.tabBtn} ${state.isPreviewMode ? styles.activePreview : ''}`}
          onClick={handlePreviewToggle}
          title={state.isPreviewMode ? "미리보기 숨기기" : "미리보기 보기"}
        >
          {state.isPreviewMode ? <Eye size={24} /> : <EyeClosed size={24} />}
        </button>
        {/* 요소 선택 토글 */}
        <button
          className={`${styles.tabBtn} ${isPicking ? styles.activePreview : ''}`}
          onClick={handlePickerToggle}
          title={isPicking ? '요소 선택 종료(Esc)' : '요소 선택'}
        >
          <Crosshair size={24} />
        </button>
        <button 
          className={`${styles.tabBtn} ${isDeploying ? styles.loading : ''}`}
          onClick={handleDeploy}
          disabled={isDeploying}
          title={isDeploying ? "배포 중..." : "배포"}
        >
          <Upload size={24} />
        </button>

        {/* 전역 히스토리 제어 버튼 */}
        <button
          className={styles.tabBtn}
          onClick={() => actions.goBackHistory()}
          disabled={state.currentHistoryIndex <= 0}
          title="코드 변경 이전으로"
        >
          <ArrowBigLeft size={24} />
        </button>
        <button
          className={styles.tabBtn}
          onClick={() => actions.goForwardHistory()}
          disabled={state.currentHistoryIndex >= state.codeHistoryStack.length - 1}
          title="코드 변경 이후로"
        >
          <ArrowBigRight size={24} />
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

      {/* 배포 상태 메시지 */}
      {deployStatus.type && (
        <div className={`${styles.statusMessage} ${styles[deployStatus.type]}`}>
          {deployStatus.message}
        </div>
      )}
    </div>
  );
}