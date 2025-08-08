import { toggleSidePanel } from './services/chrome';
import { supabase } from './services/supabase';

chrome.action.onClicked.addListener(async (tab) => {
    if (tab.id) {
        await toggleSidePanel(tab.id);
    }
});

// OAuth tab listener
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        const url = new URL(tab.url)
        
        // Check if this is our OAuth callback
        if (url.pathname === '/auth/callback' || url.hash.includes('access_token')) {
            try {
                // Extract tokens from URL
                const hashParams = new URLSearchParams(url.hash.substring(1))
                const accessToken = hashParams.get('access_token')
                const refreshToken = hashParams.get('refresh_token')
                
                if (accessToken) {
                    // Set the session in Supabase
                    const { data, error } = await supabase.auth.setSession({
                        access_token: accessToken,
                        refresh_token: refreshToken || ''
                    })
                    
                    if (!error) {
                        // Store user session
                        await chrome.storage.local.set({
                            'supabase.auth.token': JSON.stringify(data.session)
                        })
                        
                        // Close the auth tab
                        chrome.tabs.remove(tabId)
                        
                        // Notify content script of successful auth
                        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                            if (tabs[0]) {
                                chrome.tabs.sendMessage(tabs[0].id!, {
                                    type: 'AUTH_SUCCESS',
                                    user: data.user
                                })
                            }
                        })
                    }
                }
            } catch (error) {
                console.error('OAuth callback error:', error)
            }
        }
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

    // Handle auth requests from content script
    if (message.type === 'INIT_OAUTH') {
        initOAuth(message.provider)
            .then(sendResponse)
            .catch(error => sendResponse({ error: error.message }))
        return true // Keep message channel open for async response
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

async function initOAuth(provider: string) {
    try {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: provider as any,
            options: {
                redirectTo: chrome.identity.getRedirectURL()
            }
        })
        
        if (error) throw error
        
        // Open OAuth URL in new tab
        await chrome.tabs.create({ url: data.url })
        
        return { success: true }
    } catch (error) {
        console.error('OAuth initialization error:', error)
        throw error
    }
}