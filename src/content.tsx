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
          success: true,
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
        
      case 'CHECK_SCRIPT_INSTALLED':
        // 사이트 연동 스크립트 설치 여부 확인
        try {
          const { siteCode, scriptUrl } = message;
          console.log('[Content Script] 스크립트 설치 확인:', { siteCode, scriptUrl });
          
          // 1. DOM에서 스크립트 태그 존재 여부 확인
          const existingScript = document.querySelector(`script[src="${scriptUrl}"]`);
          if (existingScript) {
            console.log('[Content Script] 스크립트 태그 발견:', scriptUrl);
            sendResponse({ success: true, installed: true, method: 'script_tag' });
            return;
          }
          
          // 2. window 객체에 사이트 식별자 확인
          const siteIdentifier = `siteTopping_${siteCode}`;
          if ((window as any)[siteIdentifier]) {
            console.log('[Content Script] 사이트 식별자 발견:', siteIdentifier);
            sendResponse({ success: true, installed: true, method: 'site_identifier' });
            return;
          }
          
          // 3. 일반적인 site-topping 관련 요소들 확인
          const siteElements = document.querySelectorAll('[data-site-topping]');
          if (siteElements.length > 0) {
            console.log('[Content Script] site-topping 요소들 발견:', siteElements.length, '개');
            sendResponse({ success: true, installed: true, method: 'data_attributes' });
            return;
          }
          
          console.log('[Content Script] 연동 스크립트 설치 확인 안됨');
          sendResponse({ success: true, installed: false });
        } catch (error) {
          console.error('[Content Script] 스크립트 설치 확인 오류:', error);
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