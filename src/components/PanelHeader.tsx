import { useEffect, useState } from 'react';
import styles from '../styles/SidePanel.module.css';
import { TABS } from '../utils/constants';
import { useAppContext } from '../contexts/AppContext';
import { ArrowRightFromLine, BotMessageSquare, User, Eye, EyeClosed, Upload, ArrowBigLeft, ArrowBigRight, Crosshair, CodeXml, Loader2, Check, X } from 'lucide-react';
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
  const [deploySuccess, setDeploySuccess] = useState(false);
  const [deployFailed, setDeployFailed] = useState(false);
  const siteService = SiteIntegrationService.getInstance();
  
  // 요소 선택(인스펙터) 상태
  const [isPicking, setIsPicking] = useState(false);
  
  // 프리뷰 토글 상태 보호
  const [isToggling, setIsToggling] = useState(false);
  
  // 히스토리 이동 로딩 상태
  const [isNavigatingBack, setIsNavigatingBack] = useState(false);
  const [isNavigatingForward, setIsNavigatingForward] = useState(false);
  
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
      setDeploySuccess(false);
      setDeployFailed(false);

      // 현재 도메인에 해당하는 사이트 찾기
      const sites = await siteService.getUserSites();
      const currentDomain = window.location.hostname;
      const currentSite = Array.isArray(sites) ? sites.find((site: any) => site.domain === currentDomain) : null;

      if (!currentSite) {
        console.error(`현재 도메인 ${currentDomain}이 등록되지 않았습니다.`);
        setDeployFailed(true);
        return;
      }

      if (!currentSite.site_code) {
        console.error('사이트 코드가 없습니다.');
        setDeployFailed(true);
        return;
      }

      // CSS와 JavaScript 코드를 분리해서 배포
      const cssContent = state.editorCode.css || '';
      const jsContent = state.editorCode.javascript || '';

      // 서버에 배포 (CSS와 JS 분리)
      await siteService.deployScript(currentSite.site_code, cssContent, jsContent);
      
      setDeploySuccess(true);

    } catch (error) {
      console.error('배포 실패:', error);
      setDeployFailed(true);
    } finally {
      setIsDeploying(false);
    }
  };

  const handlePreviewToggle = async () => {
    // 토글이 진행 중이면 중복 실행 방지
    if (isToggling) return;
    
    setIsToggling(true);
    
    try {
      if (state.isPreviewMode) {
        disablePreview();
        // DOM 복구 완료까지 충분한 대기
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        await applyCodeToPage(state.editorCode.css, state.editorCode.javascript);
      }
      actions.togglePreviewMode();
    } finally {
      setIsToggling(false);
    }
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

  // 배포 성공 아이콘을 2초 후 자동으로 숨김
  useEffect(() => {
    if (deploySuccess) {
      const timer = setTimeout(() => {
        setDeploySuccess(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [deploySuccess]);

  // 배포 실패 아이콘을 2초 후 자동으로 숨김
  useEffect(() => {
    if (deployFailed) {
      const timer = setTimeout(() => {
        setDeployFailed(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [deployFailed]);

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
          className={`${styles.tabBtn} ${state.isPreviewMode ? styles.activePreview : ''} ${isToggling ? styles.loading : ''}`}
          onClick={handlePreviewToggle}
          title={isToggling ? "처리 중..." : (state.isPreviewMode ? "미리보기 숨기기" : "미리보기 보기")}
          disabled={isToggling}
        >
          {isToggling ? (
            <Loader2 size={24} className={styles.spinner} />
          ) : (
            state.isPreviewMode ? <Eye size={24} /> : <EyeClosed size={24} />
          )}
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
          {deploySuccess ? (
            <Check size={24} className={styles.successCheck} />
          ) : deployFailed ? (
            <X size={24} className={styles.failedX} />
          ) : (
            <Upload size={24} />
          )}
        </button>

        {/* 전역 히스토리 제어 버튼 */}
        <button
          className={`${styles.tabBtn} ${isNavigatingBack ? styles.loading : ''}`}
          onClick={async () => {
            if (isNavigatingBack || isNavigatingForward) return;
            setIsNavigatingBack(true);
            try {
              actions.goBackHistory();
              // 짧은 딜레이로 시각적 피드백 제공
              await new Promise(resolve => setTimeout(resolve, 500));
            } finally {
              setIsNavigatingBack(false);
            }
          }}
          disabled={state.currentHistoryIndex <= 0 || isNavigatingBack || isNavigatingForward}
          title={isNavigatingBack ? "이동 중..." : "코드 변경 이전으로"}
        >
          {isNavigatingBack ? (
            <Loader2 size={24} className={styles.spinner} />
          ) : (
            <ArrowBigLeft size={24} />
          )}
        </button>
        <button
          className={styles.tabBtn}
          onClick={async () => {
            if (isNavigatingBack || isNavigatingForward) return;
            setIsNavigatingForward(true);
            try {
              actions.goForwardHistory();
              // 짧은 딜레이로 시각적 피드백 제공
              await new Promise(resolve => setTimeout(resolve, 500));
            } finally {
              setIsNavigatingForward(false);
            }
          }}
          disabled={state.currentHistoryIndex >= state.codeHistoryStack.length - 1 || isNavigatingBack || isNavigatingForward}
          title={isNavigatingForward ? "이동 중..." : "코드 변경 이후로"}
        >
          {isNavigatingForward ? (
            <Loader2 size={24} className={styles.spinner} />
          ) : (
            <ArrowBigRight size={24} />
          )}
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
          <CodeXml size={24} />
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