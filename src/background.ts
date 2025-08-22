import { supabase } from './services/supabase';

// 현재 적용된 프리뷰 코드 추적
interface AppliedPreview {
  tabId: number;
  cssCode: string;
  jsCode: string;
}

const appliedPreviews = new Map<number, AppliedPreview>();
const reapplyThrottle = new Map<number, number>(); // tabId -> lastTs

async function reapplyLivePreview(tabId: number) {
  const now = Date.now();
  const last = reapplyThrottle.get(tabId) || 0;
  if (now - last < 300) return; // 300ms 스로틀
  reapplyThrottle.set(tabId, now);
  const preview = appliedPreviews.get(tabId);
  if (!preview) return;
  console.log('[Background] 라이브 프리뷰 재적용:', tabId);
  if (preview.cssCode) await applyCSSToTab(tabId, preview.cssCode);
  if (preview.jsCode) await applyJSToTab(tabId, preview.jsCode);
}

// 네비게이션 완료 시(last snapshot) 재적용 (라이브 모드)
chrome.webNavigation.onCompleted.addListener(async (details) => {
  try {
    if (details.frameId !== 0) return; // 최상위 프레임만
    await reapplyLivePreview(details.tabId);
  } catch (e) {
    console.warn('[Background] 네비게이션 후 재적용 실패:', e);
  }
});

// SPA 라우팅(History API) 시에도 재적용
chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
  try {
    if (details.frameId !== 0) return;
    await reapplyLivePreview(details.tabId);
  } catch (e) {
    console.warn('[Background] SPA 라우팅 재적용 실패:', e);
  }
});

// Initialize declarativeNetRequest rules
chrome.runtime.onInstalled.addListener(async () => {
    console.log('[Background] Extension installed, static blocking rules from rules.json are active');
});

// Handle extension icon click to open side panel
chrome.action.onClicked.addListener(async (tab) => {
    if (tab.id) {
        try {
            // Open the side panel for the current tab
            await chrome.sidePanel.open({ tabId: tab.id });
        } catch (error) {
            console.error('[Background] Failed to open side panel:', error);
        }
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

// 메시지 핸들러
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Background] 메시지 수신:', message.type);
    
    // 코드 프리뷰 적용 요청
    if (message.type === 'APPLY_CODE_PREVIEW') {
        handleApplyCodePreview(message, sender, sendResponse);
        return true;
    }
    
    // 코드 프리뷰 제거 요청
    if (message.type === 'REMOVE_CODE_PREVIEW') {
        handleRemoveCodePreview(message, sender, sendResponse);
        return true;
    }
    
    // 라이브 프리뷰 재적용 요청(SPA 네비게이션 등)
    if (message.type === 'REAPPLY_LIVE_PREVIEW') {
        (async () => {
            try {
                const tabId = sender.tab?.id || message.tabId;
                if (!tabId) throw new Error('탭 ID 없음');
                await reapplyLivePreview(tabId);
                sendResponse({ success: true, reapplied: true });
            } catch (e: any) {
                sendResponse({ success: false, error: e?.message || String(e) });
            }
        })();
        return true;
    }
    
    // 기존 JavaScript 실행 요청
    if (message.type === 'EXECUTE_SCRIPT' && sender.tab?.id) {
        executeScriptInTab(sender.tab.id, message.code)
            .then((result) => {
                sendResponse({ success: true, result });
            })
            .catch((error) => {
                sendResponse({ success: false, error: error.message });
            });
        return true;
    }

    // 현재 도메인 가져오기 요청 처리 (sidepanel용)
    if (message.type === 'GET_CURRENT_DOMAIN') {
        getCurrentDomain()
            .then((domain) => {
                console.log('[Background] 도메인 조회 성공:', domain);
                sendResponse({ success: true, domain });
            })
            .catch((error) => {
                console.error('[Background] 도메인 조회 실패:', error);
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

async function getCurrentDomain(): Promise<string | null> {
    try {
        console.log('[Background] 활성 탭 도메인 조회 중...');
        
        // 현재 활성화된 탭 정보 가져오기
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab?.url) {
            console.warn('[Background] 활성 탭 URL을 찾을 수 없음');
            return null;
        }

        console.log('[Background] 활성 탭 URL:', tab.url);
        
        // chrome://이나 edge://같은 브라우저 내부 페이지는 제외
        if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
            console.warn('[Background] 브라우저 내부 페이지는 지원하지 않음:', tab.url);
            return null;
        }

        const url = new URL(tab.url);
        const domain = url.hostname;
        console.log('[Background] 추출된 도메인:', domain);
        
        return domain;
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
        const redirectUri = chrome.identity.getRedirectURL();
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: provider as any,
            options: {
                redirectTo: redirectUri,
                // 필요 시 추가 파라미터 전달 가능
                // queryParams: { prompt: 'select_account' }
            }
        })
        
        if (error) throw error
        if (!data?.url) throw new Error('OAuth URL 생성 실패')

        // Chrome이 리다이렉트를 가로채고 최종 redirect URL을 반환
        const redirectUrl = await chrome.identity.launchWebAuthFlow({
            url: data.url,
            interactive: true
        })

        if (!redirectUrl) {
            throw new Error('리다이렉트 URL을 받지 못했습니다')
        }

        // redirectUrl의 해시에서 토큰 추출
        const finalUrl = new URL(redirectUrl)
        const hash = finalUrl.hash.startsWith('#') ? finalUrl.hash.substring(1) : finalUrl.hash
        const hashParams = new URLSearchParams(hash)
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token') || ''

        if (!accessToken) {
            throw new Error('액세스 토큰을 찾을 수 없습니다')
        }

        // Supabase 세션 설정
        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
        })
        if (sessionError) throw sessionError

        // 세션 보관 (백업)
        await chrome.storage.local.set({
            'supabase.auth.token': JSON.stringify(sessionData.session)
        })

        // 컨텐츠 스크립트에 알림
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id!, {
                    type: 'AUTH_SUCCESS',
                    user: sessionData.user
                })
            }
        })

        return { success: true }
    } catch (error) {
        console.error('OAuth initialization error:', error)
        throw error
    }
}

// ====== 코드 프리뷰 함수들 ======

/**
 * 코드 프리뷰 적용 핸들러
 */
async function handleApplyCodePreview(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
    try {
        const { css, js, tabId } = message;
        
        // 현재 활성 탭 ID 가져오기
        let targetTabId = tabId || sender.tab?.id;
        
        if (!targetTabId) {
            // Side Panel에서 호출하는 경우, 현재 활성 탭을 찾음
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!activeTab?.id) {
                throw new Error('활성 탭을 찾을 수 없습니다');
            }
            targetTabId = activeTab.id;
        }
        
        console.log(`[Background] 코드 프리뷰 적용 - 탭 ${targetTabId}, CSS: ${css?.length || 0}자, JS: ${js?.length || 0}자`);
        
        // ✅ 라이브 적용: CSS는 단일 스타일 태그 교체, JS는 기존 클린업 후 재실행
        if (css && css.trim()) {
            await applyCSSToTab(targetTabId, css);
        } else {
            // CSS가 빈 경우 스타일 비우기
            await clearCSSTagInTab(targetTabId);
        }
        
        if (js && js.trim()) {
            await applyJSToTab(targetTabId, js);
        } else {
            await runJSCleanupInTab(targetTabId);
        }
        
        // 적용된 코드 추적
        appliedPreviews.set(targetTabId, {
            tabId: targetTabId,
            cssCode: css || '',
            jsCode: js || ''
        });
        
        console.log('[Background] 코드 프리뷰 적용 완료');
        sendResponse({ success: true });
        
    } catch (error) {
        console.error('[Background] 코드 프리뷰 적용 실패:', error);
        sendResponse({ success: false, error: error instanceof Error ? error.message : '알 수 없는 오류' });
    }
}

/**
 * 코드 프리뷰 제거 핸들러
 */
async function handleRemoveCodePreview(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
    try {
        const { tabId } = message;
        
        // 현재 활성 탭 ID 가져오기
        let targetTabId = tabId || sender.tab?.id;
        
        if (!targetTabId) {
            // Side Panel에서 호출하는 경우, 현재 활성 탭을 찾음
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!activeTab?.id) {
                throw new Error('활성 탭을 찾을 수 없습니다');
            }
            targetTabId = activeTab.id;
        }
        
        console.log(`[Background] 코드 프리뷰 제거 - 탭 ${targetTabId}`);
        
        await removePreviewFromTab(targetTabId);
        appliedPreviews.delete(targetTabId);
        
        console.log('[Background] 코드 프리뷰 제거 완료');
        sendResponse({ success: true });
        
    } catch (error) {
        console.error('[Background] 코드 프리뷰 제거 실패:', error);
        sendResponse({ success: false, error: error instanceof Error ? error.message : '알 수 없는 오류' });
    }
}

/**
 * 탭에 CSS 적용
 */
async function applyCSSToTab(tabId: number, css: string) {
    const scopedCSS = addCSSScoping(css);
    await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: (cssText: string) => {
            try {
                let style = document.getElementById('site-topping-style') as HTMLStyleElement | null;
                if (!style) {
                    style = document.createElement('style');
                    style.id = 'site-topping-style';
                    style.setAttribute('data-site-topping', 'style');
                    document.head.appendChild(style);
                }
                style.textContent = cssText;
                console.log('[WebPage] Site Topping 스타일 갱신');
            } catch (e) {
                console.error('[WebPage] 스타일 갱신 실패:', e);
            }
        },
        args: [scopedCSS]
    });
    console.log('[Background] CSS 라이브 적용 완료');
}

async function clearCSSTagInTab(tabId: number) {
    await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: () => {
            const style = document.getElementById('site-topping-style');
            if (style) {
                style.textContent = '';
                console.log('[WebPage] Site Topping 스타일 비움');
            }
        }
    });
}

async function runJSCleanupInTab(tabId: number) {
    await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: () => {
            try {
                const g: any = window as any;

                // DOM 변경 트래커가 있다면 되돌리고 초기화
                try {
                    g.__siteToppingChangeTracker?.stopAndRevert?.();
                } catch (e) {
                    console.warn('[WebPage] ChangeTracker revert failed:', e);
                }
                 // 배열/단일 함수 모두 지원
                 if (Array.isArray(g.__siteToppingCleanups)) {
                     g.__siteToppingCleanups.forEach((fn: any) => {
                         try { typeof fn === 'function' && fn(); } catch {}
                     });
                     g.__siteToppingCleanups = [];
                 }
                 if (typeof g.__siteTopping_cleanup === 'function') {
                     try { g.__siteTopping_cleanup(); } catch {}
                     delete g.__siteTopping_cleanup;
                 }
                 // 프리뷰로 추가한 요소들 정리
                 const previewElements = document.querySelectorAll('[data-site-topping-preview], [data-site-topping="preview"], [data-site-topping="preview-css"], [data-site-topping="preview-js"]');
                 previewElements.forEach(el => { try { el.remove(); } catch {} });
                 console.log('[WebPage] Site Topping JS 클린업 실행');
            } catch (e) {
                console.error('[WebPage] JS 클린업 실패:', e);
            }
        }
    });
}

async function ensureChangeTrackerInTab(tabId: number) {
    await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: () => {
            const g = window;
            if ((g as any).__siteToppingChangeTracker) return;
            const tracker = (() => {
                let observer = null as any;
                let sessionId = 0;
                const addedNodes: any[] = [];
                const removedNodes: any[] = [];
                const attrOld = new Map();
                const textOld = new Map();
                const addedSet = new WeakSet();
                const removedSet = new WeakSet();

                // 이벤트 리스너/타이머 추적
                let patched = false;
                let origAdd: any, origRemove: any, origSetTimeout: any, origClearTimeout: any, origSetInterval: any, origClearInterval: any;
                const addedListeners: any[] = [];
                const timeoutIds: any[] = [];
                const intervalIds: any[] = [];
                function patchGlobals() {
                    if (patched) return; patched = true;
                    try {
                        origAdd = (EventTarget.prototype as any).addEventListener;
                        origRemove = (EventTarget.prototype as any).removeEventListener;
                        (EventTarget.prototype as any).addEventListener = function(this: any, type: any, listener: any, options: any) {
                            try { addedListeners.push({ target: this as any, type, listener, options }); } catch {}
                            return origAdd.call(this, type, listener, options);
                        } as any;
                        (EventTarget.prototype as any).removeEventListener = function(this: any, type: any, listener: any, options: any) {
                            return origRemove.call(this, type, listener, options);
                        } as any;
                    } catch {}
                    try {
                        origSetTimeout = window.setTimeout;
                        origClearTimeout = window.clearTimeout;
                        window.setTimeout = function(handler: any, timeout?: number, ...args: any[]) {
                            const id = origSetTimeout(handler as any, timeout as any, ...args);
                            try { timeoutIds.push(id as any); } catch {}
                            return id as any;
                        } as any;
                        window.clearTimeout = function(id: any) {
                            try {
                                const idx = timeoutIds.indexOf(id); if (idx >= 0) timeoutIds.splice(idx, 1);
                            } catch {}
                            return origClearTimeout(id as any);
                        } as any;
                    } catch {}
                    try {
                        origSetInterval = window.setInterval;
                        origClearInterval = window.clearInterval;
                        window.setInterval = function(handler: any, timeout?: number, ...args: any[]) {
                            const id = origSetInterval(handler as any, timeout as any, ...args);
                            try { intervalIds.push(id as any); } catch {}
                            return id as any;
                        } as any;
                        window.clearInterval = function(id: any) {
                            try {
                                const idx = intervalIds.indexOf(id); if (idx >= 0) intervalIds.splice(idx, 1);
                            } catch {}
                            return origClearInterval(id as any);
                        } as any;
                    } catch {}
                }
                function unpatchGlobals() {
                    if (!patched) return; patched = false;
                    try { if (origAdd) (EventTarget.prototype as any).addEventListener = origAdd; } catch {}
                    try { if (origRemove) (EventTarget.prototype as any).removeEventListener = origRemove; } catch {}
                    try { if (origSetTimeout) window.setTimeout = origSetTimeout; } catch {}
                    try { if (origClearTimeout) window.clearTimeout = origClearTimeout; } catch {}
                    try { if (origSetInterval) window.setInterval = origSetInterval; } catch {}
                    try { if (origClearInterval) window.clearInterval = origClearInterval; } catch {}
                }

                const markEl = (el: Element) => {
                    try { el.setAttribute('data-site-topping-marked', '1'); } catch {}
                };
                function start() {
                    sessionId += 1;
                    if (observer) observer.disconnect();
                    patchGlobals();
                    observer = new MutationObserver((mutations) => {
                        for (const m of mutations as any) {
                            if (m.type === 'childList') {
                                (m.addedNodes as any).forEach((n: any) => {
                                    if (!addedSet.has(n)) {
                                        addedSet.add(n);
                                        addedNodes.push(n);
                                        if (n instanceof Element) {
                                            try { n.setAttribute('data-site-topping-preview', ''); } catch {}
                                        }
                                    }
                                });
                                (m.removedNodes as any).forEach((n: any) => {
                                    if (!removedSet.has(n) && m.target) {
                                        removedSet.add(n);
                                        removedNodes.push({ node: n, parent: m.target, next: (m.nextSibling as any) || null });
                                        if ((m.target as any) instanceof Element) markEl(m.target as any);
                                    }
                                });
                            } else if (m.type === 'attributes') {
                                const el = m.target as any;
                                let map = attrOld.get(el);
                                if (!map) { map = new Map(); attrOld.set(el, map); }
                                if (!map.has(m.attributeName!)) {
                                    map.set(m.attributeName!, el.getAttribute(m.attributeName!));
                                    markEl(el);
                                }
                            } else if (m.type === 'characterData') {
                                const node = m.target as any;
                                if (!textOld.has(node)) {
                                    textOld.set(node, node.data);
                                    const p = node.parentElement; if (p) markEl(p);
                                }
                            }
                        }
                    });
                    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
                    console.log('[WebPage] ChangeTracker started', sessionId);
                }
                function stopAndRevert() {
                    try { observer && observer.disconnect(); } catch {}
                    // 이벤트 리스너/타이머 되돌리기
                    try {
                        addedListeners.forEach((rec: any) => {
                            try { (EventTarget.prototype as any).removeEventListener.call(rec.target, rec.type, rec.listener, rec.options); } catch {}
                        });
                        addedListeners.length = 0;
                        timeoutIds.forEach((id: any) => { try { window.clearTimeout(id as any); } catch {} });
                        intervalIds.forEach((id: any) => { try { window.clearInterval(id as any); } catch {} });
                        timeoutIds.length = 0; intervalIds.length = 0;
                    } catch {}
                    // 구조 변경 되돌리기
                    for (let i = addedNodes.length - 1; i >= 0; i--) {
                        const n = addedNodes[i];
                        try { if ((n as any).parentNode) (n as any).remove(); } catch {}
                    }
                    for (let i = removedNodes.length - 1; i >= 0; i--) {
                        const rec = removedNodes[i];
                        try {
                            if (rec.parent) {
                                if (rec.next && (rec.next as any).parentNode === rec.parent) {
                                    rec.parent.insertBefore(rec.node, rec.next);
                                } else {
                                    rec.parent.appendChild(rec.node);
                                }
                            }
                        } catch {}
                    }
                    attrOld.forEach((map: any, el: any) => {
                        map.forEach((oldVal: any, name: any) => {
                            try {
                                if (oldVal === null) el.removeAttribute(name); else el.setAttribute(name, oldVal);
                            } catch {}
                        });
                        try { el.removeAttribute('data-site-topping-marked'); } catch {}
                    });
                    textOld.forEach((oldVal: any, node: any) => {
                        try { node.data = oldVal; } catch {}
                    });
                    // clear state
                    addedNodes.length = 0; removedNodes.length = 0; attrOld.clear(); textOld.clear();
                    unpatchGlobals();
                    console.log('[WebPage] ChangeTracker reverted');
                }
                return { start, stopAndRevert };
            })();
            (g as any).__siteToppingChangeTracker = tracker;
        }
    });
}

async function applyJSToTab(tabId: number, js: string) {
  // 먼저 기존 효과를 정리
  await runJSCleanupInTab(tabId);

  // DOM 변경 추적기 준비 및 새 세션 시작
  await ensureChangeTrackerInTab(tabId);
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      try { (window as any).__siteToppingChangeTracker?.start?.(); } catch {}
    }
  });

  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (jsCode: string) => {
      try {
        const wrapper = `(() => {\n  try {\n    // 사용자가 원하는 경우 클린업을 등록하세요.\n    // window.__siteTopping_cleanup = () => { /* 되돌리기 */ };\n    // 또는 window.__siteToppingCleanups = [fn1, fn2];\n    ${jsCode}\n  } catch (e) {\n    console.error('[Site Topping] 사용자 코드 오류:', e);\n  }\n})();`;
        const script = document.createElement('script');
        script.setAttribute('data-site-topping', 'script');
        script.textContent = wrapper;
        document.documentElement.appendChild(script);
        // 실행 후 정리
        setTimeout(() => { try { script.remove(); } catch {} }, 0);
        console.log('[WebPage] Site Topping JS 실행 완료');
      } catch (error) {
        console.error('[WebPage] JavaScript 실행 오류:', error);
        throw error;
      }
    },
    args: [js]
  });

  console.log('[Background] JavaScript 라이브 적용 완료');
}

/**
 * 탭에서 프리뷰 제거
 */
async function removePreviewFromTab(tabId: number) {
    console.log(`[Background] 탭 ${tabId}에서 프리뷰 제거 시작`);

    // CSS: 스타일 태그 비우기 또는 제거
    await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: () => {
            const style = document.getElementById('site-topping-style');
            if (style) {
                style.remove();
                console.log('[WebPage] Site Topping 스타일 태그 제거');
            }
        }
    });

    // 레거시 스타일 제거 (이전에 insertCSS 사용한 경우 대비)
    try {
        // Chrome의 insertCSS로 삽입한 CSS를 제거하는 유일한 방법: removeCSS 사용
        const preview = appliedPreviews.get(tabId);
        if (preview && preview.cssCode.trim()) {
            console.log('[Background] 이전 CSS 제거 중:', preview.cssCode.substring(0, 50) + '...');
            await chrome.scripting.removeCSS({
                target: { tabId },
                css: addCSSScoping(preview.cssCode)
            });
            console.log('[Background] 이전 CSS 제거 완료');
        }
        
        // 추가 안전장치: 모든 Site Topping CSS 제거
        await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                // Site Topping으로 삽입된 모든 스타일 제거
                const styles = document.querySelectorAll('style');
                styles.forEach(style => {
                    if (style.textContent && style.textContent.includes(':not(#site-topping-root')) {
                        style.remove();
                        console.log('[WebPage] Site Topping 스타일 제거:', style);
                    }
                });
            }
        });
        
    } catch (cssError) {
        console.warn('[Background] CSS 제거 실패, 대안 방법 시도:', cssError);
        
        // 대안: 스타일 시트를 직접 제거
        await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                // Chrome extension으로 삽입된 스타일시트 찾기 및 제거
                Array.from(document.styleSheets).forEach(sheet => {
                    try {
                        // Chrome extension에서 삽입한 스타일시트는 href가 없거나 특정 패턴을 가짐
                        if (!sheet.href || sheet.href.startsWith('chrome-extension://')) {
                            const rules = Array.from(sheet.cssRules || []);
                            const hasSiteToppingRules = rules.some(rule => 
                                rule.cssText.includes(':not(#site-topping-root')
                            );
                            
                            if (hasSiteToppingRules && sheet.ownerNode) {
                                (sheet.ownerNode as HTMLElement).remove();
                                console.log('[WebPage] Site Topping 스타일시트 제거됨');
                            }
                        }
                    } catch (e) {
                        // 브라우저 보안으로 인해 접근 불가한 스타일시트는 무시
                    }
                });
            }
        });
    }
    
    // JavaScript 효과 정리 및 프리뷰 요소 제거
    await runJSCleanupInTab(tabId);
    
    console.log('[Background] 프리뷰 제거 완료');
}

/**
 * CSS 스코핑 적용 - 익스텐션 UI 보호
 */
function addCSSScoping(css: string): string {
    try {
        const rules = css.split('}').filter(rule => rule.trim());
        
        const scopedRules = rules.map(rule => {
            const trimmed = rule.trim();
            if (!trimmed) return '';
            
            const braceIndex = trimmed.indexOf('{');
            if (braceIndex === -1) return trimmed + '}';
            
            const selectors = trimmed.substring(0, braceIndex).trim();
            const properties = trimmed.substring(braceIndex + 1).trim();
            
            // @규칙이나 주석은 스코핑 제외
            if (selectors.startsWith('@') || selectors.includes('/*')) {
                return `${selectors} { ${properties} }`;
            }
            
            // 익스텐션 제외 스코핑 적용
            const scopedSelectors = selectors
                .split(',')
                .map(sel => {
                    const trimmed = sel.trim();
                    if (trimmed === '*' || trimmed === 'html' || trimmed === 'body') {
                        return `${trimmed}:not(#site-topping-root):not(#site-topping-root *)`;
                    }
                    return `${trimmed}:not(#site-topping-root *)`;
                })
                .join(', ');
            
            return `${scopedSelectors} { ${properties} }`;
        });
        
        return scopedRules.join('\n');
        
    } catch (error) {
        console.warn('[Background] CSS 스코핑 실패, 원본 사용:', error);
        return css;
    }
}