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
  const ensureContentScriptLoaded = useCallback(async (_: number): Promise<void> => {
    try {
      
      // Content script is automatically injected by manifest, but might not be ready yet
      // Just wait a bit for it to initialize
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      console.warn('[SidePanel] Content script initialization wait failed:', error);
    }
  }, []);

  const sendMessageToActiveTab = useCallback(async (message: TabMessage): Promise<TabMessageResponse> => {
    try {
      // Get the current active tab
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!activeTab || !activeTab.id) {
        throw new Error('No active tab found');
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