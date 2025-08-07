import { createRoot, Root } from 'react-dom/client';
import { AppProvider } from './contexts/AppContext';
import AppWrapper from './components/AppWrapper';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function App() {
  return (
    <AppProvider>
      <AppWrapper />
    </AppProvider>
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