import { toggleSidePanel } from './services/chrome';

chrome.action.onClicked.addListener(async (tab) => {
    if (tab.id) {
        await toggleSidePanel(tab.id);
    }
});

// Content script에서 오는 JavaScript 실행 요청 처리
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Background] Received message:', message, 'from tab:', sender.tab?.id);
    
    if (message.type === 'EXECUTE_SCRIPT' && sender.tab?.id) {
        executeScriptInTab(sender.tab.id, message.code)
            .then((result) => {
                console.log('[Background] Script execution completed:', result);
                sendResponse({ success: true, result });
            })
            .catch((error) => {
                console.error('[Background] Script execution failed:', error);
                sendResponse({ success: false, error: error.message });
            });
        return true; // 비동기 응답을 위해 true 반환
    }
});

async function executeScriptInTab(tabId: number, code: string): Promise<any> {
    try {
        console.log('[Background] Executing script in tab:', tabId, 'Code:', code);
        
        // 동적으로 함수 생성해서 직접 실행
        const dynamicFunc = new Function(code) as () => any;
        
        const result = await chrome.scripting.executeScript({
            target: { tabId },
            func: dynamicFunc
        });
        
        console.log('[Background] Chrome scripting result:', result);
        return result;
    } catch (functionError) {
        console.error('[Background] Function creation failed, trying alternative:', functionError);
        
        // Function 생성이 실패하면 wrapper 함수 사용
        try {
            const result = await chrome.scripting.executeScript({
                target: { tabId },
                func: (jsCode: string) => {
                    console.log('[Injected] Executing code directly:', jsCode);
                    // 스크립트 태그 생성 방식
                    const script = document.createElement('script');
                    script.textContent = jsCode;
                    script.id = 'site-topping-injected-script';
                    
                    // 기존 스크립트가 있으면 제거
                    const existing = document.getElementById('site-topping-injected-script');
                    if (existing) {
                        existing.remove();
                    }
                    
                    document.head.appendChild(script);
                    
                    // 실행 후 정리
                    setTimeout(() => {
                        script.remove();
                    }, 100);
                    
                    return { success: true, method: 'script-tag' };
                },
                args: [code]
            });
            
            console.log('[Background] Alternative method result:', result);
            return result;
        } catch (error) {
            console.error('[Background] All execution methods failed:', error);
            throw error;
        }
    }
}