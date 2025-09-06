import { useEffect, useState } from 'react';
import styles from '../styles/SidePanel.module.css';
import { TABS } from '../utils/constants';
import { useAppContext } from '../contexts/AppContext';
import { BotMessageSquare, User, Eye, EyeClosed, Upload, ArrowBigLeft, ArrowBigRight, CodeXml, Check, X, SquareDashedMousePointer } from 'lucide-react';
import { SiteIntegrationService } from '../services/siteIntegration';
import { removeCodeFromPage } from '../services/codePreview';
import { usePreviewLive } from '../hooks/usePreviewLive';
import { useElementInspector } from '../hooks/useElementInspector';
import { IconButton, Divider } from './header/HeaderButtons';
import useMembership from '../hooks/useMembership';
import { supabase } from '../services/supabase';

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
  const { isSubscribed } = useMembership();

  const { active: isInspectorActive, toggle: toggleInspector, setActive: setInspectorActive } = useElementInspector();
  const [isToggling, setIsToggling] = useState(false);
  const [isNavigatingBack, setIsNavigatingBack] = useState(false);
  const [isNavigatingForward, setIsNavigatingForward] = useState(false);

  const switchTab = (tabName: 'code' | 'chat' | 'user') => {
    actions.setActiveTab(tabName);
  };

  // (헤더) 지갑 잔액 배지는 제거됨

  const handleDeploy = async () => {
    if (isDeploying) return;

    try {
      setIsDeploying(true);
      setDeploySuccess(false);
      setDeployFailed(false);

      if (!isSubscribed) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          alert('배포는 로그인 후 이용 가능합니다. User 탭에서 로그인해주세요.');
        } else {
          alert('배포는 구독 기능입니다. User 탭에서 구독을 진행해주세요.');
        }
        setDeployFailed(true);
        return;
      }

      // 선택된 사이트 코드가 있는지 확인
      if (!state.selectedSiteCode) {
        alert('배포할 사이트를 선택해주세요.\n\n사용자 탭에서 사이트를 선택하세요.');
        setDeployFailed(true);
        return;
      }

      // CSS와 JavaScript 코드를 분리해서 배포
      const cssContent = state.editorCode.css || '';
      const jsContent = state.editorCode.javascript || '';

      console.log('🚀 [PanelHeader] 선택된 사이트로 배포:', state.selectedSiteCode);

      // 서버에 배포 (CSS와 JS 분리)
      await siteService.deployScript(state.selectedSiteCode, cssContent, jsContent);
      
      setDeploySuccess(true);
      console.log('✅ [PanelHeader] 배포 성공');

    } catch (error) {
      console.error('❌ [PanelHeader] 배포 실패:', error);
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
      alert(`배포 실패: ${errorMessage}`);
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
        // 프리뷰 끄기: 코드 제거 후 리로드
        try {
          await removeCodeFromPage();
        } catch (e) {
          console.error('프리뷰 제거 실패:', e);
        }
      }
      actions.togglePreviewMode();
    } finally {
      setIsToggling(false);
    }
  };

  // 요소 인스펙터 토글 함수
  const handleInspectorToggle = async () => {
    await toggleInspector();
  };

  // 프리뷰 실시간 업데이트 훅으로 대체
  usePreviewLive({
    isPreviewMode: state.isPreviewMode,
    javascript: state.editorCode.javascript,
    css: state.editorCode.css,
  });

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
    // Chrome extension runtime 메시지 리스너
    const handleRuntimeMessage = (message: any) => {
      if (message.type === 'SITE_TOPPING_ELEMENT_PICKED') {
        const selector = message.selector;
        if (selector) {
          // 단일 브로드캐스트: 각 탭은 자신이 활성일 때만 처리
          window.postMessage({ type: 'SITE_TOPPING_ELEMENT_PICKED', selector }, '*');
          setInspectorActive(false);
        }
      } else if (message.type === 'SITE_TOPPING_PICKER_STOP') {
        setInspectorActive(false);
      }
    };

    const handleWindowMessage = (event: MessageEvent) => {
  if (event.data?.type === 'SITE_TOPPING_PICKER_STOP') setInspectorActive(false);
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
        <IconButton
          active={state.isPreviewMode}
          loading={isToggling}
          onClick={handlePreviewToggle}
          title={isToggling ? '처리 중...' : (state.isPreviewMode ? '미리보기 숨기기' : '미리보기 보기')}
          className={state.isPreviewMode ? styles.activePreview : ''}
        >
          {state.isPreviewMode ? <Eye size={24} /> : <EyeClosed size={24} />}
        </IconButton>
        <IconButton
          loading={isDeploying}
          disabled={!isSubscribed}
          onClick={handleDeploy}
          title={isDeploying ? '배포 중...' : (!isSubscribed ? '구독 필요' : '배포')}
        >
          {deploySuccess ? <Check size={24} className={styles.successCheck} /> : deployFailed ? <X size={24} className={styles.failedX} /> : <Upload size={24} />}
        </IconButton>

        <IconButton
          active={isInspectorActive}
          onClick={handleInspectorToggle}
          title={isInspectorActive ? '요소 선택 종료' : '요소 선택'}
        >
          <SquareDashedMousePointer size={24} />
        </IconButton>

        {/* 전역 히스토리 제어 버튼 */}
        <IconButton
          loading={isNavigatingBack}
          disabled={state.currentHistoryIndex <= 0 || isNavigatingBack || isNavigatingForward}
          onClick={async () => {
            if (isNavigatingBack || isNavigatingForward) return;
            setIsNavigatingBack(true);
            try {
              actions.goBackHistory();
              await new Promise((r) => setTimeout(r, 500));
            } finally {
              setIsNavigatingBack(false);
            }
          }}
          title={isNavigatingBack ? '이동 중...' : '코드 변경 이전으로'}
        >
          <ArrowBigLeft size={24} />
        </IconButton>
        <IconButton
          loading={isNavigatingForward}
          disabled={state.currentHistoryIndex >= state.codeHistoryStack.length - 1 || isNavigatingBack || isNavigatingForward}
          onClick={async () => {
            if (isNavigatingBack || isNavigatingForward) return;
            setIsNavigatingForward(true);
            try {
              actions.goForwardHistory();
              await new Promise((r) => setTimeout(r, 500));
            } finally {
              setIsNavigatingForward(false);
            }
          }}
          title={isNavigatingForward ? '이동 중...' : '코드 변경 이후로'}
        >
          <ArrowBigRight size={24} />
        </IconButton>
      </div>

      <div className={styles.tabBar}>
        {/* divider */}
  <Divider />
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