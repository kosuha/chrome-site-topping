import { useEffect, useMemo, useRef } from 'react';
import { useDebounce } from './useDebounce';
import { applyCodeToPage, updateCodePreview } from '../services/codePreview';

interface Params {
  isPreviewMode: boolean;
  javascript?: string;
  css?: string;
  debounceMs?: number;
}

// 미리보기 모드에서 코드 초기 적용 및 변경 시 실시간 업데이트를 처리하는 훅
export function usePreviewLive({ isPreviewMode, javascript = '', css = '', debounceMs = 600 }: Params) {
  const combined = useMemo(() => `${css || ''}\n/*__SEP__*/\n${javascript || ''}`, [css, javascript]);
  const debouncedCombined = useDebounce(combined, debounceMs);

  const isInitializingRef = useRef(false);
  const isPreviewActiveRef = useRef(isPreviewMode);

  useEffect(() => {
    isPreviewActiveRef.current = isPreviewMode;
  }, [isPreviewMode]);

  // 프리뷰 진입 시 초기 적용
  useEffect(() => {
    if (!isPreviewMode) return;

    const initPreview = async () => {
      try {
        isInitializingRef.current = true;
        if (!isPreviewActiveRef.current) return;
        await applyCodeToPage(css || '', javascript || '');
      } catch (error) {
        console.error('[usePreviewLive] 초기 적용 실패:', error);
      } finally {
        isInitializingRef.current = false;
      }
    };

    void initPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreviewMode]);

  // 코드 변경 시 실시간 업데이트
  useEffect(() => {
    if (!isPreviewMode || isInitializingRef.current) return;

    const run = async () => {
      try {
        if (!isPreviewActiveRef.current) return;
        await updateCodePreview(css || '', javascript || '');
      } catch (error) {
        console.error('[usePreviewLive] 실시간 업데이트 실패:', error);
        try {
          await applyCodeToPage(css || '', javascript || '');
        } catch (fallbackError) {
          console.error('[usePreviewLive] 폴백 적용도 실패:', fallbackError);
        }
      }
    };

    void run();
  }, [debouncedCombined, isPreviewMode, css, javascript]);
}
