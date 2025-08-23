import { supabase } from './services/supabase';

// 현재 적용된 프리뷰 코드 추적
interface AppliedPreview {
  tabId: number;
  cssCode: string;
  jsCode: string;
}

const appliedPreviews = new Map<number, AppliedPreview>();
const reapplyThrottle = new Map<number, number>(); // tabId -> lastTs

// 메인 브랜치 방식의 라이브 프리뷰 재적용
async function reapplyLivePreview(tabId: number) {
  const now = Date.now();
  const last = reapplyThrottle.get(tabId) || 0;
  if (now - last < 300) return; // 300ms 스로틀
  reapplyThrottle.set(tabId, now);
  
  const preview = appliedPreviews.get(tabId);
  if (!preview) return;
  
  console.log('[Background] 메인 브랜치 방식 라이브 프리뷰 재적용:', tabId);
  
  // 메인 브랜치 방식으로 재적용
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: (cssCode: string, jsCode: string) => {
        return (window as any).__siteTopping_applyCodeMainBranch?.(cssCode, jsCode) || { success: false, error: '시스템이 초기화되지 않았습니다' };
      },
      args: [preview.cssCode || '', preview.jsCode || '']
    });
  } catch (error) {
    console.error('[Background] 라이브 재적용 실패:', error);
  }
}

// 네비게이션 완료 시 재적용 (라이브 모드)
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
    
    // 메인 브랜치 방식: 스냅샷 생성 및 코드 적용 요청
    if (message.type === 'CREATE_SNAPSHOT_AND_APPLY') {
        handleCreateSnapshotAndApplyMainBranch(message, sender, sendResponse);
        return true;
    }
    
    // 메인 브랜치 방식: 스냅샷에서 복원 요청
    if (message.type === 'RESTORE_FROM_SNAPSHOT') {
        handleRestoreFromSnapshotMainBranch(message, sender, sendResponse);
        return true;
    }
    
    // 메인 브랜치 방식: 실시간 코드 업데이트 요청
    if (message.type === 'UPDATE_PREVIEW_CODE') {
        handleUpdatePreviewCodeMainBranch(message, sender, sendResponse);
        return true;
    }
    
    // 코드 프리뷰 적용 요청 (레거시 호환용)
    if (message.type === 'APPLY_CODE_PREVIEW') {
        handleCreateSnapshotAndApplyMainBranch(message, sender, sendResponse);
        return true;
    }
    
    // 코드 프리뷰 제거 요청 (레거시 호환용)
    if (message.type === 'REMOVE_CODE_PREVIEW') {
        handleRestoreFromSnapshotMainBranch(message, sender, sendResponse);
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

// 메인 브랜치 방식: 스냅샷 생성 및 코드 적용 핸들러
async function handleCreateSnapshotAndApplyMainBranch(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
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
        
        console.log(`[Background] 메인 브랜치 방식 프리뷰 시작 - 탭 ${targetTabId}`);
        
        // 메인 브랜치 시스템 초기화 (한 번만)
        await initializeMainBranchSystem(targetTabId);
        
        // 적용된 코드 추적에 저장
        appliedPreviews.set(targetTabId, {
            tabId: targetTabId,
            cssCode: css || '',
            jsCode: js || ''
        });
        
        // 메인 브랜치 방식의 코드 적용
        const [result] = await chrome.scripting.executeScript({
            target: { tabId: targetTabId },
            world: 'MAIN',
            func: (cssCode: string, jsCode: string) => {
                return (window as any).__siteTopping_applyCodeMainBranch(cssCode, jsCode);
            },
            args: [css || '', js || '']
        });
        
        if (!result?.result?.success) {
            throw new Error(result?.result?.error || '메인 브랜치 방식 프리뷰 적용 실패');
        }
        
        console.log('[Background] 메인 브랜치 방식 프리뷰 적용 완료');
        sendResponse({ success: true });
        
    } catch (error) {
        console.error('[Background] 메인 브랜치 방식 프리뷰 적용 실패:', error);
        sendResponse({ success: false, error: error instanceof Error ? error.message : '알 수 없는 오류' });
    }
}

// 메인 브랜치 방식: 스냅샷에서 복원 핸들러
async function handleRestoreFromSnapshotMainBranch(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
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
        
        console.log(`[Background] 메인 브랜치 방식 베이스라인 복원 - 탭 ${targetTabId}`);
        
        // 적용된 코드 추적에서 제거
        appliedPreviews.delete(targetTabId);
        
        // 메인 브랜치 방식의 베이스라인 복원
        const [result] = await chrome.scripting.executeScript({
            target: { tabId: targetTabId },
            world: 'MAIN',
            func: () => {
                return (window as any).__siteTopping_disablePreviewMainBranch?.() || { success: true, restored: false };
            }
        });
        
        if (!result?.result?.success && result?.result?.restored !== false) {
            throw new Error(result?.result?.error || '메인 브랜치 방식 복원 실패');
        }
        
        console.log('[Background] 메인 브랜치 방식 베이스라인 복원 완료');
        sendResponse({ success: true });
        
    } catch (error) {
        console.error('[Background] 메인 브랜치 방식 복원 실패:', error);
        sendResponse({ success: false, error: error instanceof Error ? error.message : '알 수 없는 오류' });
    }
}

// 메인 브랜치 방식: 실시간 코드 업데이트 핸들러
async function handleUpdatePreviewCodeMainBranch(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
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
        
        console.log(`[Background] 메인 브랜치 방식 실시간 업데이트 - 탭 ${targetTabId}`);
        
        // 적용된 코드 추적 업데이트
        appliedPreviews.set(targetTabId, {
            tabId: targetTabId,
            cssCode: css || '',
            jsCode: js || ''
        });
        
        // 메인 브랜치 방식의 실시간 업데이트
        const [result] = await chrome.scripting.executeScript({
            target: { tabId: targetTabId },
            world: 'MAIN',
            func: (cssCode: string, jsCode: string) => {
                return (window as any).__siteTopping_applyCodeMainBranch(cssCode, jsCode);
            },
            args: [css || '', js || '']
        });
        
        if (!result?.result?.success) {
            throw new Error(result?.result?.error || '메인 브랜치 방식 실시간 업데이트 실패');
        }
        
        console.log('[Background] 메인 브랜치 방식 실시간 업데이트 완료');
        sendResponse({ success: true });
        
    } catch (error) {
        console.error('[Background] 메인 브랜치 방식 실시간 업데이트 실패:', error);
        sendResponse({ success: false, error: error instanceof Error ? error.message : '알 수 없는 오류' });
    }
}

// 메인 브랜치 방식: 페이지 컨텍스트에 시스템 초기화
async function initializeMainBranchSystem(tabId: number): Promise<void> {
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: () => {
                // 이미 초기화되었으면 스킵
                if ((window as any).__siteTopping_mainBranchInitialized) return { success: true };
                
                // 메인 브랜치 방식 초기화
                (window as any).__siteTopping_mainBranchInitialized = true;
                
                // 전역 변수들
                const EXTENSION_PREFIX = 'site-topping-';
                let baselineSnapshot: any = null;
                let isRestoringBaseline = false;
                let isApplyingCode = false;
                let appliedCode: any = {};
                let previewObserver: MutationObserver | null = null;
                let previewAddedNodes: Set<Element> = new Set();
                
                // 익스텐션 루트 찾기
                function getExtensionRoot(): HTMLElement | null {
                    return document.getElementById('site-topping-root');
                }
                
                // 베이스라인 캡처
                function captureBaselineIfNeeded(): void {
                    if (baselineSnapshot) return;
                    try {
                        // 익스텐션 루트 제외하고 body 복제
                        const clone = document.body.cloneNode(true) as HTMLElement;
                        const extInClone = clone.querySelector('#site-topping-root') as HTMLElement;
                        if (extInClone) extInClone.remove();

                        // head 요소들의 시그니처 저장
                        const headSigs = Array.from(document.head.children).map(el => (el as HTMLElement).outerHTML);
                        
                        // 요소 속성들 저장
                        const elementAttributes = new Map<Element, Map<string, string>>();
                        document.querySelectorAll('*').forEach(el => {
                            if (el.id !== 'site-topping-root' && !el.closest('#site-topping-root')) {
                                const attrs = new Map<string, string>();
                                Array.from(el.attributes).forEach(attr => {
                                    attrs.set(attr.name, attr.value);
                                });
                                if (attrs.size > 0) {
                                    elementAttributes.set(el, attrs);
                                }
                            }
                        });

                        baselineSnapshot = {
                            bodyHTML: clone.innerHTML,
                            scrollX: window.scrollX,
                            scrollY: window.scrollY,
                            headSigs,
                            elementAttributes,
                        };
                        
                        console.log('[WebPage] 메인 브랜치 베이스라인 캡처 완료');
                    } catch (e) {
                        console.warn('[Site Topping] 베이스라인 캡처 실패:', e);
                    }
                }
                
                // 프리뷰 관찰자 시작
                function startPreviewObserver(): void {
                    stopPreviewObserverAndCleanup();

                    previewObserver = new MutationObserver((records) => {
                        for (const rec of records) {
                            if (rec.type === 'childList') {
                                rec.addedNodes.forEach((n) => {
                                    if (n.nodeType !== Node.ELEMENT_NODE) return;
                                    const el = n as Element;
                                    if (shouldIgnoreAddedElement(el)) return;
                                    (el as HTMLElement).setAttribute('data-site-topping-added', 'true');
                                    previewAddedNodes.add(el);
                                });
                            }
                        }
                    });

                    try {
                        previewObserver.observe(document.documentElement, {
                            childList: true,
                            subtree: true,
                            attributes: true,
                            attributeFilter: ['style', 'class', 'data-*']
                        });
                    } catch (e) {
                        console.warn('[Site Topping] 프리뷰 옵저버 시작 실패:', e);
                    }
                }
                
                // 추가된 요소 무시 여부 확인
                function shouldIgnoreAddedElement(el: Element): boolean {
                    if (el.id && el.id.startsWith(EXTENSION_PREFIX)) return true;
                    const root = getExtensionRoot();
                    if (root && (el === root || root.contains(el))) return true;
                    return false;
                }
                
                // 프리뷰 관찰자 정리
                function stopPreviewObserverAndCleanup(): void {
                    try {
                        if (previewObserver) {
                            previewObserver.disconnect();
                            previewObserver = null;
                        }
                        const root = getExtensionRoot();
                        previewAddedNodes.forEach((el) => {
                            try {
                                if (!el.isConnected) return;
                                if (root && (el === root || root.contains(el))) return;
                                el.remove();
                            } catch {}
                        });
                    } finally {
                        previewAddedNodes.clear();
                    }
                }
                
                // JavaScript 정리
                function cleanupJavaScriptEffects(): void {
                    try {
                        window.postMessage({ type: 'SITE_TOPPING_PREVIEW_STOP' }, '*');
                    } catch (e) {
                        console.warn('[Site Topping] 페이지 컨텍스트 정리 실패:', e);
                    }
                    
                    setTimeout(() => {
                        try {
                            window.postMessage({ type: 'SITE_TOPPING_FORCE_CLEANUP' }, '*');
                        } catch {}
                    }, 100);
                }
                
                // 적용된 코드 제거
                function removeCodeFromPage(): void {
                    if (appliedCode.css) {
                        appliedCode.css.remove();
                        appliedCode.css = undefined;
                    }

                    if (appliedCode.js) {
                        appliedCode.js.remove();
                        appliedCode.js = undefined;
                    }
                }
                
                // CSS 스코핑
                function applyCSSScoping(css: string): string {
                    try {
                        return css.split('}').filter(rule => rule.trim()).map(rule => {
                            const trimmed = rule.trim();
                            if (!trimmed) return '';
                            
                            const braceIndex = trimmed.indexOf('{');
                            if (braceIndex === -1) return trimmed + '}';
                            
                            const selectors = trimmed.substring(0, braceIndex).trim();
                            const properties = trimmed.substring(braceIndex + 1).trim();
                            
                            // @ 규칙이나 주석은 그대로 유지
                            if (selectors.startsWith('@') || selectors.includes('/*')) {
                                return `${selectors} { ${properties} }`;
                            }
                            
                            // 선택자 스코핑
                            const scopedSelectors = selectors.split(',').map(sel => {
                                const trimmed = sel.trim();
                                if (trimmed === '*' || trimmed === 'html' || trimmed === 'body') {
                                    return `${trimmed}:not(#site-topping-root):not(#site-topping-root *)`;
                                }
                                return `${trimmed}:not(#site-topping-root *)`;
                            }).join(', ');
                            
                            return `${scopedSelectors} { ${properties} }`;
                        }).join('\n');
                    } catch (e) {
                        console.warn('[Site Topping] CSS 스코핑 실패:', e);
                        return css;
                    }
                }
                
                // 베이스라인 복원
                function restoreBaseline(): void {
                    if (!baselineSnapshot || isRestoringBaseline) return;
                    isRestoringBaseline = true;
                    
                    try {
                        removeCodeFromPage();
                        cleanupJavaScriptEffects();
                        
                        const root = getExtensionRoot();
                        
                        // 애니메이션이 있는 페이지는 gentle restore 사용
                        const hasAnimations = document.querySelectorAll('[style*="transition"], [style*="animation"], .animate, [class*="animate"]').length > 0;
                        
                        if (hasAnimations) {
                            // Gentle restore: DOM 구조 보존하면서 속성만 복원
                            performGentleRestore();
                        } else {
                            // Full restore: DOM 완전 재구성
                            performFullRestore(root);
                        }
                        
                        // 스크롤 위치 복원
                        window.scrollTo(baselineSnapshot.scrollX, baselineSnapshot.scrollY);
                        
                        // 애니메이션 상태 복원
                        restoreAnimationStates();
                        
                        stopPreviewObserverAndCleanup();
                        
                    } catch (e) {
                        console.warn('[Site Topping] 베이스라인 복원 실패:', e);
                    } finally {
                        isRestoringBaseline = false;
                    }
                }
                
                // Gentle restore
                function performGentleRestore(): void {
                    // 추가된 요소들만 제거
                    const addedElements = document.querySelectorAll('[data-site-topping-added]');
                    addedElements.forEach(el => el.remove());
                    
                    // 원본 속성들 복원
                    if (baselineSnapshot?.elementAttributes) {
                        baselineSnapshot.elementAttributes.forEach((attrs: Map<string, string>, element: Element) => {
                            if (!element.isConnected) return;
                            
                            // 스타일 속성 복원
                            const originalStyle = attrs.get('style') || '';
                            if (element.getAttribute('style') !== originalStyle) {
                                if (originalStyle) {
                                    element.setAttribute('style', originalStyle);
                                } else {
                                    element.removeAttribute('style');
                                }
                            }
                            
                            // 클래스 속성 복원
                            const originalClass = attrs.get('class') || '';
                            if (element.getAttribute('class') !== originalClass) {
                                if (originalClass) {
                                    element.setAttribute('class', originalClass);
                                } else {
                                    element.removeAttribute('class');
                                }
                            }
                        });
                    }
                }
                
                // Full restore
                function performFullRestore(root: HTMLElement | null): void {
                    if (!baselineSnapshot) return;
                    
                    if (!root) {
                        document.body.innerHTML = baselineSnapshot.bodyHTML;
                    } else {
                        // 익스텐션 루트 보존하면서 복원
                        if (root.parentElement !== document.body) {
                            document.body.appendChild(root);
                        }
                        const children = Array.from(document.body.childNodes);
                        for (const node of children) {
                            if (node !== root) node.parentNode?.removeChild(node);
                        }
                        const tpl = document.createElement('template');
                        tpl.innerHTML = baselineSnapshot.bodyHTML;
                        document.body.insertBefore(tpl.content, root);
                    }
                }
                
                // 애니메이션 상태 복원
                function restoreAnimationStates(): void {
                    try {
                        // 리플로우 강제 실행
                        document.documentElement.offsetHeight;
                        document.body.offsetHeight;
                        
                        // 애니메이션 요소들 재시작
                        const animatedElements = document.querySelectorAll('[style*="animation"], [style*="transition"], [class*="animate"]');
                        animatedElements.forEach(el => {
                            if (el.closest('#site-topping-root')) return;
                            
                            const htmlEl = el as HTMLElement;
                            const computedStyle = window.getComputedStyle(htmlEl);
                            
                            if (computedStyle.animationName !== 'none') {
                                const originalDisplay = htmlEl.style.display;
                                htmlEl.style.display = 'none';
                                htmlEl.offsetHeight;
                                htmlEl.style.display = originalDisplay;
                            }
                        });
                        
                        // 마우스 이벤트 재트리거
                        setTimeout(() => {
                            try {
                                document.body.offsetHeight;
                                window.dispatchEvent(new Event('resize'));
                            } catch {}
                        }, 50);
                        
                    } catch (e) {
                        console.warn('[Site Topping] 애니메이션 상태 복원 실패:', e);
                    }
                }
                
                // 메인 함수: 코드 적용
                (window as any).__siteTopping_applyCodeMainBranch = function(cssCode: string, jsCode: string) {
                    if (isApplyingCode || isRestoringBaseline) {
                        console.warn('[Site Topping] 코드 적용 차단 - 다른 작업 진행 중');
                        return { success: false, error: '다른 작업 진행 중' };
                    }
                    
                    isApplyingCode = true;
                    
                    try {
                        // 베이스라인 캡처 (한 번만)
                        captureBaselineIfNeeded();
                        
                        // 기존 익스텐션 코드만 정리 (베이스라인 유지)
                        removeCodeFromPage();
                        
                        // 프리뷰 관찰자 시작
                        startPreviewObserver();
                        
                        // 프리뷰 시작 알림
                        try { 
                            window.postMessage({ type: 'SITE_TOPPING_PREVIEW_START' }, '*'); 
                        } catch {}

                        // CSS 적용
                        if (cssCode && cssCode.trim()) {
                            const styleElement = document.createElement('style');
                            styleElement.id = `${EXTENSION_PREFIX}injected-css`;
                            styleElement.textContent = applyCSSScoping(cssCode);
                            document.head.appendChild(styleElement);
                            appliedCode.css = styleElement;
                        }

                        // JavaScript 적용
                        if (jsCode && jsCode.trim()) {
                            try {
                                // 페이지 컨텍스트에서 직접 실행
                                const func = new Function(jsCode);
                                func();
                                
                                // 마커 생성
                                const markerElement = document.createElement('script');
                                markerElement.id = `${EXTENSION_PREFIX}injected-js-marker`;
                                markerElement.setAttribute('data-type', 'text/plain');
                                markerElement.dataset.applied = 'true';
                                markerElement.dataset.timestamp = Date.now().toString();
                                document.head.appendChild(markerElement);
                                appliedCode.js = markerElement;
                            } catch (error) {
                                console.error('[Site Topping] JavaScript 실행 실패:', error);
                            }
                        }

                        console.log('[WebPage] 메인 브랜치 방식 코드 적용 완료');
                        return { success: true };
                        
                    } catch (error) {
                        console.error('[WebPage] 메인 브랜치 방식 코드 적용 실패:', error);
                        return { success: false, error: error instanceof Error ? error.message : String(error) };
                    } finally {
                        isApplyingCode = false;
                    }
                };
                
                // 메인 함수: 프리뷰 비활성화
                (window as any).__siteTopping_disablePreviewMainBranch = function() {
                    if (isApplyingCode) {
                        console.warn('[Site Topping] 프리뷰 비활성화 차단 - 코드 적용 진행 중');
                        setTimeout(() => (window as any).__siteTopping_disablePreviewMainBranch(), 150);
                        return { success: false, error: '코드 적용 진행 중' };
                    }
                    
                    try {
                        // 베이스라인 복원
                        restoreBaseline();
                        
                        console.log('[WebPage] 메인 브랜치 방식 프리뷰 비활성화 완료');
                        return { success: true, restored: true };
                        
                    } catch (error) {
                        console.error('[WebPage] 메인 브랜치 방식 프리뷰 비활성화 실패:', error);
                        return { success: false, error: error instanceof Error ? error.message : String(error) };
                    }
                };
                
                console.log('[WebPage] 메인 브랜치 시스템 초기화 완료');
                return { success: true };
            }
        });
    } catch (error) {
        console.error('[Background] 메인 브랜치 시스템 초기화 실패:', error);
    }
}

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
        throw new Error(`Script execution failed: ${mainWorldError instanceof Error ? mainWorldError.message : String(mainWorldError)}`);
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
