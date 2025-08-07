import { useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import SidePanel from './components/SidePanel';
import FloatingButton from './components/FloatingButton';
import { useChromeMessage } from './hooks/useChromeMessage';
import { useUrlChange } from './hooks/useUrlChange';
import { CHROME_ACTIONS } from './utils/constants';
import type { ChromeMessage } from './types';

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

  // Chrome 메시지 처리
  useChromeMessage((message: ChromeMessage) => {
    if (message.action === CHROME_ACTIONS.TOGGLE_PANEL) {
      toggleSidePanel();
    }
  });

  // URL 변경 감지
  useUrlChange(() => {
    // URL 변경 시 필요한 로직 처리
  });

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