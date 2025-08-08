import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { AppProvider, useAppContext } from './contexts/AppContext';
import { AuthProvider } from './contexts/AuthContext';
import SidePanel from './components/SidePanel';

const DevPanel: React.FC = () => {
  const { actions } = useAppContext();
  
  useEffect(() => {
    actions.openPanel();
  }, [actions]);

  return <SidePanel isOpen={true} onClose={() => console.log('Close clicked')} />;
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppProvider>
        <DevPanel />
      </AppProvider>
    </AuthProvider>
  );
};

const container = document.createElement('div');
container.id = 'site-topping-root';
document.body.appendChild(container);

const root = ReactDOM.createRoot(container);
root.render(<App />);