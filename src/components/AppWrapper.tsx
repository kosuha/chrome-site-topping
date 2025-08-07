import SidePanel from './SidePanel';
import FloatingButton from './FloatingButton';
import { useAppContext } from '../contexts/AppContext';
import { useChromeMessage } from '../hooks/useChromeMessage';
import { useUrlChange } from '../hooks/useUrlChange';
import { CHROME_ACTIONS } from '../utils/constants';
import type { ChromeMessage } from '../types';

export default function AppWrapper() {
  const { state, actions } = useAppContext();

  useChromeMessage((message: ChromeMessage) => {
    if (message.action === CHROME_ACTIONS.TOGGLE_PANEL) {
      actions.togglePanel();
    }
  });

  useUrlChange(() => {
    // URL 변경 시 필요한 로직 처리
  });

  return (
    <>
      <FloatingButton 
        onClick={actions.togglePanel}
        isVisible={!state.isOpen}
      />
      <SidePanel 
        isOpen={state.isOpen} 
        onClose={actions.closePanel}
      />
    </>
  );
}