import { CHROME_ACTIONS } from '../utils/constants';
import type { ChromeMessage } from '../types';

// Chrome 익스텐션 메시지 전송
export const sendChromeMessage = async (tabId: number, message: ChromeMessage): Promise<any> => {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    console.error('Failed to send Chrome message:', error);
    throw error;
  }
};

// 사이드패널 토글 (재시도 로직 포함)
export const toggleSidePanel = async (tabId: number): Promise<void> => {
  const message: ChromeMessage = { action: CHROME_ACTIONS.TOGGLE_PANEL };
  
  try {
    await sendChromeMessage(tabId, message);
  } catch (error) {
    
    setTimeout(async () => {
      try {
        await sendChromeMessage(tabId, message);
      } catch (retryError) {
        console.error('Failed to toggle side panel after retry:', retryError);
      }
    }, 100);
  }
};