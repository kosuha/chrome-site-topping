// Side Panel entry point
import { createRoot } from 'react-dom/client';
import { AppProvider } from './contexts/AppContext';
import { AuthProvider } from './contexts/AuthContext';
import SidePanelApp from './components/SidePanelApp';

function App() {
  return (
    <AppProvider>
      <AuthProvider>
        <SidePanelApp />
      </AuthProvider>
    </AppProvider>
  );
}

// Initialize the side panel app
const container = document.getElementById('sidepanel-root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}