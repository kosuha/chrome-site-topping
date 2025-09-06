import { useCallback, useEffect, useState } from 'react';
import { useSidePanelMessage } from './useSidePanelMessage';

// 요소 인스펙터 토글 및 종료 이벤트를 관리하는 훅
export function useElementInspector() {
  const { sendMessageToActiveTab } = useSidePanelMessage();
  const [active, setActive] = useState(false);

  const toggle = useCallback(async () => {
    try {
      if (active) {
        await sendMessageToActiveTab({ type: 'DISABLE_ELEMENT_INSPECTOR' });
        setActive(false);
      } else {
        const result = await sendMessageToActiveTab({ type: 'ENABLE_ELEMENT_INSPECTOR' });
        if ((result as any)?.success) setActive(true);
      }
    } catch (e) {
      console.error('인스펙터 토글 실패:', e);
    }
  }, [active, sendMessageToActiveTab]);

  useEffect(() => {
    const onRuntime = (message: any) => {
      if (message?.type === 'SITE_TOPPING_PICKER_STOP') setActive(false);
    };
    const onWindow = (event: MessageEvent) => {
      if (event.data?.type === 'SITE_TOPPING_PICKER_STOP') setActive(false);
    };
    chrome.runtime.onMessage.addListener(onRuntime);
    window.addEventListener('message', onWindow);
    return () => {
      chrome.runtime.onMessage.removeListener(onRuntime);
      window.removeEventListener('message', onWindow);
    };
  }, []);

  return { active, toggle, setActive } as const;
}
