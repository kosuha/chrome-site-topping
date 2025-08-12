import SidePanel from './SidePanel';
import FloatingButton from './FloatingButton';
import { useAppContext } from '../contexts/AppContext';
import { useChromeMessage } from '../hooks/useChromeMessage';
import { useUrlChange } from '../hooks/useUrlChange';
import { CHROME_ACTIONS } from '../utils/constants';
import type { ChromeMessage } from '../types';
import usePersistHistory from '../hooks/usePersistHistory';
import { getAllVersions, reconstructFromVersions } from '../services/versioning';
import aiService from '../services/aiService';
import { useEffect } from 'react';

export default function AppWrapper() {
  const { state, actions } = useAppContext();

  useChromeMessage((message: ChromeMessage) => {
    if (message.action === CHROME_ACTIONS.TOGGLE_PANEL) {
      actions.togglePanel();
    }
  });

  useUrlChange(() => {
    // URL 변경 시 필요한 로직 처리
  });

  // 히스토리 영속화 활성화
  usePersistHistory();

  // 초기 구동 시 서버 히스토리 로드 및 복원
  useEffect(() => {
    (async () => {
      try {
        const siteCode = await aiService.getCurrentSiteCode();
        if (!siteCode) return;
        const versions = await getAllVersions(siteCode);
        const steps = reconstructFromVersions(versions);
        if (steps.length === 0) return;

        // 첫 단계는 에디터에 반영하고 스택 초기화
        const first = steps[0];
        actions.setEditorCode('javascript', first.javascript || '');
        actions.setEditorCode('css', first.css || '');
        actions.clearCodeHistory();

        // 나머지 단계는 히스토리에만 적재 (description=복원됨)
        for (let i = 1; i < steps.length; i++) {
          const s = steps[i];
          actions.pushCodeHistory({
            javascript: s.javascript,
            css: s.css,
            messageId: s.messageId,
            description: '복원됨',
            changeSummary: s.changeSummary,
            isSuccessful: true,
          });
        }

        // 최종 단계 코드로 에디터 업데이트 (중복 push 없이 직접 셋팅)
        const last = steps[steps.length - 1];
        actions.setEditorCode('javascript', last.javascript || '');
        actions.setEditorCode('css', last.css || '');
      } catch (e) {
        console.error('히스토리 복원 실패:', e);
      }
    })();
  }, []);

  return (
    <>
      <FloatingButton 
        onClick={actions.togglePanel}
        isVisible={!state.isOpen}
      />
      <SidePanel 
        isOpen={state.isOpen} 
        onClose={actions.closePanel}
      />
    </>
  );
}