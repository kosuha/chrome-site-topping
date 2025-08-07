import { useEffect } from 'react';
import type { ChromeMessage } from '../types';

export const useChromeMessage = (onMessage: (message: ChromeMessage) => void) => {
  useEffect(() => {
    const handleMessage = (
      message: ChromeMessage,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void
    ) => {
      onMessage(message);
      sendResponse({ success: true });
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [onMessage]);
};