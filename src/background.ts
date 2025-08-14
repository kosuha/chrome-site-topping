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
    if (message.type === 'EXECUTE_SCRIPT' && sender.tab?.id) {
        executeScriptInTab(sender.tab.id, message.code)
            .then((result) => {
                sendResponse({ success: true, result });
            })
            .catch((error) => {
                sendResponse({ success: false, error: error.message });
            });
        return true; // 비동기 응답을 위해 true 반환
    }

    // 현재 도메인 가져오기 요청 처리
    if (message.type === 'GET_CURRENT_DOMAIN' && sender.tab?.id) {
        getCurrentDomain(sender.tab.id)
            .then((domain) => {
                sendResponse({ success: true, domain });
            })
            .catch((error) => {
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

async function getCurrentDomain(tabId: number): Promise<string | null> {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.url) {
            // 특정 탭 ID로 탭 정보 가져오기
            const specificTab = await chrome.tabs.get(tabId);
            if (!specificTab?.url) return null;
            
            const url = new URL(specificTab.url);
            return url.hostname;
        }

        const url = new URL(tab.url);
        return url.hostname;
    } catch (error) {
        console.error('[Background] Error getting current domain:', error);
        return null;
    }
}

async function executeScriptInTab(tabId: number, code: string): Promise<any> {
    // Method 1: World MAIN을 사용해서 페이지 메인 컨텍스트에서 실행 (가장 강력)
    try {
        const result = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN', // 페이지의 메인 컨텍스트에서 실행 (CSP 우회)
            func: (jsCode: string) => {
                try {
                    // Function constructor 사용 (CSP 정책 준수)
                    const func = new Function(jsCode);
                    return func();
                } catch (funcError) {
                    console.error('[MAIN World] Function constructor failed:', funcError);
                    // Script element fallback
                    try {
                        const script = document.createElement('script');
                        script.textContent = jsCode;
                        document.head.appendChild(script);
                        document.head.removeChild(script);
                        return { success: true, method: 'script-element' };
                    } catch (scriptError) {
                        console.error('[MAIN World] Script element failed:', scriptError);
                        return { success: false, error: scriptError instanceof Error ? scriptError.message : 'Script execution failed' };
                    }
                }
            },
            args: [code]
        });
        
        return result;
    } catch (mainWorldError) {
        console.error('[Background] MAIN world execution failed:', mainWorldError);
        
        // Method 2: ISOLATED world에서 DOM 조작으로 우회
        try {
            const result = await chrome.scripting.executeScript({
                target: { tabId },
                world: 'ISOLATED', 
                func: (jsCode: string) => {
                    
                    // 방법 1: iframe의 contentWindow 사용
                    try {
                        const iframe = document.createElement('iframe');
                        iframe.style.display = 'none';
                        iframe.src = 'about:blank';
                        document.body.appendChild(iframe);
                        
                        iframe.onload = () => {
                            try {
                                const iframeWindow = iframe.contentWindow;
                                if (iframeWindow) {
                                    // Function constructor 사용 (CSP 정책 준수)
                                    const func = new (iframeWindow as any).Function(jsCode);
                                    func();
                                }
                            } catch (e) {
                                console.error('[ISOLATED] iframe Function constructor failed:', e);
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
                                    // Function constructor 사용 (CSP 정책 준수)
                                    const func = new Function(e.detail.code);
                                    func();
                                } catch (funcErr) {
                                    console.error('[CustomEvent] Function constructor failed:', funcErr);
                                    // Script element fallback
                                    try {
                                        const script = document.createElement('script');
                                        script.textContent = e.detail.code;
                                        document.head.appendChild(script);
                                        document.head.removeChild(script);
                                    } catch (scriptErr) {
                                        console.error('[CustomEvent] Script element failed:', scriptErr);
                                    }
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