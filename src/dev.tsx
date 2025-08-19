import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppProvider } from './contexts/AppContext';
import { AuthProvider } from './contexts/AuthContext';
import SidePanelApp from './components/SidePanelApp';

const DevPanel: React.FC = () => {
  return <SidePanelApp />;
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