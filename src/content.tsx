import { createRoot, Root } from 'react-dom/client';
import { AppProvider } from './contexts/AppContext';
import { AuthProvider } from './contexts/AuthContext';
import AppWrapper from './components/AppWrapper';

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let shadowRoot: ShadowRoot | null = null;

function App() {
  return (
    <AppProvider>
      <AuthProvider>
        <AppWrapper />
      </AuthProvider>
    </AppProvider>
  );
}

function initializeApp() {
  if (!container) {
    // Create container element
    container = document.createElement('div');
    container.id = 'site-topping-root';
    
    // Override zoom effects from host page
    container.style.setProperty('zoom', '1', 'important');
    // container.style.transform = 'scale(1)';
    // container.style.transformOrigin = 'top right';
    
    // Create Shadow DOM
    shadowRoot = container.attachShadow({ mode: 'closed' });
    
    // Create React root container inside Shadow DOM
    const shadowContainer = document.createElement('div');
    shadowContainer.id = 'site-topping-app';
    shadowRoot.appendChild(shadowContainer);
    
    // Inject CSS into Shadow DOM
    // Find CSS file dynamically from manifest
    const manifestUrl = chrome.runtime.getURL('.vite/manifest.json');
    fetch(manifestUrl)
      .then(response => response.json())
      .then(manifest => {
        const contentEntry = manifest['src/content.tsx'];
        if (contentEntry?.css?.[0]) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = chrome.runtime.getURL(contentEntry.css[0]);
          shadowRoot?.appendChild(link);
        }
      })
      .catch(() => {
        // Fallback: try common CSS file patterns
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('assets/content.css');
        shadowRoot?.appendChild(link);
      });
    
    // Append container to body
    document.body.appendChild(container);

    // Create React root inside Shadow DOM
    root = createRoot(shadowContainer);
    root.render(<App />);
  }
}

// Initialize the app when script loads
initializeApp();