import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { AppProvider, useAppContext } from './contexts/AppContext';
import SidePanel from './components/SidePanel';

const DevSidePanel = () => {
  const { actions } = useAppContext();
  
  useEffect(() => {
    actions.openPanel();
  }, []);

  return <SidePanel isOpen={true} onClose={() => console.log('Close clicked')} />;
};

const DevApp: React.FC = () => {
  return (
    <div style={{ 
      position: 'fixed', 
      right: 0, 
      top: 0, 
      height: '100vh',
      zIndex: 10000 
    }}>
      <AppProvider>
        <DevSidePanel />
      </AppProvider>
    </div>
  );
};

const container = document.createElement('div');
container.id = 'dev-sidepanel';
document.body.appendChild(container);

const root = ReactDOM.createRoot(container);
root.render(<DevApp />);