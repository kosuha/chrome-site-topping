import { useEffect, useRef } from 'react';

export const useUrlChange = (callback: () => void) => {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    let lastUrl = window.location.href;

    const handleUrlChange = () => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        callbackRef.current();
      }
    };

    // history API 감지
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    window.history.pushState = function (...args) {
      originalPushState.apply(window.history, args);
      setTimeout(handleUrlChange, 0);
    };

    window.history.replaceState = function (...args) {
      originalReplaceState.apply(window.history, args);
      setTimeout(handleUrlChange, 0);
    };

    window.addEventListener('popstate', handleUrlChange);

    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.removeEventListener('popstate', handleUrlChange);
    };
  }, []);
};