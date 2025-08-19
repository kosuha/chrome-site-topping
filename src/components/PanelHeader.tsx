import { useEffect, useState } from 'react';
import styles from '../styles/SidePanel.module.css';
import { TABS } from '../utils/constants';
import { useAppContext } from '../contexts/AppContext';
import { BotMessageSquare, User, Eye, EyeClosed, Upload, ArrowBigLeft, ArrowBigRight, CodeXml, Loader2, Check, X, SquareDashedMousePointer } from 'lucide-react';
import { useDebounce } from '../hooks/useDebounce';
import { SiteIntegrationService } from '../services/siteIntegration';
import { useSidePanelMessage } from '../hooks/useSidePanelMessage';
import { createSidePanelCodePreviewService } from '../services/sidePanelCodePreview';

interface PanelHeaderProps {
  // 사이드패널에서는 props 불필요
}

export default function PanelHeader({}: PanelHeaderProps) {
  const { state, actions } = useAppContext();
  const { activeTab } = state;
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploySuccess, setDeploySuccess] = useState(false);
  const [deployFailed, setDeployFailed] = useState(false);
  const siteService = SiteIntegrationService.getInstance();
  
  // 사이드패널용 메시지 패싱
  const { sendMessageToActiveTab } = useSidePanelMessage();
  const codePreviewService = createSidePanelCodePreviewService(sendMessageToActiveTab);
  
  // 요소 인스펙터 상태
  const [isInspectorActive, setIsInspectorActive] = useState(false);
  
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

      // 현재 탭 정보 가져오기
      const tabInfo = await sendMessageToActiveTab({ type: 'GET_PAGE_INFO' });
      
      if (!tabInfo.success) {
        console.error('탭 정보를 가져올 수 없습니다:', tabInfo.error);
        setDeployFailed(true);
        return;
      }

      const currentDomain = tabInfo.domain;
      
      // 현재 도메인에 해당하는 사이트 찾기
      const sites = await siteService.getUserSites();
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
        await codePreviewService.removeCode();
      } else {
        await codePreviewService.applyCode(state.editorCode.css, state.editorCode.javascript);
      }
      actions.togglePreviewMode();
    } finally {
      setIsToggling(false);
    }
  };

  // 요소 인스펙터 토글 함수
  const handleInspectorToggle = async () => {
    try {
      if (isInspectorActive) {
        // 인스펙터 비활성화
        await sendMessageToActiveTab({ type: 'DISABLE_ELEMENT_INSPECTOR' });
        setIsInspectorActive(false);
      } else {
        // 인스펙터 활성화
        const result = await sendMessageToActiveTab({ type: 'ENABLE_ELEMENT_INSPECTOR' });
        if (result.success) {
          setIsInspectorActive(true);
        }
      }
    } catch (error) {
      console.error('인스펙터 토글 실패:', error);
    }
  };

  // 프리뷰 모드일 때 디바운스된 코드 변경시 적용
  useEffect(() => {
    if (state.isPreviewMode) {
      codePreviewService.applyCode(debouncedCSS, debouncedJS);
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


  // Chrome extension 메시지와 window 메시지 리스너 설정
  useEffect(() => {
    const lastPickRef = { selector: '', ts: 0 };

    // Chrome extension runtime 메시지 리스너
    const handleRuntimeMessage = (message: any) => {
      if (message.type === 'SITE_TOPPING_ELEMENT_PICKED') {
        const selector = message.selector;
        if (selector) {
          const now = Date.now();
          if (selector === lastPickRef.selector && now - lastPickRef.ts < 250) {
            return;
          }
          lastPickRef.selector = selector;
          lastPickRef.ts = now;
          // 단일 브로드캐스트: 각 탭은 자신이 활성일 때만 처리
          window.postMessage({ type: 'SITE_TOPPING_ELEMENT_PICKED', selector }, '*');
          setIsInspectorActive(false);
        }
      } else if (message.type === 'SITE_TOPPING_PICKER_STOP') {
        setIsInspectorActive(false);
      }
    };

    const handleWindowMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SITE_TOPPING_PICKER_STOP') {
        setIsInspectorActive(false);
      }
    };

    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
    window.addEventListener('message', handleWindowMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
      window.removeEventListener('message', handleWindowMessage);
    };
  }, []);

  return (
    <div className={styles.panelHeader}>
      <div className={styles.tabBar}>
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

        <button 
          className={`${styles.tabBtn} ${isInspectorActive ? styles.active : ''}`}
          onClick={handleInspectorToggle}
          title={isInspectorActive ? "요소 선택 종료" : "요소 선택"}
        >
          <SquareDashedMousePointer size={24} />
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

      <div className={styles.tabBar}>
        {/* divider */}
        <div className={styles.divider}></div>
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