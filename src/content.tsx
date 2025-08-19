// Content script for Site Topping Chrome Extension
// This script runs in the context of web pages to handle communication with the side panel

console.log('[Content Script] Site Topping content script loaded');

// Listen for messages from side panel or background script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('[Content Script] Received message:', message);
  
  // Handle different message types here
  switch (message.type) {
    case 'GET_PAGE_INFO':
      // Get current page information
      sendResponse({
        url: window.location.href,
        title: document.title,
        domain: window.location.hostname
      });
      break;
      
    case 'INJECT_CSS':
      // Inject CSS into the page
      if (message.css) {
        injectCSS(message.css);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'No CSS provided' });
      }
      break;
      
    case 'INJECT_JS':
      // Inject JavaScript into the page
      if (message.js) {
        try {
          // Use Function constructor for safer execution
          const func = new Function(message.js);
          func();
          sendResponse({ success: true });
        } catch (error) {
          console.error('[Content Script] JS injection error:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          sendResponse({ success: false, error: errorMessage });
        }
      } else {
        sendResponse({ success: false, error: 'No JavaScript provided' });
      }
      break;
      
    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }
  
  // Return true to indicate we'll send a response asynchronously
  return true;
});

// Function to inject CSS into the page
function injectCSS(css: string) {
  // Remove previous Site Topping styles
  const existingStyles = document.querySelectorAll('style[data-site-topping="true"]');
  existingStyles.forEach(style => style.remove());
  
  // Create new style element
  const style = document.createElement('style');
  style.setAttribute('data-site-topping', 'true');
  style.textContent = css;
  document.head.appendChild(style);
}