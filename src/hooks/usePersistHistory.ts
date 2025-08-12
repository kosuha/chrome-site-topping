import { useEffect, useRef } from 'react';
import { useAppContext } from '../contexts/AppContext';
import aiService from '../services/aiService';
import { persistHistoryStep } from '../services/versioning';

/**
 * 코드 히스토리 변경을 감지하여 서버에 20스텝 주기로 스냅샷/패치를 저장
 */
export default function usePersistHistory() {
  const { state } = useAppContext();
  const prevStackLenRef = useRef<number>(state.codeHistoryStack.length);

  useEffect(() => {
    const stackLen = state.codeHistoryStack.length;
    const prevLen = prevStackLenRef.current;

    // push가 발생한 경우(스택 길이 증가)에만 저장 로직 수행
    if (stackLen > prevLen && state.currentHistoryIndex === stackLen - 1) {
      const current: any = state.codeHistoryStack[stackLen - 1];
      const previous = state.codeHistoryStack[stackLen - 2] || null;

      // 복원/초기화로 추가된 항목은 저장하지 않음
      const desc = (current?.description || '').toString();
      if (desc.includes('복원됨') || desc.includes('히스토리 초기화')) {
        prevStackLenRef.current = stackLen;
        return;
      }

      (async () => {
        const siteCode = await aiService.getCurrentSiteCode();
        if (!siteCode) return;
        try {
          await persistHistoryStep({
            siteCode,
            previous: previous ? { javascript: previous.javascript, css: previous.css } : { javascript: '', css: '' },
            current: { javascript: current.javascript, css: current.css },
            messageId: current.messageId,
            changeSummary: current.changeSummary,
          });
        } catch (e) {
          console.error('버전 저장 실패:', e);
        }
      })();
    }

    prevStackLenRef.current = stackLen;
  }, [state.codeHistoryStack, state.currentHistoryIndex]);
}
