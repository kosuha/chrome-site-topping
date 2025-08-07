import { useState, useEffect } from 'react';
import { createRoot, Root } from 'react-dom/client';
import SidePanel from './SidePanel';
import FloatingButton from './FloatingButton';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function App() {
  const [isOpen, setIsOpen] = useState(false);

  const toggleSidePanel = () => {
    setIsOpen(prev => !prev);
  };

  const closeSidePanel = () => {
    setIsOpen(false);
  };

  useEffect(() => {
    // Listen for messages from background script
    const messageListener = (message: any, _sender: any, sendResponse: (response: any) => void) => {
      if (message.action === 'toggleSidePanel') {
        toggleSidePanel();
        sendResponse({ success: true });
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    // URL change observer for SPA navigation
    let currentUrl = window.location.href;
    const observer = new MutationObserver(() => {
      if (currentUrl !== window.location.href) {
        currentUrl = window.location.href;
        // URL changed - can be used for tab content updates if needed
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
      observer.disconnect();
    };
  }, []);

  return (
    <>
      <FloatingButton 
        onClick={toggleSidePanel}
        isVisible={!isOpen}
      />
      <SidePanel 
        isOpen={isOpen} 
        onClose={closeSidePanel}
      />
    </>
  );
}

function initializeApp() {
  if (!container) {
    container = document.createElement('div');
    container.id = 'site-topping-root';
    document.body.appendChild(container);

    root = createRoot(container);
    root.render(<App />);
  }
}

// Initialize the app when script loads
initializeApp();