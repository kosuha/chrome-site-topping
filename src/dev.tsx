import React from 'react';
import ReactDOM from 'react-dom/client';
import SidePanel from './components/SidePanel';

const DevApp: React.FC = () => {
  return (
    <div style={{ 
      position: 'fixed', 
      right: 0, 
      top: 0, 
      height: '100vh',
      zIndex: 10000 
    }}>
      <SidePanel isOpen={true} onClose={() => console.log('Close clicked')} />
    </div>
  );
};

const container = document.createElement('div');
container.id = 'dev-sidepanel';
document.body.appendChild(container);

const root = ReactDOM.createRoot(container);
root.render(<DevApp />);