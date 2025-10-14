import { useCallback } from 'react';

export interface TabMessage {
  type: string;
  [key: string]: any;
}

export interface TabMessageResponse {
  success: boolean;
  error?: string;
  [key: string]: any;
}

// Hook for sending messages from side panel to active tab
export function useSidePanelMessage() {
  const ensureContentScriptLoaded = useCallback(async (tabId: number): Promise<void> => {
    try {
      const tab = await chrome.tabs.get(tabId);
      const url = tab.url || '';
      if (!/^https?:\/\//i.test(url)) {
        throw new Error('지원되지 않는 페이지입니다.');
      }

      const manifest = chrome.runtime.getManifest();
      const scriptFiles =
        manifest.content_scripts?.flatMap((entry) => entry.js ?? []) ?? [];
      if (!scriptFiles.length) return;

      const uniqueFiles = Array.from(new Set(scriptFiles));

      await chrome.scripting.executeScript({
        target: { tabId },
        files: uniqueFiles,
      });

      // 콘텐츠 스크립트가 초기화될 시간을 조금 준다.
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.warn('[SidePanel] Content script injection failed:', error);
      throw error;
    }
  }, []);

  const sendMessageToActiveTab = useCallback(async (message: TabMessage): Promise<TabMessageResponse> => {
    try {
      // Get the current active tab (side panel may not share window focus)
      let [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab) {
        [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      }
      if (!activeTab || activeTab.id === undefined) {
        throw new Error('No active tab found');
      }

      if (activeTab.url && !/^https?:\/\//i.test(activeTab.url)) {
        throw new Error('이 페이지에서는 인스펙터를 사용할 수 없습니다.');
      }

      // First attempt: try to send message directly
      try {
        const response = await chrome.tabs.sendMessage(activeTab.id, message);
        return response || { success: false, error: 'No response from content script' };
      } catch (connectionError) {
        console.warn('[SidePanel] First attempt failed, trying to inject content script...', connectionError);
        
        // Second attempt: inject content script and retry
        await ensureContentScriptLoaded(activeTab.id);
        
        const response = await chrome.tabs.sendMessage(activeTab.id, message);
        return response || { success: false, error: 'No response from content script after retry' };
      }
    } catch (error) {
      console.error('[SidePanel] Failed to send message to active tab:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }, [ensureContentScriptLoaded]);

  const getCurrentTabInfo = useCallback(async () => {
    return sendMessageToActiveTab({ type: 'GET_PAGE_INFO' });
  }, [sendMessageToActiveTab]);

  const injectCSS = useCallback(async (css: string) => {
    return sendMessageToActiveTab({ type: 'INJECT_CSS', css });
  }, [sendMessageToActiveTab]);

  const injectJS = useCallback(async (js: string) => {
    return sendMessageToActiveTab({ type: 'INJECT_JS', js });
  }, [sendMessageToActiveTab]);

  return {
    sendMessageToActiveTab,
    getCurrentTabInfo,
    injectCSS,
    injectJS
  };
}
