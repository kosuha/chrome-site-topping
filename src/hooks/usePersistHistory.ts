import { useEffect, useRef } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { persistHistoryStep } from '../services/versioning';
import membershipService from '../services/membershipService';

/**
 * 코드 히스토리 변경을 감지하여 서버에 20스텝 주기로 스냅샷/패치를 저장
 */
export default function usePersistHistory() {
  const { state } = useAppContext();
  const prevStackLenRef = useRef<number>(state.codeHistoryStack.length);

  useEffect(() => {
    const stackLen = state.codeHistoryStack.length;
    const prevLen = prevStackLenRef.current;

    // 복원 중일 때는 저장하지 않음
    if (state.isRestoring) {
      console.log('🚫 [usePersistHistory] 복원 중이므로 저장 건너뜀');
      prevStackLenRef.current = stackLen;
      return;
    }

    // push가 발생한 경우(스택 길이 증가)에만 저장 로직 수행
    if (stackLen > prevLen && state.currentHistoryIndex === stackLen - 1) {
      const current: any = state.codeHistoryStack[stackLen - 1];
      const previous = state.codeHistoryStack[stackLen - 2] || null;

      // 복원/초기화로 추가된 항목은 저장하지 않음 ("복원" 포함 전부 차단)
      const desc = (current?.description || '').toString();
      const isRestoreLike = desc.includes('복원') || desc.includes('히스토리 초기화') || desc.includes('서버 복원');
      if (isRestoreLike) {
        console.log('🚫 [usePersistHistory] 복원/초기화 항목은 서버 저장 건너뜀:', desc);
        prevStackLenRef.current = stackLen;
        return;
      }

      // 동일 코드(완전 동일)면 저장하지 않음 → 불필요한 패치/중복 버전 방지
      if (
        previous &&
        previous.javascript === current.javascript &&
        previous.css === current.css
      ) {
        console.log('🚫 [usePersistHistory] 코드 변경 없음 - 서버 저장 스킵');
        prevStackLenRef.current = stackLen;
        return;
      }

      // 자동 저장은 AI 자동 적용 결과에 한해 허용
      const isAiAutoApply = desc.includes('AI 자동 적용');
      if (!isAiAutoApply) {
        console.log('⏭️ [usePersistHistory] 자동 저장 비활성(비-AI):', desc);
        prevStackLenRef.current = stackLen;
        return;
      }

      (async () => {
        const siteCode = state.selectedSiteCode;
        if (!siteCode) return;
        try {
          // 멤버십이 없으면 서버 저장 스킵 (무료 사용자 가드)
          const status = await membershipService.getStatus();
          const isSubscribed = !!status && status.level > 0 && !status.is_expired;
          if (!isSubscribed) {
            return;
          }
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
  }, [state.codeHistoryStack, state.currentHistoryIndex, state.isRestoring]);
}
