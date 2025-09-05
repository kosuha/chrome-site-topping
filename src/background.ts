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
  if (now - last < 300) {
    console.log(`[Background] 재적용 스로틀 - 탭 ${tabId}, 대기시간: ${300 - (now - last)}ms`);
    return; // 300ms 스로틀
  }
  reapplyThrottle.set(tabId, now);
  
  const preview = appliedPreviews.get(tabId);
  console.log(`[Background] 재적용 확인 - 탭 ${tabId}:`, preview ? `CSS: ${preview.cssCode?.length || 0}자, JS: ${preview.jsCode?.length || 0}자` : '프리뷰 없음');
  
  if (!preview) {
    console.log(`[Background] 탭 ${tabId}에 적용된 프리뷰 없음 - 재적용 건너뜀`);
    return;
  }
  
  console.log(`[Background] 메인 브랜치 방식 라이브 프리뷰 재적용 시작 - 탭 ${tabId}`);
  console.log(`[Background] 재적용할 코드 - CSS: "${preview.cssCode?.substring(0, 100)}...", JS: "${preview.jsCode?.substring(0, 100)}..."`);
  
  // 먼저 시스템 초기화
  try {
    await initializeMainBranchSystem(tabId);
  } catch (initError) {
    console.error(`[Background] 시스템 초기화 실패 - 탭 ${tabId}:`, initError);
    return;
  }
  
  // 메인 브랜치 방식으로 재적용
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: async (cssCode: string, jsCode: string) => {
        console.log(`[WebPage] 재적용 요청 - CSS: ${cssCode?.length || 0}자, JS: ${jsCode?.length || 0}자`);
        const applyFunc = (window as any).__siteTopping_applyCodeMainBranch;
        if (!applyFunc) {
          console.error('[WebPage] __siteTopping_applyCodeMainBranch 함수 없음');
          return { success: false, error: '시스템이 초기화되지 않았습니다' };
        }
        const result = await applyFunc(cssCode, jsCode);
        console.log('[WebPage] 재적용 결과:', result);
        return result;
      },
      args: [preview.cssCode || '', preview.jsCode || '']
    });
    
    console.log(`[Background] 재적용 완료 - 탭 ${tabId}:`, result?.result);
    
    if (!result?.result?.success) {
      console.error(`[Background] 재적용 실패 - 탭 ${tabId}:`, result?.result?.error);
    }
  } catch (error) {
    console.error(`[Background] 라이브 재적용 실패 - 탭 ${tabId}:`, error);
  }
}

// 페이지 네비게이션 완료 시 적용된 프리뷰 상태 확인 후 재적용
chrome.webNavigation.onCompleted.addListener(async (details) => {
  try {
    if (details.frameId !== 0) {
      console.log(`[Background] 서브프레임 네비게이션 무시 - 탭 ${details.tabId}, 프레임 ${details.frameId}`);
      return; // 최상위 프레임만
    }
    
    console.log(`[Background] 페이지 네비게이션 완료 - 탭 ${details.tabId}, URL: ${details.url}`);
    console.log(`[Background] 현재 적용된 프리뷰 목록:`, Array.from(appliedPreviews.keys()));
    
    // 프리뷰가 적용되어 있다면 새로고침 후에도 재적용
    const preview = appliedPreviews.get(details.tabId);
    if (preview) {
      console.log(`[Background] 페이지 새로고침 감지 - 프리뷰 재적용 시작: 탭 ${details.tabId}`);
      await reapplyLivePreview(details.tabId);
    } else {
      console.log(`[Background] 탭 ${details.tabId}에 적용된 프리뷰 없음 - 재적용 건너뜀`);
    }
  } catch (e) {
    console.error('[Background] 네비게이션 후 재적용 실패:', e);
  }
});

// SPA 라우팅(History API) 시에도 재적용
chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
  try {
    if (details.frameId !== 0) return;
    
    // 프리뷰가 적용되어 있다면 SPA 네비게이션 후에도 재적용
    const preview = appliedPreviews.get(details.tabId);
    if (preview) {
      console.log('[Background] SPA 네비게이션 감지 - 프리뷰 재적용:', details.tabId);
      await reapplyLivePreview(details.tabId);
    }
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
        
        console.log(`[Background] 프리뷰 상태 저장 - 탭 ${targetTabId}: CSS ${(css || '').length}자, JS ${(js || '').length}자`);
        console.log(`[Background] 현재 추적 중인 탭들:`, Array.from(appliedPreviews.keys()));
        
        // 메인 브랜치 방식의 코드 적용
        const [result] = await chrome.scripting.executeScript({
            target: { tabId: targetTabId },
            world: 'MAIN',
            func: async (cssCode: string, jsCode: string) => {
                return await (window as any).__siteTopping_applyCodeMainBranch(cssCode, jsCode);
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
        
        // 적용된 코드 추적에서 제거 (프리뷰 종료로 더 이상 재적용하지 않음)
        appliedPreviews.delete(targetTabId);
        console.log(`[Background] 탭 ${targetTabId} 프리뷰 상태 제거 - 새로고침 시 재적용 안됨`);
        
        // 메인 브랜치 방식의 베이스라인 복원
        const [result] = await chrome.scripting.executeScript({
            target: { tabId: targetTabId },
            world: 'MAIN',
            func: async () => {
                return await (window as any).__siteTopping_disablePreviewMainBranch?.() || { success: true, restored: false };
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
            func: async (cssCode: string, jsCode: string) => {
                return await (window as any).__siteTopping_applyCodeMainBranch(cssCode, jsCode);
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
                let isRestoringBaseline = false;
                let isApplyingCode = false;
                
                // 익스텐션 루트 찾기
                function getExtensionRoot(): HTMLElement | null {
                    return document.getElementById('site-topping-root');
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
                            
                            // 선택자 스코핑 - 애니메이션 관련은 특별 처리
                            const scopedSelectors = selectors.split(',').map(sel => {
                                const s = sel.trim();
                                if (s === '*' || s === 'html' || s === 'body') {
                                    return `${s}:not(#site-topping-root):not(#site-topping-root *)`;
                                }
                                // 애니메이션 관련 선택자는 더 관대하게 처리
                                if (isAnimationSelector(s)) {
                                    return `${s}:not(#site-topping-root *)`;
                                }
                                return `${s}:not(#site-topping-root *)`;
                            }).join(', ');
                            
                            return `${scopedSelectors} { ${properties} }`;
                        }).join('\n');
                    } catch (e) {
                        console.warn('[Site Topping] CSS 스코핑 실패:', e);
                        return css;
                    }
                }
                
                function isAnimationSelector(selector: string): boolean {
                    const animationPatterns = [
                        ':hover', ':focus', ':active', ':visited',
                        ':before', ':after', '::before', '::after',
                        '[data-', '[aria-',
                        '.animate', '.transition', '.hover',
                        '@keyframes', '@-webkit-keyframes'
                    ];
                    return animationPatterns.some(pattern => 
                        selector.toLowerCase().includes(pattern.toLowerCase())
                    );
                }
                
                function preserveCSSVariables(css: string): string {
                    const lines = css.split('\n');
                    return lines.map(line => {
                        // CSS 변수 정의를 전역으로 유지
                        if (line.trim().startsWith('--') || line.includes('var(--')) {
                            return line;
                        }
                        return line;
                    }).join('\n');
                }
                
                // Enhanced Preview manager with animation preservation and intelligent restore
                const __preview = (() => {
                  const state: any = {
                    guard: false,
                    patched: false,
                    // Enhanced baseline snapshot
                    baselineSnapshot: null as any,
                    logs: {
                      addedNodes: new Set<Element>(),
                      attrChanges: [] as any[],
                      styleChanges: [] as any[],
                      classOriginals: new Map<Element, string>(),
                      listeners: [] as any[],
                      timers: [] as any[],
                      rafs: [] as number[],
                      observers: [] as MutationObserver[],
                    },
                    originals: {} as any,
                    css: { sheet: null as any, styleEl: null as HTMLStyleElement | null },
                    js: { blobUrl: null as string | null, module: null as any, scriptEl: null as HTMLScriptElement | null },
                  };
                  
                  function shouldIgnoreAddedElement(el: Element): boolean {
                    if ((el as HTMLElement).id && (el as HTMLElement).id.startsWith(EXTENSION_PREFIX)) return true;
                    const root = getExtensionRoot();
                    if (root && (el === root || root.contains(el))) return true;
                    return false;
                  }
                  
                  // Enhanced baseline snapshot capture
                  function captureEnhancedBaseline() {
                    try {
                      const clone = document.body.cloneNode(true);
                      const extInClone = (clone as HTMLElement).querySelector('#site-topping-root');
                      if (extInClone) extInClone.remove();
                      
                      const headSigs = Array.from(document.head.children).map((el) => (el as HTMLElement).outerHTML);
                      
                      // Capture computed styles of key elements
                      const computedStyles = new Map();
                      const keyElements = document.querySelectorAll('body, html, [style], [class], [id]');
                      keyElements.forEach(el => {
                        if (el.id !== 'site-topping-root' && !el.closest('#site-topping-root')) {
                          computedStyles.set(el, window.getComputedStyle(el));
                        }
                      });
                      
                      // Capture element attributes
                      const elementAttributes = new Map();
                      document.querySelectorAll('*').forEach(el => {
                        if (el.id !== 'site-topping-root' && !el.closest('#site-topping-root')) {
                          const attrs = new Map();
                          for (const attr of el.attributes) {
                            attrs.set(attr.name, attr.value);
                          }
                          if (attrs.size > 0) {
                            elementAttributes.set(el, attrs);
                          }
                        }
                      });
                      
                      state.baselineSnapshot = {
                        bodyHTML: (clone as HTMLElement).innerHTML,
                        scrollX: window.scrollX,
                        scrollY: window.scrollY,
                        headSigs,
                        computedStyles,
                        eventListeners: new Map(),
                        elementAttributes,
                      };
                      
                      console.log('[Site Topping] Enhanced baseline captured');
                    } catch (e) {
                      console.warn('[Site Topping] Failed to capture enhanced baseline:', e);
                    }
                  }
                  
                  // Intelligent restore strategy
                  function shouldUseGentleRestore() {
                    const hasAnimations = document.querySelectorAll('[style*="transition"], [style*="animation"], .animate, [class*="animate"]').length > 0;
                    const hasComplexCSS = Array.from(document.styleSheets).some(sheet => {
                      try {
                        return Array.from(sheet.cssRules).some(rule => 
                          rule.cssText.includes('@keyframes') || 
                          rule.cssText.includes('transition') ||
                          rule.cssText.includes('animation')
                        );
                      } catch {
                        return false;
                      }
                    });
                    return hasAnimations || hasComplexCSS;
                  }
                  
                  // Animation state restoration
                  function restoreAnimationStates() {
                    try {
                      // Force multiple reflows to ensure animations are properly initialized
                      document.documentElement.offsetHeight;
                      document.body.offsetHeight;
                      
                      // Trigger CSS animation restart for elements with animations
                      const animatedElements = document.querySelectorAll('[style*="animation"], [style*="transition"], [class*="animate"]');
                      animatedElements.forEach(el => {
                        if (el.closest('#site-topping-root')) return;
                        
                        const htmlEl = el as HTMLElement;
                        const computedStyle = window.getComputedStyle(htmlEl);
                        
                        // Force animation restart by temporarily disabling and re-enabling
                        if (computedStyle.animationName !== 'none') {
                          const originalDisplay = htmlEl.style.display;
                          htmlEl.style.display = 'none';
                          htmlEl.offsetHeight; // Force reflow
                          htmlEl.style.display = originalDisplay;
                        }
                      });
                      
                      // Re-trigger hover states if mouse is over elements
                      const elementUnderMouse = document.elementFromPoint(
                        window.innerWidth / 2, 
                        window.innerHeight / 2
                      );
                      
                      if (elementUnderMouse && !elementUnderMouse.closest('#site-topping-root')) {
                        // Dispatch mouse events to re-trigger hover states
                        const mouseEnterEvent = new MouseEvent('mouseenter', { bubbles: true });
                        const mouseOverEvent = new MouseEvent('mouseover', { bubbles: true });
                        elementUnderMouse.dispatchEvent(mouseEnterEvent);
                        elementUnderMouse.dispatchEvent(mouseOverEvent);
                      }
                      
                      // Wait a bit then force another reflow
                      setTimeout(() => {
                        try {
                          document.body.offsetHeight;
                          window.dispatchEvent(new Event('resize'));
                        } catch {}
                      }, 50);
                      
                    } catch (e) {
                      console.warn('[Site Topping] Failed to restore animation states:', e);
                    }
                  }
                  
                  function patchIfNeeded(){
                    if (state.patched) return;
                    state.patched = true;
                    const o = state.originals;
                    
                    // Element append/insert/remove
                    o.appendChild = (Element.prototype as any).appendChild;
                    (Element.prototype as any).appendChild = function(node: any){
                      if (state.guard && node && node.nodeType === 1 && !shouldIgnoreAddedElement(node)) {
                        state.logs.addedNodes.add(node);
                        // Mark element for easier cleanup
                        if ((window as any).__siteTopping_previewActive) {
                          (node as HTMLElement).setAttribute('data-site-topping-added', 'true');
                        }
                      }
                      return o.appendChild.call(this, node);
                    };
                    o.insertBefore = (Element.prototype as any).insertBefore;
                    (Element.prototype as any).insertBefore = function(node: any, ref: any){
                      if (state.guard && node && node.nodeType === 1 && !shouldIgnoreAddedElement(node)) {
                        state.logs.addedNodes.add(node);
                        // Mark element for easier cleanup
                        if ((window as any).__siteTopping_previewActive) {
                          (node as HTMLElement).setAttribute('data-site-topping-added', 'true');
                        }
                      }
                      return o.insertBefore.call(this, node, ref);
                    };
                    o.removeChild = (Element.prototype as any).removeChild;
                    (Element.prototype as any).removeChild = function(child: any){
                      return o.removeChild.call(this, child);
                    };
                    // setAttribute/removeAttribute
                    o.setAttribute = (Element.prototype as any).setAttribute;
                    (Element.prototype as any).setAttribute = function(name: string, value: string){
                      if (state.guard && this instanceof Element && name !== 'data-site-topping-added') {
                        const existed = this.hasAttribute(name);
                        const prev = existed ? this.getAttribute(name) : null;
                        state.logs.attrChanges.push({ el: this, name, prev, existed });
                      }
                      return o.setAttribute.call(this, name, value);
                    };
                    o.removeAttribute = (Element.prototype as any).removeAttribute;
                    (Element.prototype as any).removeAttribute = function(name: string){
                      if (state.guard && this instanceof Element) {
                        const existed = this.hasAttribute(name);
                        const prev = existed ? this.getAttribute(name) : null;
                        state.logs.attrChanges.push({ el: this, name, prev, existed });
                      }
                      return o.removeAttribute.call(this, name);
                    };
                    // classList ops
                    function recordClassOriginal(el: Element){
                      if (state.guard && el && !state.logs.classOriginals.has(el)) {
                        state.logs.classOriginals.set(el, (el as HTMLElement).className || '');
                      }
                    }
                    o.classListAdd = (DOMTokenList.prototype as any).add;
                    (DOMTokenList.prototype as any).add = function(...tokens: string[]){
                      recordClassOriginal((this as any).ownerElement);
                      return o.classListAdd.apply(this, tokens as any);
                    };
                    o.classListRemove = (DOMTokenList.prototype as any).remove;
                    (DOMTokenList.prototype as any).remove = function(...tokens: string[]){
                      recordClassOriginal((this as any).ownerElement);
                      return o.classListRemove.apply(this, tokens as any);
                    };
                    o.classListToggle = (DOMTokenList.prototype as any).toggle;
                    (DOMTokenList.prototype as any).toggle = function(token: string, force?: boolean){
                      recordClassOriginal((this as any).ownerElement);
                      return o.classListToggle.call(this, token, force);
                    };
                    // style.setProperty/removeProperty
                    o.setProperty = (CSSStyleDeclaration.prototype as any).setProperty;
                    (CSSStyleDeclaration.prototype as any).setProperty = function(prop: string, val: string | null, priority?: string){
                      if (state.guard) {
                        const el = (this as any).__element || (this as any).ownerElement;
                        if (el instanceof Element) {
                          const prev = (this as any).getPropertyValue(prop);
                          const prio = (this as any).getPropertyPriority(prop);
                          state.logs.styleChanges.push({ el, prop, prev, priority: prio });
                        }
                      }
                      return o.setProperty.call(this, prop, val as any, priority);
                    };
                    o.removeProperty = (CSSStyleDeclaration.prototype as any).removeProperty;
                    (CSSStyleDeclaration.prototype as any).removeProperty = function(prop: string){
                      if (state.guard) {
                        const el = (this as any).__element || (this as any).ownerElement;
                        if (el instanceof Element) {
                          const prev = (this as any).getPropertyValue(prop);
                          const prio = (this as any).getPropertyPriority(prop);
                          state.logs.styleChanges.push({ el, prop, prev, priority: prio });
                        }
                      }
                      return o.removeProperty.call(this, prop);
                    };
                    // Enhanced addEventListener/removeEventListener with preview tracking
                    o.addEventListener = (EventTarget.prototype as any).addEventListener;
                    o.removeEventListener = (EventTarget.prototype as any).removeEventListener;
                    (EventTarget.prototype as any).addEventListener = function(type: string, listener: any, options?: any){
                      let wrapped = listener;
                      if (listener && typeof listener === 'function') {
                        wrapped = function(this: any, ...args: any[]){
                          const prev = state.guard; state.guard = true;
                          try { return (listener as any).apply(this, args); }
                          finally { state.guard = prev; }
                        };
                        (wrapped as any).__st_orig = listener;
                      }
                      
                      // Enhanced preview tracking: only track listeners added during preview
                      if (state.guard && (window as any).__siteTopping_previewActive) {
                        const key = this;
                        if (!(window as any).__siteTopping_addedListeners) {
                          (window as any).__siteTopping_addedListeners = new Map();
                        }
                        if (!(window as any).__siteTopping_addedListeners.has(key)) {
                          (window as any).__siteTopping_addedListeners.set(key, []);
                        }
                        (window as any).__siteTopping_addedListeners.get(key).push({ type, listener: wrapped, orig: listener, options });
                      }
                      
                      if (state.guard) {
                        state.logs.listeners.push({ target: this, type, listener: wrapped, orig: listener, options });
                      }
                      return o.addEventListener.call(this, type, wrapped, options);
                    };
                    (EventTarget.prototype as any).removeEventListener = function(type: string, listener: any, options?: any){
                      const rec = state.logs.listeners.find((l: any) => l.target === this && l.type === type && (l.orig === listener || l.listener === listener));
                      const toRemove = rec ? rec.listener : listener;
                      return o.removeEventListener.call(this, type, toRemove, options);
                    };
                    // timers
                    o.setTimeout = window.setTimeout;
                    o.clearTimeout = window.clearTimeout;
                    window.setTimeout = function(handler: any, timeout?: number, ...args: any[]): any {
                      const wrapped = typeof handler === 'function' ? function(...a: any[]){
                        const prev = state.guard; state.guard = true;
                        try { return handler(...a); } finally { state.guard = prev; }
                      } : handler;
                      const id = o.setTimeout.call(window, wrapped as any, timeout as any, ...args);
                      if (state.guard) state.logs.timers.push({ kind: 'timeout', id });
                      return id;
                    } as any;
                    window.clearTimeout = function(id: any){ return o.clearTimeout.call(window, id); } as any;

                    o.setInterval = window.setInterval;
                    o.clearInterval = window.clearInterval;
                    window.setInterval = function(handler: any, timeout?: number, ...args: any[]){
                      const wrapped = typeof handler === 'function' ? function(...a: any[]){
                        const prev = state.guard; state.guard = true;
                        try { return handler(...a); } finally { state.guard = prev; }
                      } : handler;
                      const id = o.setInterval.call(window, wrapped as any, timeout as any, ...args);
                      if (state.guard) state.logs.timers.push({ kind: 'interval', id });
                      return id;
                    } as any;
                    window.clearInterval = function(id: any){ return o.clearInterval.call(window, id); } as any;

                    o.requestAnimationFrame = window.requestAnimationFrame;
                    o.cancelAnimationFrame = window.cancelAnimationFrame;
                    window.requestAnimationFrame = function(cb: FrameRequestCallback){
                      const wrapped = function(ts: number){
                        const prev = state.guard; state.guard = true;
                        try { return cb(ts); } finally { state.guard = prev; }
                      };
                      const id = o.requestAnimationFrame.call(window, wrapped);
                      if (state.guard) state.logs.rafs.push(id);
                      return id;
                    };
                    window.cancelAnimationFrame = function(id: number){ return o.cancelAnimationFrame.call(window, id); } as any;

                    // MutationObserver
                    o.MutationObserver = (window as any).MutationObserver;
                    (window as any).MutationObserver = function(callback: any){
                      const wrappedCb = function(records: any[], observer: any){
                        const prev = state.guard; state.guard = true;
                        try { return callback(records, observer); } finally { state.guard = prev; }
                      };
                      const obs = new o.MutationObserver(wrappedCb);
                      if (state.guard) state.logs.observers.push(obs);
                      return obs;
                    } as any;
                    (window as any).MutationObserver.prototype = o.MutationObserver.prototype;
                  }
                  
                  function unpatch(){
                    if (!state.patched) return;
                    const o = state.originals;
                    (Element.prototype as any).appendChild = o.appendChild;
                    (Element.prototype as any).insertBefore = o.insertBefore;
                    (Element.prototype as any).removeChild = o.removeChild;
                    (Element.prototype as any).setAttribute = o.setAttribute;
                    (Element.prototype as any).removeAttribute = o.removeAttribute;
                    (DOMTokenList.prototype as any).add = o.classListAdd;
                    (DOMTokenList.prototype as any).remove = o.classListRemove;
                    (DOMTokenList.prototype as any).toggle = o.classListToggle;
                    (CSSStyleDeclaration.prototype as any).setProperty = o.setProperty;
                    (CSSStyleDeclaration.prototype as any).removeProperty = o.removeProperty;
                    (EventTarget.prototype as any).addEventListener = o.addEventListener;
                    (EventTarget.prototype as any).removeEventListener = o.removeEventListener;
                    (window as any).setTimeout = o.setTimeout;
                    (window as any).clearTimeout = o.clearTimeout;
                    (window as any).setInterval = o.setInterval;
                    (window as any).clearInterval = o.clearInterval;
                    (window as any).requestAnimationFrame = o.requestAnimationFrame;
                    (window as any).cancelAnimationFrame = o.cancelAnimationFrame;
                    (window as any).MutationObserver = o.MutationObserver;
                    state.patched = false;
                  }
                  
                  function clearCss(){
                    if (state.css.sheet) {
                      try {
                        const sheets = (document as any).adoptedStyleSheets || [];
                        (document as any).adoptedStyleSheets = sheets.filter((s: any) => s !== state.css.sheet);
                      } catch {}
                      state.css.sheet = null;
                    }
                    if (state.css.styleEl) { try { state.css.styleEl.remove(); } catch {} state.css.styleEl = null; }
                  }
                  
                  function clearJs(){
                    if (state.js.scriptEl) { try { state.js.scriptEl.remove(); } catch {} state.js.scriptEl = null; }
                    if (state.js.blobUrl) { try { URL.revokeObjectURL(state.js.blobUrl); } catch {} state.js.blobUrl = null; }
                    state.js.module = null;
                  }
                  
                  function rollback(){
                    // remove added nodes
                    state.logs.addedNodes.forEach((el: any) => {
                      try {
                        if (!el.isConnected) return;
                        if ((el as HTMLElement).id && (el as HTMLElement).id.startsWith(EXTENSION_PREFIX)) return;
                        const root = getExtensionRoot();
                        if (root && (el === root || root.contains(el))) return;
                        el.remove();
                      } catch {}
                    });
                    // restore attributes
                    for (let i = state.logs.attrChanges.length - 1; i >= 0; i--) {
                      const rec = state.logs.attrChanges[i];
                      try {
                        if (!rec.el || !rec.el.isConnected) continue;
                        if (rec.existed && rec.prev != null) rec.el.setAttribute(rec.name, rec.prev);
                        else rec.el.removeAttribute(rec.name);
                      } catch {}
                    }
                    // restore class
                    state.logs.classOriginals.forEach((cls: string, el: Element) => {
                      try { if ((el as any) && (el as any).isConnected) (el as HTMLElement).className = cls; } catch {}
                    });
                    // restore styles
                    for (let i = state.logs.styleChanges.length - 1; i >= 0; i--) {
                      const rec = state.logs.styleChanges[i];
                      try {
                        if (!rec.el || !rec.el.isConnected) continue;
                        if (rec.prev) (rec.el as HTMLElement).style.setProperty(rec.prop, rec.prev, rec.priority || '');
                        else (rec.el as HTMLElement).style.removeProperty(rec.prop);
                      } catch {}
                    }
                    // remove listeners
                    state.logs.listeners.forEach((l: any) => {
                      try { (l.target as any).removeEventListener(l.type, l.listener, l.options); } catch {}
                    });
                    // clear timers and rafs
                    state.logs.timers.forEach((t: any) => { try { t.kind === 'timeout' ? clearTimeout(t.id) : clearInterval(t.id); } catch {} });
                    state.logs.rafs.forEach((id: number) => { try { cancelAnimationFrame(id); } catch {} });
                    // disconnect observers
                    state.logs.observers.forEach((o: MutationObserver) => { try { o.disconnect(); } catch {} });
                    
                    // clear logs
                    state.logs.addedNodes.clear();
                    state.logs.attrChanges = [];
                    state.logs.styleChanges = [];
                    state.logs.classOriginals.clear();
                    state.logs.listeners = [];
                    state.logs.timers = [];
                    state.logs.rafs = [];
                    state.logs.observers = [];
                  }
                  
                  async function apply(cssCode: string, jsCode: string){
                    patchIfNeeded();
                    
                    // Capture enhanced baseline if not exists
                    if (!state.baselineSnapshot) {
                      captureEnhancedBaseline();
                    }
                    
                    // Set preview active flag
                    (window as any).__siteTopping_previewActive = true;
                    
                    // CSS
                    clearCss();
                    if (cssCode && cssCode.trim()) {
                      let scoped = applyCSSScoping(cssCode);
                      // Preserve CSS variables
                      scoped = preserveCSSVariables(scoped);
                      try {
                        if ('adoptedStyleSheets' in document && typeof (window as any).CSSStyleSheet !== 'undefined') {
                          const sheet = new (window as any).CSSStyleSheet();
                          await (sheet as any).replace(scoped);
                          const sheets = (document as any).adoptedStyleSheets || [];
                          (document as any).adoptedStyleSheets = [...sheets, sheet];
                          state.css.sheet = sheet;
                        } else {
                          const styleEl = document.createElement('style');
                          styleEl.id = `${EXTENSION_PREFIX}injected-css`;
                          styleEl.textContent = scoped;
                          document.head.appendChild(styleEl);
                          state.css.styleEl = styleEl;
                        }
                      } catch {
                        const styleEl = document.createElement('style');
                        styleEl.id = `${EXTENSION_PREFIX}injected-css`;
                        styleEl.textContent = scoped;
                        document.head.appendChild(styleEl);
                        state.css.styleEl = styleEl;
                      }
                    }
                    
                    // JS
                    clearJs();
                    if (jsCode && jsCode.trim()) {
                      try {
                        const blob = new Blob([jsCode], { type: 'text/javascript' });
                        const url = URL.createObjectURL(blob);
                        state.js.blobUrl = url;
                        const prev = state.guard; state.guard = true;
                        try {
                          state.js.module = await import(/* @vite-ignore */ url);
                        } finally {
                          state.guard = prev;
                        }
                      } catch (e) {
                        console.error('[Site Topping] JS 모듈 로드 실패:', e);
                      }
                    }
                    
                    // Reflow nudge
                    try { document.documentElement.offsetHeight; window.dispatchEvent(new Event('resize')); } catch {}
                  }
                  
                  async function update(cssCode: string, jsCode: string){
                    clearCss();
                    clearJs();
                    rollback();
                    await apply(cssCode, jsCode);
                    return { success: true };
                  }
                  
                  async function disable(){
                    // Clear preview active flag
                    (window as any).__siteTopping_previewActive = false;
                    
                    // Clean up enhanced event listeners
                    cleanupEnhancedEventListeners();
                    
                    clearCss();
                    clearJs();
                    
                    // Use intelligent restore strategy
                    if (state.baselineSnapshot && shouldUseGentleRestore()) {
                      performGentleRestore();
                    } else {
                      rollback();
                    }
                    
                    // Restore animations
                    restoreAnimationStates();
                    
                    // Restore scroll position
                    if (state.baselineSnapshot) {
                      window.scrollTo(state.baselineSnapshot.scrollX, state.baselineSnapshot.scrollY);
                    }
                    
                    unpatch();
                    
                    // Clear baseline for next session
                    state.baselineSnapshot = null;
                    
                    return { success: true, restored: true };
                  }
                  
                  function cleanupEnhancedEventListeners() {
                    try {
                      if ((window as any).__siteTopping_addedListeners) {
                        (window as any).__siteTopping_addedListeners.forEach((listeners: any[], element: any) => {
                          listeners.forEach((desc: any) => {
                            try {
                              element.removeEventListener(desc.type, desc.listener, desc.options);
                            } catch {}
                          });
                        });
                        (window as any).__siteTopping_addedListeners.clear();
                      }
                    } catch (e) {
                      console.warn('[Site Topping] Failed to cleanup enhanced event listeners:', e);
                    }
                  }
                  
                  function performGentleRestore() {
                    if (!state.baselineSnapshot) return;
                    
                    try {
                      // Remove elements that were added during preview
                      const addedElements = document.querySelectorAll('[data-site-topping-added]');
                      addedElements.forEach(el => el.remove());
                      
                      // Restore original attributes on modified elements
                      state.baselineSnapshot.elementAttributes.forEach((attrs: Map<string, string>, element: Element) => {
                        if (!element.isConnected) return;
                        
                        // Restore style attribute carefully
                        const originalStyle = attrs.get('style') || '';
                        if (element.getAttribute('style') !== originalStyle) {
                          if (originalStyle) {
                            element.setAttribute('style', originalStyle);
                          } else {
                            element.removeAttribute('style');
                          }
                        }
                        
                        // Restore class attribute
                        const originalClass = attrs.get('class') || '';
                        if (element.getAttribute('class') !== originalClass) {
                          if (originalClass) {
                            element.setAttribute('class', originalClass);
                          } else {
                            element.removeAttribute('class');
                          }
                        }
                        
                        // Restore other attributes
                        attrs.forEach((value, name) => {
                          if (name !== 'style' && name !== 'class') {
                            if (element.getAttribute(name) !== value) {
                              element.setAttribute(name, value);
                            }
                          }
                        });
                        
                        // Remove attributes that weren't in the original
                        const currentAttrs = new Set(Array.from(element.attributes).map(attr => attr.name));
                        const originalAttrs = new Set(attrs.keys());
                        
                        for (const attrName of currentAttrs) {
                          if (!originalAttrs.has(attrName) && !attrName.startsWith('data-site-topping')) {
                            element.removeAttribute(attrName);
                          }
                        }
                      });
                      
                      console.log('[Site Topping] Gentle restore completed');
                    } catch (e) {
                      console.warn('[Site Topping] Gentle restore failed, falling back to rollback:', e);
                      rollback();
                    }
                  }
                  
                  (window as any).__SiteToppingAPI = {
                    registerCleanup(fn: Function){
                      const arr = (state as any).cleanups || ((state as any).cleanups = []);
                      arr.push(fn);
                    },
                    withPreviewSource(fn: Function){
                      return function(this: any, ...args: any[]){
                        const prev = state.guard; state.guard = true;
                        try { return fn.apply(this, args); } finally { state.guard = prev; }
                      }
                    }
                  };
                  
                  return { apply, update, disable };
                })();
                
                // 메인 함수: 코드 적용
                (window as any).__siteTopping_applyCodeMainBranch = async function(cssCode: string, jsCode: string) {
                    if (isApplyingCode || isRestoringBaseline) {
                        console.warn('[Site Topping] 코드 적용 차단 - 다른 작업 진행 중');
                        return { success: false, error: '다른 작업 진행 중' };
                    }
                    
                    isApplyingCode = true;
                    
                    try {
                        try { window.postMessage({ type: 'SITE_TOPPING_PREVIEW_START' }, '*'); } catch {}
                        await __preview.update(cssCode || '', jsCode || '');
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
                (window as any).__siteTopping_disablePreviewMainBranch = async function() {
                    if (isApplyingCode) {
                        console.warn('[Site Topping] 프리뷰 비활성화 차단 - 코드 적용 진행 중');
                        setTimeout(() => (window as any).__siteTopping_disablePreviewMainBranch(), 150);
                        return { success: false, error: '코드 적용 진행 중' };
                    }
                    
                    try {
                        const result = await __preview.disable();
                        console.log('[WebPage] 메인 브랜치 방식 프리뷰 비활성화 완료');
                        return result;
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
    // MAIN world에서 eval 없이 Blob 모듈 import로 실행
    try {
        const [result] = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: async (jsCode: string) => {
                try {
                    // 우선 Blob ES Module import 시도
                    const blob = new Blob([jsCode], { type: 'text/javascript' });
                    const url = URL.createObjectURL(blob);
                    try {
                        await import(/* @vite-ignore */ url);
                        URL.revokeObjectURL(url);
                        return { success: true, method: 'import' };
                    } catch (e) {
                        URL.revokeObjectURL(url);
                        // 폴백: module script로 로드
                        const blob2 = new Blob([jsCode], { type: 'text/javascript' });
                        const url2 = URL.createObjectURL(blob2);
                        await new Promise<void>((resolve, reject) => {
                            const s = document.createElement('script');
                            s.type = 'module';
                            s.src = url2;
                            s.onload = () => { try { URL.revokeObjectURL(url2); } catch {} ; resolve(); };
                            s.onerror = (err) => { try { URL.revokeObjectURL(url2); } catch {} ; reject(err); };
                            document.head.appendChild(s);
                        });
                        return { success: true, method: 'script-module' };
                    }
                } catch (err) {
                    return { success: false, error: err instanceof Error ? err.message : 'Script execution failed' };
                }
            },
            args: [code]
        });
        
        return result?.result;
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
