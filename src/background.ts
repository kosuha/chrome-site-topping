import { supabase } from './services/supabase';

// 현재 적용된 프리뷰 코드 추적
interface AppliedPreview {
  tabId: number;
  cssCode: string;
  jsCode: string;
}

const appliedPreviews = new Map<number, AppliedPreview>();

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
        
        // ✅ 중복 방지: 기존 프리뷰를 완전히 제거 후 새 코드 적용
        console.log('[Background] 기존 프리뷰 제거 중...');
        await removePreviewFromTab(targetTabId);
        
        // 제거 후 잠깐 대기 (DOM 안정화)
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // CSS 적용
        if (css && css.trim()) {
            await applyCSSToTab(targetTabId, css);
        }
        
        // JavaScript 적용
        if (js && js.trim()) {
            await applyJSToTab(targetTabId, js);
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
    
    await chrome.scripting.insertCSS({
        target: { tabId },
        css: scopedCSS,
    });
    
    console.log('[Background] CSS 적용 완료');
}

/**
 * 탭에 JavaScript 적용
 */
async function applyJSToTab(tabId: number, js: string) {
    await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN', // 페이지 메인 컨텍스트에서 실행
        func: (jsCode: string) => {
            try {
                // ✅ 이전 변경사항 복원 시도
                console.log('[WebPage] 이전 JavaScript 변경사항 복원 시도...');
                
                // Site Topping이 변경했을 수 있는 공통 속성들을 기본값으로 복원
                const elementsToRestore = [
                    document.documentElement,
                    document.body,
                    ...Array.from(document.querySelectorAll('*')).slice(0, 50) // 상위 50개 요소만
                ];
                
                elementsToRestore.forEach(el => {
                    if (el && (el as HTMLElement).style) {
                        const htmlEl = el as HTMLElement;
                        // 자주 변경되는 스타일 속성들을 초기값으로 복원
                        const commonProps = [
                            'backgroundColor', 'color', 'fontSize', 'border', 
                            'margin', 'padding', 'display', 'opacity',
                            'transform', 'width', 'height'
                        ];
                        
                        commonProps.forEach(prop => {
                            if (htmlEl.style.getPropertyValue(prop)) {
                                htmlEl.style.removeProperty(prop);
                            }
                        });
                    }
                });
                
                // 새로운 JavaScript 실행
                new Function(jsCode)();
                console.log('[WebPage] JavaScript 실행 완료 (복원 시도 포함)');
            } catch (error) {
                console.error('[WebPage] JavaScript 실행 오류:', error);
                throw error;
            }
        },
        args: [js]
    });
    
    console.log('[Background] JavaScript 적용 완료');
}

/**
 * 탭에서 프리뷰 제거
 */
async function removePreviewFromTab(tabId: number) {
    console.log(`[Background] 탭 ${tabId}에서 프리뷰 제거 시작`);
    
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
    await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            // ✅ 중복 방지: Site Topping 관련 모든 요소와 변경사항 정리
            
            // 1. 프리뷰로 추가된 모든 요소 제거
            const previewElements = document.querySelectorAll('[data-site-topping-preview], [data-site-topping="preview"], [data-site-topping="preview-css"], [data-site-topping="preview-js"]');
            previewElements.forEach(el => {
                try {
                    el.remove();
                    console.log('[WebPage] 프리뷰 요소 제거:', el.tagName);
                } catch {}
            });
            
            // 2. Site Topping 스크립트 태그 제거
            const scripts = document.querySelectorAll('script');
            scripts.forEach(script => {
                if (script.textContent && (
                    script.textContent.includes('Site Topping') ||
                    script.id?.startsWith('site-topping') ||
                    script.hasAttribute('data-site-topping')
                )) {
                    script.remove();
                    console.log('[WebPage] Site Topping 스크립트 제거');
                }
            });
            
            // 3. 글로벌 변수 정리 (있다면)
            try {
                if (typeof (window as any).__siteTopping !== 'undefined') {
                    delete (window as any).__siteTopping;
                    console.log('[WebPage] Site Topping 글로벌 변수 정리');
                }
            } catch {}
            
            console.log('[WebPage] 완전한 프리뷰 정리 완료');
        }
    });
    
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