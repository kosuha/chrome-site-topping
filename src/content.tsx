// Content script for Site Topping Chrome Extension
// This script runs in the context of web pages to handle communication with the side panel

import { disablePreview, applyCodeToPage, removeCodeFromPage } from './services/codePreview';
import { enableElementInspector, disableElementInspector } from './services/elementInspector';

console.log('[Content Script] Site Topping content script loaded');

// Listen for messages from side panel or background script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('[Content Script] Received message:', message);
  
  // Handle async operations
  const handleMessage = async () => {
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
        // Inject CSS into the page using codePreview service
        try {
          await applyCodeToPage(message.css || '', '');
          sendResponse({ success: true });
        } catch (error) {
          console.error('[Content Script] CSS injection error:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          sendResponse({ success: false, error: errorMessage });
        }
        break;
        
      case 'INJECT_JS':
        // Inject JavaScript into the page using codePreview service
        try {
          await applyCodeToPage('', message.js || '');
          sendResponse({ success: true });
        } catch (error) {
          console.error('[Content Script] JS injection error:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          sendResponse({ success: false, error: errorMessage });
        }
        break;
        
      case 'APPLY_CODE':
        // Apply both CSS and JavaScript together (better for JavaScript baseline restoration)
        try {
          await applyCodeToPage(message.css || '', message.js || '');
          sendResponse({ success: true });
        } catch (error) {
          console.error('[Content Script] Code application error:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          sendResponse({ success: false, error: errorMessage });
        }
        break;
        
      case 'REMOVE_CODE':
        // 기존 적용된 코드만 제거 (베이스라인 복구는 하지 않음)
        try {
          removeCodeFromPage();
          sendResponse({ success: true });
        } catch (error) {
          console.error('[Content Script] Remove code error:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          sendResponse({ success: false, error: errorMessage });
        }
        break;
        
      case 'DISABLE_PREVIEW':
        // 완전한 원상복구를 위해 disablePreview() 호출
        try {
          disablePreview();
          sendResponse({ success: true });
        } catch (error) {
          console.error('[Content Script] Disable preview error:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          sendResponse({ success: false, error: errorMessage });
        }
        break;
        
      case 'ENABLE_ELEMENT_INSPECTOR':
        // 요소 인스펙터 활성화
        try {
          enableElementInspector();
          sendResponse({ success: true });
        } catch (error) {
          console.error('[Content Script] Enable inspector error:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          sendResponse({ success: false, error: errorMessage });
        }
        break;
        
      case 'DISABLE_ELEMENT_INSPECTOR':
        // 요소 인스펙터 비활성화
        try {
          disableElementInspector();
          sendResponse({ success: true });
        } catch (error) {
          console.error('[Content Script] Disable inspector error:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          sendResponse({ success: false, error: errorMessage });
        }
        break;
        
      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  };
  
  // Execute the async handler
  handleMessage().catch(error => {
    console.error('[Content Script] Message handling error:', error);
    sendResponse({ success: false, error: 'Message handling failed' });
  });
  
  // Return true to indicate we'll send a response asynchronously
  return true;
});