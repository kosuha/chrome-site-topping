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
  
  // 스냅샷 기반 재적용 (동적 기능 보존)
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: (cssCode: string, jsCode: string) => {
        try {
          const snapshot = (window as any).__siteTopping_originalSnapshot;
          
          if (!snapshot) {
            console.warn('[WebPage] 스냅샷이 없어 재적용 불가');
            return { success: false };
          }
          
          console.log('[WebPage] 라이브 프리뷰 재적용 시작 (스냅샷 기반)');
          
          // 1. 동적 상태 백업
          let preservedState = null;
          if ((window as any).__siteTopping_preserveEvents) {
            preservedState = (window as any).__siteTopping_preserveEvents();
          }
          
          // 2. 사용자 클린업 실행
          if (Array.isArray((window as any).__siteTopping_cleanup)) {
            (window as any).__siteTopping_cleanup.forEach((fn: any) => {
              try { if (typeof fn === 'function') fn(); } catch (e) {}
            });
            (window as any).__siteTopping_cleanup = [];
          }
          
          // 3. 스크롤 위치 백업
          const currentScrollX = window.scrollX;
          const currentScrollY = window.scrollY;
          
          // 4. DOM 복원 (innerHTML 전체 교체)
          const parser = new DOMParser();
          const originalDoc = parser.parseFromString(snapshot.documentHTML, 'text/html');
          
          // head 영역 복원 (Site Topping 요소 제외)
          if (originalDoc.head && snapshot.headHTML) {
            // 기존 head의 Site Topping 요소들만 백업 (나머지는 건드리지 않음)
            const siteToppingElements = Array.from(document.head.children).filter(el => 
              el.hasAttribute('data-site-topping') || 
              el.id === 'site-topping-style' ||
              (el.textContent && el.textContent.includes('site-topping'))
            );
            
            // head 복원은 하지 않고 Site Topping 요소만 정리
            siteToppingElements.forEach(el => {
              try { el.remove(); } catch (e) {}
            });
          }
          
          // body 복원
          if (originalDoc.body && snapshot.bodyHTML) {
            document.body.innerHTML = originalDoc.body.innerHTML;
            
            // body 속성들도 복원
            Array.from(document.body.attributes).forEach(attr => {
              if (!attr.name.startsWith('data-site-topping')) {
                document.body.removeAttribute(attr.name);
              }
            });
            Array.from(originalDoc.body.attributes).forEach(attr => {
              document.body.setAttribute(attr.name, attr.value);
            });
          }
          
          // 5. 스크롤 위치 복원
          window.scrollTo(currentScrollX, currentScrollY);
          
          // 6. CSS 재적용
          if (cssCode && cssCode.trim()) {
            let styleElement = document.getElementById('site-topping-style') as HTMLStyleElement;
            if (!styleElement) {
              styleElement = document.createElement('style');
              styleElement.id = 'site-topping-style';
              styleElement.setAttribute('data-site-topping', 'style');
              document.head.appendChild(styleElement);
            }
            
            // CSS 스코핑 적용
            const scopedCSS = cssCode.split('}').filter(rule => rule.trim()).map(rule => {
              const trimmed = rule.trim();
              if (!trimmed) return '';
              
              const braceIndex = trimmed.indexOf('{');
              if (braceIndex === -1) return trimmed + '}';
              
              const selectors = trimmed.substring(0, braceIndex).trim();
              const properties = trimmed.substring(braceIndex + 1).trim();
              
              if (selectors.startsWith('@') || selectors.includes('/*')) {
                return `${selectors} { ${properties} }`;
              }
              
              const scopedSelectors = selectors.split(',').map(sel => {
                const trimmed = sel.trim();
                if (trimmed === '*' || trimmed === 'html' || trimmed === 'body') {
                  return `${trimmed}:not(#site-topping-root):not(#site-topping-root *)`;
                }
                return `${trimmed}:not(#site-topping-root *)`;
              }).join(', ');
              
              return `${scopedSelectors} { ${properties} }`;
            }).join('\n');
            
            styleElement.textContent = scopedCSS;
          }
          
          // 7. JavaScript 재적용
          if (jsCode && jsCode.trim()) {
            const wrapper = `(() => {
              try {
                // 사용자 코드 실행 전에 유틸리티 함수 제공
                window.__siteTopping_cleanup = window.__siteTopping_cleanup || [];
                
                // 클린업 등록 헬퍼
                window.__siteTopping_registerCleanup = function(fn) {
                  if (typeof fn === 'function') {
                    window.__siteTopping_cleanup.push(fn);
                  }
                };
                
                console.log('[WebPage] 라이브 JS 재적용');
                ${jsCode}
              } catch (e) {
                console.error('[Site Topping] 라이브 재적용 JS 오류:', e);
              }
            })();`;
            
            const script = document.createElement('script');
            script.setAttribute('data-site-topping', 'script');
            script.textContent = wrapper;
            document.documentElement.appendChild(script);
            
            setTimeout(() => { try { script.remove(); } catch (e) {} }, 0);
          }
          
          // 8. 동적 상태 복원
          if (preservedState && (window as any).__siteTopping_restoreEvents) {
            (window as any).__siteTopping_restoreEvents(preservedState);
          }
          
          console.log('[WebPage] 라이브 프리뷰 재적용 완료');
          return { success: true };
          
        } catch (error) {
          console.error('[WebPage] 라이브 재적용 실패:', error);
          
          // 실패 시 페이지 새로고침으로 복구
          console.log('[WebPage] 라이브 재적용 실패, 페이지 새로고침으로 복구');
          window.location.reload();
          return { success: false };
        }
      },
      args: [preview.cssCode || '', preview.jsCode || '']
    });
  } catch (error) {
    console.error('[Background] 라이브 재적용 실패:', error);
  }
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
    
    // 스냅샷 생성 및 코드 적용 요청
    if (message.type === 'CREATE_SNAPSHOT_AND_APPLY') {
        handleCreateSnapshotAndApply(message, sender, sendResponse);
        return true;
    }
    
    // 스냅샷에서 복원 요청
    if (message.type === 'RESTORE_FROM_SNAPSHOT') {
        handleRestoreFromSnapshot(message, sender, sendResponse);
        return true;
    }
    
    // 실시간 코드 업데이트 요청
    if (message.type === 'UPDATE_PREVIEW_CODE') {
        handleUpdatePreviewCode(message, sender, sendResponse);
        return true;
    }
    
    // 코드 프리뷰 적용 요청 (레거시 호환용)
    if (message.type === 'APPLY_CODE_PREVIEW') {
        handleApplyCodePreview(message, sender, sendResponse);
        return true;
    }
    
    // 코드 프리뷰 제거 요청 (레거시 호환용)
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

// ====== 스냅샷 기반 프리뷰 함수들 ======

/**
 * 스냅샷 생성 및 코드 적용 핸들러 - 스냅샷 기반 + 동적 기능 보존
 */
async function handleCreateSnapshotAndApply(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
    try {
        const { css, js, tabId } = message;
        
        // 현재 활성 탭 ID 가져오기
        let targetTabId = tabId || sender.tab?.id;
        
        if (!targetTabId) {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!activeTab?.id) {
                throw new Error('활성 탭을 찾을 수 없습니다');
            }
            targetTabId = activeTab.id;
        }
        
        console.log(`[Background] 스냅샷 + 동적 기능 보존 프리뷰 시작 - 탭 ${targetTabId}`);
        
        // 적용된 코드 추적에 저장
        appliedPreviews.set(targetTabId, {
            tabId: targetTabId,
            cssCode: css || '',
            jsCode: js || ''
        });
        
        // 스냅샷 생성 및 코드 적용
        const [result] = await chrome.scripting.executeScript({
            target: { tabId: targetTabId },
            world: 'MAIN',
            func: (cssCode: string, jsCode: string) => {
                try {
                    // DOM 스냅샷 생성 (한 번만, 없을 때만)
                    if (!(window as any).__siteTopping_originalSnapshot) {
                        console.log('[WebPage] 원본 DOM 스냅샷 생성');
                        
                        // 완전한 DOM 스냅샷 저장
                        (window as any).__siteTopping_originalSnapshot = {
                            documentHTML: document.documentElement.outerHTML,
                            bodyHTML: document.body.outerHTML,
                            headHTML: document.head.outerHTML,
                            scrollPosition: { x: window.scrollX, y: window.scrollY },
                            url: window.location.href,
                            timestamp: Date.now()
                        };
                        
                        // 동적 상태 보존을 위한 이벤트 백업 시스템
                        (window as any).__siteTopping_preserveEvents = function() {
                            console.log('[WebPage] 동적 상태 보존 시작');
                            
                            // 1. 전역 이벤트 리스너 백업
                            const eventBackup = {
                                windowEvents: [],
                                documentEvents: [],
                                bodyEvents: []
                            };
                            
                            // 2. jQuery 상태 백업 (있는 경우)
                            let jqueryBackup = null;
                            if ((window as any).jQuery) {
                                jqueryBackup = {
                                    version: (window as any).jQuery.fn.jquery,
                                    ready: (window as any).jQuery.isReady
                                };
                            }
                            
                            // 3. 주요 프레임워크 상태 백업
                            const frameworkBackup = {};
                            ['React', 'Vue', 'Angular', 'Svelte'].forEach(framework => {
                                if ((window as any)[framework]) {
                                    (frameworkBackup as any)[framework] = {
                                        version: (window as any)[framework].version || 'unknown',
                                        exists: true
                                    };
                                }
                            });
                            
                            // 4. CSS 애니메이션/트랜지션 상태 백업
                            const animationElements: any[] = [];
                            document.querySelectorAll('*').forEach(element => {
                                const computedStyle = window.getComputedStyle(element);
                                if (computedStyle.animationName !== 'none' || 
                                    computedStyle.transitionProperty !== 'none' ||
                                    element.classList.contains('animated') ||
                                    element.hasAttribute('data-aos') ||
                                    element.classList.toString().includes('animate-')) {
                                    
                                    animationElements.push({
                                        element: element,
                                        selector: element.tagName + (element.id ? '#' + element.id : '') + 
                                                 (element.className ? '.' + element.className.split(' ').join('.') : ''),
                                        animations: {
                                            animationName: computedStyle.animationName,
                                            animationDuration: computedStyle.animationDuration,
                                            animationTimingFunction: computedStyle.animationTimingFunction,
                                            animationDelay: computedStyle.animationDelay,
                                            animationIterationCount: computedStyle.animationIterationCount,
                                            animationDirection: computedStyle.animationDirection,
                                            animationFillMode: computedStyle.animationFillMode,
                                            animationPlayState: computedStyle.animationPlayState,
                                            transitionProperty: computedStyle.transitionProperty,
                                            transitionDuration: computedStyle.transitionDuration,
                                            transitionTimingFunction: computedStyle.transitionTimingFunction,
                                            transitionDelay: computedStyle.transitionDelay
                                        }
                                    });
                                }
                            });
                            
                            return {
                                events: eventBackup,
                                jquery: jqueryBackup,
                                frameworks: frameworkBackup,
                                animations: animationElements,
                                timestamp: Date.now()
                            };
                        };
                        
                        // 동적 상태 복원 함수
                        (window as any).__siteTopping_restoreEvents = function(preservedState: any) {
                            if (!preservedState) return;
                            
                            console.log('[WebPage] 동적 상태 복원 시작');
                            
                            // 즉시 실행할 복원 작업들
                            try {
                                // 1. jQuery 이벤트 재트리거 (즉시)
                                if (preservedState.jquery && (window as any).jQuery) {
                                    console.log('[WebPage] jQuery 이벤트 즉시 재트리거');
                                    (window as any).jQuery(document).trigger('DOMContentLoaded');
                                    if ((window as any).jQuery.isReady) {
                                        (window as any).jQuery(document).ready();
                                    }
                                }
                                
                                // 2. 프레임워크별 즉시 초기화
                                Object.keys(preservedState.frameworks).forEach(framework => {
                                    const fw = (window as any)[framework];
                                    if (fw) {
                                        if (framework === 'Vue' && fw.nextTick) {
                                            fw.nextTick(() => {
                                                console.log('[WebPage] Vue 즉시 재마운트');
                                            });
                                        }
                                    }
                                });
                                
                                // 3. 애니메이션 라이브러리 즉시 재초기화
                                if ((window as any).AOS) {
                                    try {
                                        (window as any).AOS.refreshHard();
                                        console.log('[WebPage] AOS 즉시 재초기화');
                                    } catch (e) {
                                        console.warn('[WebPage] AOS 즉시 재초기화 실패:', e);
                                    }
                                }
                                
                                if ((window as any).gsap) {
                                    try {
                                        (window as any).gsap.globalTimeline.clear();
                                        (window as any).gsap.set('*', { clearProps: 'all' });
                                        console.log('[WebPage] GSAP 즉시 재초기화');
                                    } catch (e) {
                                        console.warn('[WebPage] GSAP 즉시 재초기화 실패:', e);
                                    }
                                }
                            } catch (error) {
                                console.error('[WebPage] 즉시 복원 중 오류:', error);
                            }
                            
                            // 100ms 후에 추가 이벤트 복원 (DOM 안정화 대기)
                            setTimeout(() => {
                                try {
                                    // 4. 일반 DOM 이벤트 재트리거
                                    const events = ['DOMContentLoaded', 'load', 'resize', 'scroll'];
                                    events.forEach(eventType => {
                                        try {
                                            const event = new Event(eventType, { bubbles: true, cancelable: false });
                                            if (eventType === 'DOMContentLoaded' || eventType === 'load') {
                                                document.dispatchEvent(event);
                                            } else {
                                                window.dispatchEvent(event);
                                            }
                                        } catch (e) {
                                            console.warn('[WebPage] 이벤트 재트리거 실패:', eventType, e);
                                        }
                                    });
                                    
                                    // 5. 일반적인 초기화 함수들 재실행
                                    const initFunctions = [
                                        'init', 'initialize', 'setup', 'start', 'bootstrap', 'run',
                                        'onReady', 'onLoad', 'ready', 'loaded', 'app', 'main'
                                    ];
                                    
                                    initFunctions.forEach(funcName => {
                                        if (typeof (window as any)[funcName] === 'function') {
                                            try {
                                                (window as any)[funcName]();
                                                console.log('[WebPage] 초기화 함수 재실행:', funcName);
                                            } catch (e) {
                                                console.warn('[WebPage] 초기화 함수 실행 실패:', funcName, e);
                                            }
                                        }
                                    });
                                    
                                    console.log('[WebPage] 지연 동적 상태 복원 완료');
                                    
                                } catch (error) {
                                    console.error('[WebPage] 지연 복원 중 오류:', error);
                                }
                            }, 100);
                            
                            // 500ms 후에 최종 복원 작업 (프레임워크 안정화 대기)
                            setTimeout(() => {
                                try {
                                    // 6. jQuery 최종 복원
                                    if (preservedState.jquery && (window as any).jQuery) {
                                        (window as any).jQuery(window).trigger('load');
                                        (window as any).jQuery(window).trigger('resize');
                                    }
                                    
                                    // 7. 애니메이션 라이브러리 최종 재스캔
                                    if ((window as any).AOS) {
                                        try {
                                            (window as any).AOS.refresh();
                                        } catch (e) {}
                                    }
                                    
                                    // 8. 스크롤 기반 애니메이션 트리거
                                    window.dispatchEvent(new Event('scroll'));
                                    
                                    console.log('[WebPage] 최종 동적 상태 복원 완료');
                                    
                                } catch (error) {
                                    console.error('[WebPage] 최종 복원 중 오류:', error);
                                }
                            }, 500);
                        };
                        
                        console.log('[WebPage] 스냅샷 및 보존 시스템 초기화 완료');
                    }
                    
                    // CSS 적용
                    if (cssCode && cssCode.trim()) {
                        let styleElement = document.getElementById('site-topping-style') as HTMLStyleElement;
                        if (!styleElement) {
                            styleElement = document.createElement('style');
                            styleElement.id = 'site-topping-style';
                            styleElement.setAttribute('data-site-topping', 'style');
                            document.head.appendChild(styleElement);
                        }
                        
                        // CSS 스코핑 적용
                        const scopedCSS = cssCode.split('}').filter(rule => rule.trim()).map(rule => {
                            const trimmed = rule.trim();
                            if (!trimmed) return '';
                            
                            const braceIndex = trimmed.indexOf('{');
                            if (braceIndex === -1) return trimmed + '}';
                            
                            const selectors = trimmed.substring(0, braceIndex).trim();
                            const properties = trimmed.substring(braceIndex + 1).trim();
                            
                            if (selectors.startsWith('@') || selectors.includes('/*')) {
                                return `${selectors} { ${properties} }`;
                            }
                            
                            const scopedSelectors = selectors.split(',').map(sel => {
                                const trimmed = sel.trim();
                                if (trimmed === '*' || trimmed === 'html' || trimmed === 'body') {
                                    return `${trimmed}:not(#site-topping-root):not(#site-topping-root *)`;
                                }
                                return `${trimmed}:not(#site-topping-root *)`;
                            }).join(', ');
                            
                            return `${scopedSelectors} { ${properties} }`;
                        }).join('\n');
                        
                        styleElement.textContent = scopedCSS;
                    }
                    
                    // JavaScript 적용
                    if (jsCode && jsCode.trim()) {
                        // 기존 Site Topping 스크립트 정리
                        document.querySelectorAll('[data-site-topping="script"]').forEach(el => {
                            try { el.remove(); } catch (e) {}
                        });
                        
                        // 새 스크립트 실행
                        const wrapper = `(() => {
                            try {
                                // 사용자 코드 실행 전에 유틸리티 함수 제공
                                window.__siteTopping_cleanup = window.__siteTopping_cleanup || [];
                                
                                // 클린업 등록 헬퍼
                                window.__siteTopping_registerCleanup = function(fn) {
                                    if (typeof fn === 'function') {
                                        window.__siteTopping_cleanup.push(fn);
                                    }
                                };
                                
                                ${jsCode}
                            } catch (e) {
                                console.error('[Site Topping] 사용자 코드 실행 오류:', e);
                            }
                        })();`;
                        
                        const script = document.createElement('script');
                        script.setAttribute('data-site-topping', 'script');
                        script.textContent = wrapper;
                        document.documentElement.appendChild(script);
                        
                        setTimeout(() => { try { script.remove(); } catch (e) {} }, 0);
                    }
                    
                    console.log('[WebPage] 스냅샷 기반 프리뷰 적용 완료');
                    return { success: true };
                    
                } catch (error) {
                    console.error('[WebPage] 스냅샷 프리뷰 실행 실패:', error);
                    return { success: false, error: error instanceof Error ? error.message : String(error) };
                }
            },
            args: [css || '', js || '']
        });
        
        if (!result?.result?.success) {
            throw new Error(result?.result?.error || '스냅샷 프리뷰 적용 실패');
        }
        
        console.log('[Background] 스냅샷 기반 프리뷰 적용 완료');
        sendResponse({ success: true });
        
    } catch (error) {
        console.error('[Background] 스냅샷 프리뷰 적용 실패:', error);
        sendResponse({ success: false, error: error instanceof Error ? error.message : '알 수 없는 오류' });
    }
}

/**
 * 스냅샷에서 복원 핸들러 - innerHTML 전체 교체 + 동적 기능 보존
 */
async function handleRestoreFromSnapshot(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
    try {
        const { tabId } = message;
        
        // 현재 활성 탭 ID 가져오기
        let targetTabId = tabId || sender.tab?.id;
        
        if (!targetTabId) {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!activeTab?.id) {
                throw new Error('활성 탭을 찾을 수 없습니다');
            }
            targetTabId = activeTab.id;
        }
        
        console.log(`[Background] 스냅샷 기반 완전 복원 - 탭 ${targetTabId}`);
        
        // 적용된 코드 추적에서 제거
        appliedPreviews.delete(targetTabId);
        
        // 스냅샷 기반 완전 복원
        const [result] = await chrome.scripting.executeScript({
            target: { tabId: targetTabId },
            world: 'MAIN',
            func: () => {
                try {
                    const snapshot = (window as any).__siteTopping_originalSnapshot;
                    
                    if (!snapshot) {
                        console.warn('[WebPage] 복원할 스냅샷이 없습니다. 기본 정리만 수행합니다.');
                        
                        // 기본 Site Topping 요소들만 제거
                        const selectors = [
                            '#site-topping-style',
                            '[data-site-topping]',
                            '[data-site-topping-added]',
                            '.site-topping-element'
                        ];
                        
                        selectors.forEach(selector => {
                            document.querySelectorAll(selector).forEach(el => {
                                try { el.remove(); } catch (e) {}
                            });
                        });
                        
                        // 사용자 클린업 함수들 실행
                        if (Array.isArray((window as any).__siteTopping_cleanup)) {
                            (window as any).__siteTopping_cleanup.forEach((fn: any) => {
                                try { if (typeof fn === 'function') fn(); } catch (e) {}
                            });
                            (window as any).__siteTopping_cleanup = [];
                        }
                        
                        return { success: true, restored: false };
                    }
                    
                    console.log('[WebPage] 스냅샷 기반 완전 복원 시작');
                    
                    // 1. 동적 상태 백업 (복원 전에)
                    let preservedState = null;
                    if ((window as any).__siteTopping_preserveEvents) {
                        preservedState = (window as any).__siteTopping_preserveEvents();
                        console.log('[WebPage] 동적 상태 백업 완료');
                    }
                    
                    // 2. 사용자 클린업 함수들 실행
                    if (Array.isArray((window as any).__siteTopping_cleanup)) {
                        console.log('[WebPage] 사용자 클린업 함수들 실행');
                        (window as any).__siteTopping_cleanup.forEach((fn: any) => {
                            try { if (typeof fn === 'function') fn(); } catch (e) {}
                        });
                        (window as any).__siteTopping_cleanup = [];
                    }
                    
                    // 3. 스크롤 위치 백업 (복원 후 재설정용)
                    const currentScrollX = window.scrollX;
                    const currentScrollY = window.scrollY;
                    
                    // 4. DOM 완전 복원 (innerHTML 전체 교체)
                    console.log('[WebPage] 스냅샷 기반 완전 복원 시작 - innerHTML 전체 교체');
                    
                    // 전체 문서 복원
                    const parser = new DOMParser();
                    const originalDoc = parser.parseFromString(snapshot.documentHTML, 'text/html');
                    
                    // head 영역 복원 (Site Topping 요소 제외)
                    if (originalDoc.head && snapshot.headHTML) {
                        console.log('[WebPage] head 영역 복원 시작');
                        
                        // 기존 head의 Site Topping 요소들만 백업 (나머지는 건드리지 않음)
                        const siteToppingElements = Array.from(document.head.children).filter(el => 
                            el.hasAttribute('data-site-topping') || 
                            el.id === 'site-topping-style' ||
                            (el.textContent && el.textContent.includes('site-topping'))
                        );
                        
                        // head 복원은 하지 않고 Site Topping 요소만 정리
                        siteToppingElements.forEach(el => {
                            try { el.remove(); } catch (e) {}
                        });
                        
                        console.log('[WebPage] head 영역 Site Topping 요소만 정리 완료 (스크립트 보존)');
                    }
                    
                    // body 완전 복원
                    if (originalDoc.body && snapshot.bodyHTML) {
                        console.log('[WebPage] body 영역 복원 시작');
                        
                        // body innerHTML 완전 교체
                        document.body.innerHTML = originalDoc.body.innerHTML;
                        
                        // body 속성들도 복원
                        Array.from(document.body.attributes).forEach(attr => {
                            if (!attr.name.startsWith('data-site-topping')) {
                                document.body.removeAttribute(attr.name);
                            }
                        });
                        Array.from(originalDoc.body.attributes).forEach(attr => {
                            document.body.setAttribute(attr.name, attr.value);
                        });
                        
                        console.log('[WebPage] body innerHTML 완전 복원 완료');
                    }
                    
                    // 5. 스크롤 위치 복원 (원본 또는 현재 위치)
                    const targetScrollX = snapshot.scrollPosition?.x ?? currentScrollX;
                    const targetScrollY = snapshot.scrollPosition?.y ?? currentScrollY;
                    window.scrollTo(targetScrollX, targetScrollY);
                    console.log('[WebPage] 스크롤 위치 복원:', { x: targetScrollX, y: targetScrollY });
                    
                    // 6. 동적 상태 복원 (setTimeout으로 DOM 안정화 대기)
                    if (preservedState && (window as any).__siteTopping_restoreEvents) {
                        (window as any).__siteTopping_restoreEvents(preservedState);
                    }
                    
                    // 7. 스냅샷 관련 전역 변수 정리
                    delete (window as any).__siteTopping_originalSnapshot;
                    delete (window as any).__siteTopping_preserveEvents;
                    delete (window as any).__siteTopping_restoreEvents;
                    delete (window as any).__siteTopping_cleanup;
                    
                    console.log('[WebPage] 스냅샷 기반 완전 복원 완료');
                    return { success: true, restored: true };
                    
                } catch (error) {
                    console.error('[WebPage] 스냅샷 복원 실패:', error);
                    
                    // 복원 실패 시 페이지 새로고침으로 대체
                    console.log('[WebPage] 복원 실패, 페이지 새로고침으로 대체');
                    window.location.reload();
                    return { success: false, error: error instanceof Error ? error.message : String(error) };
                }
            }
        });
        
        if (!result?.result?.success && result?.result?.restored !== false) {
            throw new Error(result?.result?.error || '스냅샷 복원 실패');
        }
        
        console.log('[Background] 스냅샷 기반 완전 복원 완료');
        sendResponse({ success: true });
        
    } catch (error) {
        console.error('[Background] 스냅샷 복원 실패:', error);
        sendResponse({ success: false, error: error instanceof Error ? error.message : '알 수 없는 오류' });
    }
}

/**
 * 실시간 코드 업데이트 핸들러 - 스냅샷 기반 완전 복원 + 새 코드 적용
 */
async function handleUpdatePreviewCode(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
    try {
        const { css, js, tabId } = message;
        
        // 현재 활성 탭 ID 가져오기
        let targetTabId = tabId || sender.tab?.id;
        
        if (!targetTabId) {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!activeTab?.id) {
                throw new Error('활성 탭을 찾을 수 없습니다');
            }
            targetTabId = activeTab.id;
        }
        
        console.log(`[Background] 스냅샷 기반 실시간 업데이트 - 탭 ${targetTabId}`);
        
        // 적용된 코드 추적 업데이트
        appliedPreviews.set(targetTabId, {
            tabId: targetTabId,
            cssCode: css || '',
            jsCode: js || ''
        });
        
        // 스냅샷 기반 실시간 업데이트: 완전 복원 후 새 코드 적용
        const [result] = await chrome.scripting.executeScript({
            target: { tabId: targetTabId },
            world: 'MAIN',
            func: (cssCode: string, jsCode: string) => {
                try {
                    const snapshot = (window as any).__siteTopping_originalSnapshot;
                    
                    if (!snapshot) {
                        console.error('[WebPage] 스냅샷이 없습니다. 프리뷰를 다시 시작해주세요.');
                        return { success: false, error: '스냅샷이 없습니다' };
                    }
                    
                    console.log('[WebPage] 스냅샷 기반 실시간 업데이트 시작 (완전 복원 + 새 적용)');
                    
                    // Step 1: 동적 상태 백업 (복원 전에)
                    let preservedState = null;
                    if ((window as any).__siteTopping_preserveEvents) {
                        preservedState = (window as any).__siteTopping_preserveEvents();
                        console.log('[WebPage] 1단계: 동적 상태 백업 완료');
                    }
                    
                    // Step 2: 사용자 클린업 함수들 실행
                    if (Array.isArray((window as any).__siteTopping_cleanup)) {
                        console.log('[WebPage] 2단계: 사용자 클린업 함수들 실행');
                        (window as any).__siteTopping_cleanup.forEach((fn: any) => {
                            try { if (typeof fn === 'function') fn(); } catch (e) {}
                        });
                        (window as any).__siteTopping_cleanup = [];
                    }
                    
                    // Step 3: 스크롤 위치 백업
                    const currentScrollX = window.scrollX;
                    const currentScrollY = window.scrollY;
                    
                    // Step 4: DOM 완전 복원 (innerHTML 전체 교체)
                    console.log('[WebPage] 3단계: DOM 완전 복원 (innerHTML 전체 교체)');
                    
                    const parser = new DOMParser();
                    const originalDoc = parser.parseFromString(snapshot.documentHTML, 'text/html');
                    
                    // head 영역 복원 (Site Topping 요소 제외)
                    if (originalDoc.head && snapshot.headHTML) {
                        console.log('[WebPage] head 영역 실시간 복원');
                        
                        // 기존 head의 Site Topping 요소들만 백업 (나머지는 건드리지 않음)
                        const siteToppingElements = Array.from(document.head.children).filter(el => 
                            el.hasAttribute('data-site-topping') || 
                            el.id === 'site-topping-style' ||
                            (el.textContent && el.textContent.includes('site-topping'))
                        );
                        
                        // head 복원은 하지 않고 Site Topping 요소만 정리
                        siteToppingElements.forEach(el => {
                            try { el.remove(); } catch (e) {}
                        });
                        
                        console.log('[WebPage] head 영역 Site Topping 요소만 정리 완료 (스크립트 보존)');
                    }
                    
                    // body 완전 복원
                    if (originalDoc.body && snapshot.bodyHTML) {
                        // body innerHTML 완전 교체
                        document.body.innerHTML = originalDoc.body.innerHTML;
                        
                        // body 속성들도 복원
                        Array.from(document.body.attributes).forEach(attr => {
                            if (!attr.name.startsWith('data-site-topping')) {
                                document.body.removeAttribute(attr.name);
                            }
                        });
                        Array.from(originalDoc.body.attributes).forEach(attr => {
                            document.body.setAttribute(attr.name, attr.value);
                        });
                        
                        console.log('[WebPage] body innerHTML 완전 복원 완료');
                    }
                    
                    // Step 5: 스크롤 위치 복원
                    window.scrollTo(currentScrollX, currentScrollY);
                    
                    // Step 6: 새로운 CSS 적용
                    console.log('[WebPage] 4단계: 새 CSS 적용');
                    
                    if (cssCode && cssCode.trim()) {
                        let styleElement = document.getElementById('site-topping-style') as HTMLStyleElement;
                        if (!styleElement) {
                            styleElement = document.createElement('style');
                            styleElement.id = 'site-topping-style';
                            styleElement.setAttribute('data-site-topping', 'style');
                            document.head.appendChild(styleElement);
                        }
                        
                        // CSS 스코핑 적용
                        const scopedCSS = cssCode.split('}').filter(rule => rule.trim()).map(rule => {
                            const trimmed = rule.trim();
                            if (!trimmed) return '';
                            
                            const braceIndex = trimmed.indexOf('{');
                            if (braceIndex === -1) return trimmed + '}';
                            
                            const selectors = trimmed.substring(0, braceIndex).trim();
                            const properties = trimmed.substring(braceIndex + 1).trim();
                            
                            if (selectors.startsWith('@') || selectors.includes('/*')) {
                                return `${selectors} { ${properties} }`;
                            }
                            
                            const scopedSelectors = selectors.split(',').map(sel => {
                                const trimmed = sel.trim();
                                if (trimmed === '*' || trimmed === 'html' || trimmed === 'body') {
                                    return `${trimmed}:not(#site-topping-root):not(#site-topping-root *)`;
                                }
                                return `${trimmed}:not(#site-topping-root *)`;
                            }).join(', ');
                            
                            return `${scopedSelectors} { ${properties} }`;
                        }).join('\n');
                        
                        styleElement.textContent = scopedCSS;
                    } else {
                        // CSS가 비어있으면 스타일 제거
                        const styleElement = document.getElementById('site-topping-style');
                        if (styleElement) {
                            styleElement.remove();
                        }
                    }
                    
                    // Step 7: 새로운 JavaScript 적용
                    console.log('[WebPage] 5단계: 새 JavaScript 적용');
                    
                    if (jsCode && jsCode.trim()) {
                        // 기존 Site Topping 스크립트 정리
                        document.querySelectorAll('[data-site-topping="script"]').forEach(el => {
                            try { el.remove(); } catch (e) {}
                        });
                        
                        const wrapper = `(() => {
                            try {
                                // 사용자 코드 실행 전에 유틸리티 함수 제공
                                window.__siteTopping_cleanup = window.__siteTopping_cleanup || [];
                                
                                // 클린업 등록 헬퍼
                                window.__siteTopping_registerCleanup = function(fn) {
                                    if (typeof fn === 'function') {
                                        window.__siteTopping_cleanup.push(fn);
                                    }
                                };
                                
                                ${jsCode}
                            } catch (e) {
                                console.error('[Site Topping] 사용자 코드 실행 오류:', e);
                            }
                        })();`;
                        
                        const script = document.createElement('script');
                        script.setAttribute('data-site-topping', 'script');
                        script.textContent = wrapper;
                        document.documentElement.appendChild(script);
                        
                        setTimeout(() => { try { script.remove(); } catch (e) {} }, 0);
                    } else {
                        // JavaScript가 비어있으면 스크립트 정리만
                        document.querySelectorAll('[data-site-topping="script"]').forEach(el => {
                            try { el.remove(); } catch (e) {}
                        });
                    }
                    
                    // Step 8: 동적 상태 복원 (DOM 안정화 후)
                    if (preservedState && (window as any).__siteTopping_restoreEvents) {
                        (window as any).__siteTopping_restoreEvents(preservedState);
                    }
                    
                    console.log('[WebPage] 스냅샷 기반 실시간 업데이트 완료 (복원 + 적용)');
                    return { success: true };
                    
                } catch (error) {
                    console.error('[WebPage] 실시간 업데이트 실패:', error);
                    return { success: false, error: error instanceof Error ? error.message : String(error) };
                }
            },
            args: [css || '', js || '']
        });
        
        if (!result?.result?.success) {
            throw new Error(result?.result?.error || '스냅샷 기반 실시간 업데이트 실패');
        }
        
        console.log('[Background] 스냅샷 기반 실시간 업데이트 완료');
        sendResponse({ success: true });
        
    } catch (error) {
        console.error('[Background] 스냅샷 기반 실시간 업데이트 실패:', error);
        sendResponse({ success: false, error: error instanceof Error ? error.message : '알 수 없는 오류' });
    }
}

// ====== 기존 코드 프리뷰 함수들 (레거시 호환용) ======

/**
 * 코드 프리뷰 적용 핸들러 - 변경 추적 기반으로 업그레이드
 */
async function handleApplyCodePreview(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
    try {
        console.log('[Background] 레거시 호환: 변경 추적 기반 프리뷰로 리다이렉트');
        
        // 새로운 변경 추적 기반 시스템으로 리다이렉트
        await handleCreateSnapshotAndApply(message, sender, sendResponse);
        
    } catch (error) {
        console.error('[Background] 레거시 프리뷰 적용 실패:', error);
        sendResponse({ success: false, error: error instanceof Error ? error.message : '알 수 없는 오류' });
    }
}

/**
 * 코드 프리뷰 제거 핸들러 - 변경 추적 기반으로 업그레이드
 */
async function handleRemoveCodePreview(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
    try {
        console.log('[Background] 레거시 호환: 변경 추적 기반 복원으로 리다이렉트');
        
        // 새로운 변경 추적 기반 시스템으로 리다이렉트
        await handleRestoreFromSnapshot(message, sender, sendResponse);
        
    } catch (error) {
        console.error('[Background] 레거시 프리뷰 제거 실패:', error);
        sendResponse({ success: false, error: error instanceof Error ? error.message : '알 수 없는 오류' });
    }
}

