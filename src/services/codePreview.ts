const EXTENSION_PREFIX = 'site-topping-';

interface AppliedCode {
  css?: HTMLStyleElement;
  js?: HTMLScriptElement;
}

let appliedCode: AppliedCode = {};

// Baseline snapshot for full-body restore between previews
interface BaselineSnapshot {
  bodyHTML: string;
  scrollX: number;
  scrollY: number;
  headSigs: string[]; // signatures of initial <head> children to clean extras later
}

let baselineSnapshot: BaselineSnapshot | null = null;
let isRestoringBaseline = false;

function getExtensionRoot(): HTMLElement | null {
  return document.getElementById('site-topping-root');
}

function captureBaselineIfNeeded(): void {
  if (baselineSnapshot) return;
  try {
    // Clone body and exclude extension root to avoid unmounting our UI
    const clone = document.body.cloneNode(true) as HTMLElement;
    const extInClone = (clone.querySelector('#site-topping-root') as HTMLElement) || null;
    if (extInClone) extInClone.remove();

    const headSigs = Array.from(document.head.children).map((el) => (el as HTMLElement).outerHTML);

    baselineSnapshot = {
      bodyHTML: (clone as HTMLElement).innerHTML,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      headSigs,
    };
  } catch (e) {
    console.warn('[Site Topping] Failed to capture baseline snapshot:', e);
  }
}

function cleanupHeadExtras(): void {
  if (!baselineSnapshot) return;
  try {
    const baselineSet = new Set(baselineSnapshot.headSigs);
    Array.from(document.head.children).forEach((el) => {
      const id = (el as HTMLElement).id || '';
      if (id.startsWith(EXTENSION_PREFIX)) return; // keep our own markers/styles
      const sig = (el as HTMLElement).outerHTML;
      if (!baselineSet.has(sig)) {
        try { el.remove(); } catch {}
      }
    });
  } catch (e) {
    console.warn('[Site Topping] Failed to cleanup head extras:', e);
  }
}

function restoreBaseline(): void {
  if (!baselineSnapshot || isRestoringBaseline) return;
  isRestoringBaseline = true;
  try {
    // Remove previously injected artifacts from our extension
    removeCodeFromPage();

    const root = getExtensionRoot();

    if (!root) {
      // No root found; safe to reset whole body
      document.body.innerHTML = baselineSnapshot.bodyHTML;
    } else {
      // Ensure root stays alive: make it a direct child of body if not already
      if (root.parentElement !== document.body) {
        document.body.appendChild(root);
      }
      // Keep our root mounted; replace other top-level nodes only
      const children = Array.from(document.body.childNodes);
      for (const node of children) {
        if (node !== root) node.parentNode?.removeChild(node);
      }
      const tpl = document.createElement('template');
      tpl.innerHTML = baselineSnapshot.bodyHTML;
      // Insert restored baseline content before the root so root stays last (overlay)
      document.body.insertBefore(tpl.content, root);
    }

    // Restore scroll position
    window.scrollTo(baselineSnapshot.scrollX, baselineSnapshot.scrollY);
  } catch (e) {
    console.warn('[Site Topping] Failed to restore baseline snapshot:', e);
  } finally {
    isRestoringBaseline = false;
  }
}

let previewObserver: MutationObserver | null = null;
let previewAddedNodes: Set<Element> = new Set();

function shouldIgnoreAddedElement(el: Element): boolean {
  if (el.id && el.id.startsWith(EXTENSION_PREFIX)) return true;
  const root = getExtensionRoot();
  if (root && (el === root || root.contains(el))) return true;
  return false;
}

function startPreviewObserver(): void {
  // Reset previous tracking if any
  stopPreviewObserverAndCleanup();

  previewObserver = new MutationObserver((records) => {
    for (const rec of records) {
      if (rec.type !== 'childList') continue;
      rec.addedNodes.forEach((n) => {
        if (n.nodeType !== Node.ELEMENT_NODE) return;
        const el = n as Element;
        if (shouldIgnoreAddedElement(el)) return;
        previewAddedNodes.add(el);
      });
    }
  });

  try {
    previewObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  } catch (e) {
    console.warn('[Site Topping] Failed to start preview observer:', e);
  }
}

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

export async function applyCodeToPage(css: string, js: string): Promise<void> {
  // Ensure we have a clean baseline of the page, then restore to it before applying new code
  captureBaselineIfNeeded();
  // Clean any previous preview artifacts tracked via observer
  stopPreviewObserverAndCleanup();
  // Also clean any stray head elements not in baseline
  cleanupHeadExtras();
  restoreBaseline();
  // Start tracking nodes added during this preview session (to clean head/others on disable)
  startPreviewObserver();
  // Notify page context that a new preview session starts
  try { window.postMessage({ type: 'SITE_TOPPING_PREVIEW_START' }, '*'); } catch {}

  if (css.trim()) {
    applyCSSCode(css);
  }

  if (js.trim()) {
    await applyJSCode(js);
  }
}

export function removeCodeFromPage(): void {
  if (appliedCode.css) {
    appliedCode.css.remove();
    appliedCode.css = undefined;
  }

  if (appliedCode.js) {
    appliedCode.js.remove();
    appliedCode.js = undefined;
  }
}

function applyCSSCode(css: string): void {
  const styleElement = document.createElement('style');
  styleElement.id = `${EXTENSION_PREFIX}injected-css`;
  
  // CSS에 익스텐션 컨테이너를 제외하는 스코핑 추가
  const scopedCSS = addCSSScoping(css);
  styleElement.textContent = scopedCSS;
  
  document.head.appendChild(styleElement);
  appliedCode.css = styleElement;
}

function addCSSScoping(css: string): string {
  // 더 강력한 CSS 파싱과 스코핑
  try {
    return parseAndScopeCSS(css);
  } catch (error) {
    console.error('[Site Topping] CSS scoping failed, applying basic protection:', error);
    return applyBasicCSSProtection(css);
  }
}

function parseAndScopeCSS(css: string): string {
  // CSSOM 기반 파싱으로 @keyframes 등 보존, 일반 규칙만 스코핑
  try {
    return scopeCSSWithCSSOM(css);
  } catch (e) {
    console.warn('[Site Topping] CSSOM scoping failed, fallback to regex scoping:', e);
  }

  // Fallback: 기존 정규식 스코핑(복잡한 @규칙은 그대로 두거나 깨질 수 있음)
  const cssRuleRegex = /([^{}]+)\{([^{}]*)\}/g;
  let scopedCSS = css;
  const wrappedCSS = `
    ${scopedCSS.replace(cssRuleRegex, (_match, selectorsPart, propertiesPart) => {
      const selectors = selectorsPart.split(',').map((selector: string) => {
        const trimmedSelector = selector.trim();
        if (shouldSkipSelector(trimmedSelector)) {
          return trimmedSelector;
        }
        return applyScopeToSelector(trimmedSelector);
      });
      return `${selectors.join(', ')} { ${propertiesPart} }`;
    })}
  `;
  return wrappedCSS;
}

function scopeCSSWithCSSOM(css: string): string {
  const tmp = document.createElement('style');
  // media="not all"로 페이지 적용 방지
  (tmp as any).media = 'not all';
  tmp.textContent = css;
  document.head.appendChild(tmp);

  try {
    const sheet = tmp.sheet as CSSStyleSheet | null;
    if (!sheet) throw new Error('No CSSStyleSheet parsed');

    const processRules = (rules: CSSRuleList): string => {
      let out = '';
      for (let i = 0; i < rules.length; i++) {
        const rule = rules[i] as CSSRule & { cssRules?: CSSRuleList; conditionText?: string };
        switch (rule.type) {
          case CSSRule.STYLE_RULE: {
            const r = rule as unknown as CSSStyleRule;
            const scopedSelectors = r.selectorText
              .split(',')
              .map(s => applyScopeToSelector(s.trim()))
              .join(', ');
            out += `${scopedSelectors} { ${r.style.cssText} }\n`;
            break;
          }
          case CSSRule.MEDIA_RULE: {
            const mr = rule as unknown as CSSMediaRule;
            const inner = processRules(mr.cssRules);
            out += `@media ${mr.conditionText} {\n${inner}}\n`;
            break;
          }
          case CSSRule.SUPPORTS_RULE: {
            const sr = rule as any; // CSSSupportsRule
            const inner = processRules(sr.cssRules as CSSRuleList);
            out += `@supports ${sr.conditionText} {\n${inner}}\n`;
            break;
          }
          default: {
            // @keyframes, @font-face, @property 등은 그대로 유지
            out += `${rule.cssText}\n`;
            break;
          }
        }
      }
      return out;
    };

    const result = processRules(sheet.cssRules);
    return result;
  } finally {
    tmp.remove();
  }
}

function shouldSkipSelector(selector: string): boolean {
  // 이미 스코핑된 셀렉터
  if (selector.includes('#site-topping-root')) return true;
  
  // @규칙들 (keyframes, media 등)
  if (selector.startsWith('@')) return true;
  
  // 주석
  if (selector.includes('/*') || selector.includes('*/')) return true;
  
  // 의사 선택자만 있는 경우
  if (selector.startsWith(':') && !selector.includes(' ')) return true;
  
  return false;
}

function applyScopeToSelector(selector: string): string {
  // 복잡한 셀렉터 처리를 위한 개선된 로직
  const trimmed = selector.trim();
  
  // 전역 셀렉터 특별 처리
  if (trimmed === '*' || trimmed === 'html' || trimmed === 'body') {
    return `${trimmed}:not(#site-topping-root):not(#site-topping-root *)`;
  }
  
  // 복합 셀렉터 처리 (공백, >, +, ~ 등)
  const combinatorRegex = /(\s+|>|\+|~)/;
  const parts = trimmed.split(combinatorRegex);
  
  if (parts.length > 1) {
    // 첫 번째 부분에만 스코핑 적용
    const firstPart = parts[0].trim();
    if (firstPart && !shouldSkipSelector(firstPart)) {
      parts[0] = `${firstPart}:not(#site-topping-root):not(#site-topping-root *)`;
    }
    return parts.join('');
  }
  
  // 단순 셀렉터
  return `${trimmed}:not(#site-topping-root):not(#site-topping-root *)`;
}

function applyBasicCSSProtection(css: string): string {
  // 파싱 실패 시 기본 보호
  return `
    /* Site Topping: 기본 보호 모드 */
    ${css}
    
    /* 익스텐션 영역 스타일 우선순위 보장 */
    #site-topping-root,
    #site-topping-root * {
      all: revert !important;
    }
    
    #site-topping-root {
      position: fixed !important;
      top: 0 !important;
      right: 0 !important;
      z-index: 2147483647 !important;
      width: auto !important;
      height: 100vh !important;
      max-width: none !important;
      max-height: none !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      background: none !important;
      box-shadow: none !important;
      transform: none !important;
      opacity: 1 !important;
      visibility: visible !important;
      display: block !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      font-size: 14px !important;
      line-height: 1.4 !important;
      color: #333 !important;
      pointer-events: auto !important;
    }
  `;
}

async function applyJSCode(js: string): Promise<void> {
  try {
    // Content script에서는 background script를 통해 실행 (가장 강력한 방법)
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'EXECUTE_SCRIPT',
          code: js
        });
        
        
        
        if (response && response.success) {
          // 성공적으로 실행됨
          createExecutionMarker();
          return;
        }
      } catch (runtimeError) {
        console.error('[Site Topping] Background script execution failed:', runtimeError);
      }
    }
    
    // Background script 실행이 실패하거나 불가능한 경우 Content Script에서 직접 시도
    
    await contentScriptExecution(js);
    createExecutionMarker();
    
  } catch (error) {
    console.error('[Site Topping] All JavaScript execution methods failed:', error);
  }
}

async function contentScriptExecution(js: string): Promise<void> {
  // Method 1: Window postMessage를 통한 실행 (페이지 컨텍스트로 전달)
  try {
    // 페이지에 리스너 설치 (한 번만)
    if (!(window as any).__siteTopping_pageListener) {
      const script = document.createElement('script');
      script.textContent = `
        (function() {
          if (window.__siteTopping_messageListener) return;
          
          // Patch timers to allow cleanup on preview stop
          (function() {
            if (window.__siteTopping_timerPatched) return;
            window.__siteTopping_timerPatched = true;
            window.__siteTopping_previewActive = true;
            window.__siteTopping_timeoutIds = [];
            window.__siteTopping_intervalIds = [];
            window.__siteTopping_rafIds = [];
            const _setTimeout = window.setTimeout;
            const _setInterval = window.setInterval;
            const _raf = window.requestAnimationFrame;
            const _clearTimeout = window.clearTimeout;
            const _clearInterval = window.clearInterval;
            const _cancelAnimationFrame = window.cancelAnimationFrame || (window as any).webkitCancelAnimationFrame;
            window.setTimeout = function(cb, t) {
              const id = _setTimeout(cb, t);
              try { window.__siteTopping_timeoutIds.push(id); } catch {}
              return id;
            } as any;
            window.setInterval = function(cb, t) {
              const id = _setInterval(cb, t);
              try { window.__siteTopping_intervalIds.push(id); } catch {}
              return id;
            } as any;
            window.requestAnimationFrame = function(cb) {
              const id = _raf(cb);
              try { window.__siteTopping_rafIds.push(id); } catch {}
              return id;
            } as any;
            window.__siteTopping_clearPreviewTimers = function() {
              try { (window.__siteTopping_timeoutIds||[]).forEach(function(id){ _clearTimeout(id); }); } catch {}
              try { (window.__siteTopping_intervalIds||[]).forEach(function(id){ _clearInterval(id); }); } catch {}
              try { (window.__siteTopping_rafIds||[]).forEach(function(id){ if (_cancelAnimationFrame) _cancelAnimationFrame(id); }); } catch {}
              window.__siteTopping_timeoutIds = [];
              window.__siteTopping_intervalIds = [];
              window.__siteTopping_rafIds = [];
            };
          })();
          
          window.__siteTopping_messageListener = true;
          window.addEventListener('message', function(event) {
            if (event.source !== window || !event.data) return;
            var data = event.data;
            try {
              if (data.type === 'SITE_TOPPING_PREVIEW_START') {
                window.__siteTopping_previewActive = true;
                return;
              }
              if (data.type === 'SITE_TOPPING_PREVIEW_STOP') {
                window.__siteTopping_previewActive = false;
                if (typeof window.__siteTopping_clearPreviewTimers === 'function') {
                  window.__siteTopping_clearPreviewTimers();
                }
                return;
              }
              if (data.type === 'SITE_TOPPING_EXECUTE') {
                // Execute user code
                eval(data.code);
                return;
              }
            } catch (e) {
              console.error('[Page Context] Execution error:', e);
            }
          });
        })();
      `;
      document.head.appendChild(script);
      script.remove();
      (window as any).__siteTopping_pageListener = true;
    }
    
    // 메시지 전송
    window.postMessage({
      type: 'SITE_TOPPING_EXECUTE',
      code: js
    }, '*');
    
    
    return;
  } catch (postMessageError) {
    console.error('[Site Topping] postMessage method failed:', postMessageError);
  }
  
  // Method 2: 개선된 fallback 방법들
  await advancedFallbackExecution(js);
}

async function advancedFallbackExecution(js: string): Promise<void> {
  // Method 1: Web Worker를 통한 실행 (일부 CSP 우회 가능)
  try {
    const workerCode = `
      self.onmessage = function(e) {
        try {
          eval(e.data);
          self.postMessage({ success: true });
        } catch (error) {
          self.postMessage({ success: false, error: error.message });
        }
      };
    `;
    
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));
    
    return new Promise((resolve) => {
      worker.onmessage = (_: MessageEvent) => {

        worker.terminate();
        resolve();
      };
      
      worker.onerror = () => {
        worker.terminate();
        resolve();
      };
      
      worker.postMessage(js);
      
      // 타임아웃 설정
      setTimeout(() => {
        worker.terminate();
        resolve();
      }, 5000);
    });
  } catch (workerError) {
    console.error('[Site Topping] Web Worker method failed:', workerError);
    
    // 기존 fallback 방법들 시도
    fallbackJSExecution(js);
  }
}

function createExecutionMarker(): void {
  // 추적을 위해 더미 스크립트 엘리먼트 생성
  const markerElement = document.createElement('script');
  markerElement.id = `${EXTENSION_PREFIX}injected-js-marker`;
  markerElement.type = 'text/plain';
  markerElement.dataset.applied = 'true';
  markerElement.dataset.timestamp = Date.now().toString();
  document.head.appendChild(markerElement);
  appliedCode.js = markerElement;
}

// Fallback methods for JS execution
function fallbackJSExecution(js: string): void {
  // Method 1: Blob URL 방식
  try {
    const blob = new Blob([js], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => URL.revokeObjectURL(url);
    document.head.appendChild(script);
    return;
  } catch (blobError) {
    console.warn('[Site Topping] Blob URL method failed:', blobError);
  }

  // Method 2: Data URL 방식
  try {
    const dataUrl = `data:application/javascript;base64,${btoa(js)}`;
    const script = document.createElement('script');
    script.src = dataUrl;
    document.head.appendChild(script);
    return;
  } catch (dataUrlError) {
    console.warn('[Site Topping] Data URL method failed:', dataUrlError);
  }

  // Method 3: Function 생성자 (이미 실패했지만 다시 시도)
  try {
    const func = new Function(js);
    func();
  } catch (error) {
    console.warn('[Site Topping] All JavaScript execution methods failed. CSP is too restrictive.');
  }
}

export function isCodeApplied(): boolean {
  return !!(appliedCode.css || appliedCode.js);
}

export function disablePreview(): void {
  // Restore to the existing baseline only; do not recapture a new baseline
  captureBaselineIfNeeded();
  // Tell page context to stop and clear timers
  try { window.postMessage({ type: 'SITE_TOPPING_PREVIEW_STOP' }, '*'); } catch {}
  // Remove nodes added during preview (head/body outside our root)
  stopPreviewObserverAndCleanup();
  // Additional safety: remove head children not present in baseline
  cleanupHeadExtras();
  restoreBaseline();
}