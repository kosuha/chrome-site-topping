import { useEffect, useRef } from 'react';
import type { ChromeMessage } from '../types';

export const useChromeMessage = (onMessage: (message: ChromeMessage) => void) => {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    const handleMessage = (
      message: ChromeMessage,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void
    ) => {
      onMessageRef.current(message);
      sendResponse({ success: true });
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);
};