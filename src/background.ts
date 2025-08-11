import { toggleSidePanel } from './services/chrome';
import { supabase } from './services/supabase';

// Initialize declarativeNetRequest rules
chrome.runtime.onInstalled.addListener(async () => {
    console.log('[Background] Extension installed, static blocking rules from rules.json are active');
});

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
    console.log('[Background] Executing script in tab:', tabId, 'Code length:', code.length);
    
    // Method 1: World MAIN을 사용해서 페이지 메인 컨텍스트에서 실행 (가장 강력)
    try {
        const result = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN', // 페이지의 메인 컨텍스트에서 실행 (CSP 우회)
            func: (jsCode: string) => {
                console.log('[MAIN World] Executing code:', jsCode.substring(0, 100) + '...');
                try {
                    // 직접 eval 실행 (MAIN world에서는 CSP 영향 받지 않음)
                    return eval(jsCode);
                } catch (evalError) {
                    console.error('[MAIN World] Eval failed:', evalError);
                    // Function constructor 시도
                    const func = new Function(jsCode);
                    return func();
                }
            },
            args: [code]
        });
        
        console.log('[Background] MAIN world execution successful:', result);
        return result;
    } catch (mainWorldError) {
        console.error('[Background] MAIN world execution failed:', mainWorldError);
        
        // Method 2: ISOLATED world에서 DOM 조작으로 우회
        try {
            const result = await chrome.scripting.executeScript({
                target: { tabId },
                world: 'ISOLATED', 
                func: (jsCode: string) => {
                    console.log('[ISOLATED World] Attempting DOM injection');
                    
                    // 방법 1: iframe의 contentWindow 사용
                    try {
                        const iframe = document.createElement('iframe');
                        iframe.style.display = 'none';
                        iframe.src = 'about:blank';
                        document.body.appendChild(iframe);
                        
                        iframe.onload = () => {
                            try {
                                const iframeWindow = iframe.contentWindow;
                                if (iframeWindow && (iframeWindow as any).eval) {
                                    (iframeWindow as any).eval(jsCode);
                                }
                            } catch (e) {
                                console.error('[ISOLATED] iframe eval failed:', e);
                            }
                            iframe.remove();
                        };
                        
                        return { success: true, method: 'iframe' };
                    } catch (iframeError) {
                        console.error('[ISOLATED] iframe method failed:', iframeError);
                    }
                    
                    // 방법 2: 이벤트 리스너를 통한 실행
                    try {
                        const script = document.createElement('script');
                        script.id = 'site-topping-injected-' + Date.now();
                        
                        // 텍스트 콘텐츠 대신 src를 data URL로 설정
                        const dataURL = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(`
                            (function() {
                                try {
                                    ${jsCode}
                                } catch (e) {
                                    console.error('[Data URL] Execution error:', e);
                                }
                            })();
                        `);
                        
                        script.src = dataURL;
                        document.head.appendChild(script);
                        
                        setTimeout(() => script.remove(), 1000);
                        return { success: true, method: 'data-url' };
                    } catch (dataUrlError) {
                        console.error('[ISOLATED] data URL method failed:', dataUrlError);
                    }
                    
                    // 방법 3: CustomEvent를 통한 실행
                    try {
                        const event = new CustomEvent('site-topping-execute', {
                            detail: { code: jsCode }
                        });
                        
                        // 페이지에 리스너가 없다면 생성
                        if (!(window as any).__siteTopping_eventListenerAdded) {
                            window.addEventListener('site-topping-execute', (e: any) => {
                                try {
                                    eval(e.detail.code);
                                } catch (evalErr) {
                                    console.error('[CustomEvent] Eval failed:', evalErr);
                                }
                            });
                            (window as any).__siteTopping_eventListenerAdded = true;
                        }
                        
                        window.dispatchEvent(event);
                        return { success: true, method: 'custom-event' };
                    } catch (eventError) {
                        console.error('[ISOLATED] custom event method failed:', eventError);
                    }
                    
                    return { success: false, error: 'All methods failed' };
                },
                args: [code]
            });
            
            console.log('[Background] ISOLATED world execution result:', result);
            return result;
        } catch (isolatedError) {
            console.error('[Background] All execution methods failed:', isolatedError);
            const errorMessage = isolatedError instanceof Error ? isolatedError.message : String(isolatedError);
            throw new Error(`Script execution failed: ${errorMessage}`);
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