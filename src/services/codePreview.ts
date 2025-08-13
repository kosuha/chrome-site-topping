const EXTENSION_PREFIX = 'site-topping-';

interface AppliedCode {
  css?: HTMLStyleElement;
  js?: HTMLScriptElement;
}

let appliedCode: AppliedCode = {};

// Enhanced snapshot for complete restoration
interface BaselineSnapshot {
  bodyHTML: string;
  scrollX: number;
  scrollY: number;
  headSigs: string[]; // signatures of initial <head> children to clean extras later
  computedStyles: Map<Element, CSSStyleDeclaration>; // original computed styles of modified elements
  eventListeners: Map<Element, EventDescriptor[]>; // original event listeners
  elementAttributes: Map<Element, Map<string, string>>; // original attributes
}

interface EventDescriptor {
  type: string;
  listener: EventListener;
  options?: boolean | AddEventListenerOptions;
}

let baselineSnapshot: BaselineSnapshot | null = null;
let isRestoringBaseline = false;
let modifiedElements: Set<Element> = new Set();
let originalEventListeners: Map<Element, EventDescriptor[]> = new Map();

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
    
    // Capture computed styles of key elements that might be modified
    const computedStyles = new Map<Element, CSSStyleDeclaration>();
    const keyElements = document.querySelectorAll('body, html, [style], [class], [id]');
    keyElements.forEach(el => {
      if (el.id !== 'site-topping-root' && !el.closest('#site-topping-root')) {
        computedStyles.set(el, window.getComputedStyle(el));
      }
    });
    
    // Capture element attributes
    const elementAttributes = new Map<Element, Map<string, string>>();
    document.querySelectorAll('*').forEach(el => {
      if (el.id !== 'site-topping-root' && !el.closest('#site-topping-root')) {
        const attrs = new Map<string, string>();
        for (const attr of el.attributes) {
          attrs.set(attr.name, attr.value);
        }
        if (attrs.size > 0) {
          elementAttributes.set(el, attrs);
        }
      }
    });

    baselineSnapshot = {
      bodyHTML: (clone as HTMLElement).innerHTML,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      headSigs,
      computedStyles,
      eventListeners: new Map(),
      elementAttributes,
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
    
    // Clear JavaScript timers and cleanup
    cleanupJavaScriptEffects();

    const root = getExtensionRoot();

    // Use gentler restoration approach to preserve animations
    if (shouldUseGentleRestore()) {
      performGentleRestore(root);
    } else {
      performFullRestore(root);
    }

    // Restore scroll position
    window.scrollTo(baselineSnapshot.scrollX, baselineSnapshot.scrollY);
    
    // Trigger animation restoration
    restoreAnimationStates();
    
    // Clear tracking sets
    modifiedElements.clear();
    originalEventListeners.clear();
    
  } catch (e) {
    console.warn('[Site Topping] Failed to restore baseline snapshot:', e);
  } finally {
    isRestoringBaseline = false;
  }
}

function shouldUseGentleRestore(): boolean {
  // Check if page has active animations or complex interactions
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

function performGentleRestore(_root: HTMLElement | null): void {
  // Gentle restore: only remove added elements and restore modified attributes
  // This preserves existing DOM structure and event bindings
  
  // Remove elements that were added during preview
  const addedElements = document.querySelectorAll('[data-site-topping-added]');
  addedElements.forEach(el => el.remove());
  
  // Restore original attributes on modified elements
  baselineSnapshot!.elementAttributes.forEach((attrs, element) => {
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
}

function performFullRestore(root: HTMLElement | null): void {
  // Full restore: completely rebuild DOM (fallback for complex cases)
  if (!baselineSnapshot) return;
  
  if (!root) {
    // No root found; safe to reset whole body
    document.body.innerHTML = baselineSnapshot.bodyHTML;
    restoreElementStates();
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
    
    // Restore element states after DOM reconstruction
    restoreElementStates();
  }
}

function restoreElementStates(): void {
  if (!baselineSnapshot) return;
  
  try {
    // Restore element attributes (for full restore mode)
    baselineSnapshot.elementAttributes.forEach((attrs, element) => {
      if (!element.isConnected) return;
      
      // Remove attributes that weren't in the original
      const currentAttrs = new Set(Array.from(element.attributes).map(attr => attr.name));
      const originalAttrs = new Set(attrs.keys());
      
      for (const attrName of currentAttrs) {
        if (!originalAttrs.has(attrName) && !attrName.startsWith('data-site-topping')) {
          element.removeAttribute(attrName);
        }
      }
      
      // Restore original attribute values
      attrs.forEach((value, name) => {
        if (element.getAttribute(name) !== value) {
          element.setAttribute(name, value);
        }
      });
    });
    
  } catch (e) {
    console.warn('[Site Topping] Failed to restore element states:', e);
  }
}

function restoreAnimationStates(): void {
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
        // Re-initialize any intersection observers or other APIs
        window.dispatchEvent(new Event('resize'));
      } catch {}
    }, 50);
    
  } catch (e) {
    console.warn('[Site Topping] Failed to restore animation states:', e);
  }
}

function cleanupJavaScriptEffects(): void {
  // Notify page context to clean up timers and effects
  try {
    window.postMessage({ type: 'SITE_TOPPING_PREVIEW_STOP' }, '*');
  } catch (e) {
    console.warn('[Site Topping] Failed to notify page context:', e);
  }
  
  // Additional cleanup for any remaining timers
  setTimeout(() => {
    try {
      window.postMessage({ type: 'SITE_TOPPING_FORCE_CLEANUP' }, '*');
    } catch {}
  }, 100);
}

let previewObserver: MutationObserver | null = null;
let previewAddedNodes: Set<Element> = new Set();
let modifiedElementsTracker: Map<Element, { originalAttributes: Map<string, string>, originalStyles: string }> = new Map();

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
      if (rec.type === 'childList') {
        rec.addedNodes.forEach((n) => {
          if (n.nodeType !== Node.ELEMENT_NODE) return;
          const el = n as Element;
          if (shouldIgnoreAddedElement(el)) return;
          // Mark added elements for easier cleanup
          (el as HTMLElement).setAttribute('data-site-topping-added', 'true');
          previewAddedNodes.add(el);
        });
      } else if (rec.type === 'attributes') {
        const el = rec.target as Element;
        if (shouldIgnoreAddedElement(el)) return;
        
        // Track attribute modifications for gentle restore
        if (!modifiedElementsTracker.has(el) && baselineSnapshot) {
          const originalAttrs = baselineSnapshot.elementAttributes.get(el);
          if (originalAttrs) {
            modifiedElementsTracker.set(el, {
              originalAttributes: originalAttrs,
              originalStyles: originalAttrs.get('style') || ''
            });
          }
        }
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
    modifiedElementsTracker.clear();
  }
}

function cleanupExtensionCodeOnly(): void {
  // 1. Remove extension-applied CSS/JS elements
  removeCodeFromPage();
  
  // 2. Clean head elements not in baseline (extension-added)
  cleanupHeadExtras();
  
  // 3. Clean up tracked elements from previous preview session
  stopPreviewObserverAndCleanup();
  
  // 4. Notify page context to clean up timers/listeners
  cleanupJavaScriptEffects();
  
  // Note: We don't call restoreBaseline() here to preserve user-created elements
}

export async function applyCodeToPage(css: string, js: string): Promise<void> {
  // Ensure we have a clean baseline of the page for future full restore
  captureBaselineIfNeeded();
  
  // Clean only extension code, preserve user-created elements
  cleanupExtensionCodeOnly();
  
  // Start tracking nodes added during this preview session
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
  
  // CSS에 익스텐션 컨테이너를 제외하는 스코핑 및 애니메이션 보존 로직 추가
  const scopedCSS = addCSSScoping(css);
  
  // CSS 변수와 커스텀 프로퍼티 보존
  const finalCSS = preserveCSSVariables(scopedCSS);
  
  styleElement.textContent = finalCSS;
  
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
  
  // 전역 셀렉터 특별 처리 - 애니메이션 보존을 위해 더 정교한 스코핑
  if (trimmed === '*' || trimmed === 'html' || trimmed === 'body') {
    return `${trimmed}:not(#site-topping-root):not(#site-topping-root *)`;
  }
  
  // CSS 애니메이션과 트랜지션 관련 셀렉터는 더 신중하게 처리
  if (isAnimationSelector(trimmed)) {
    return `${trimmed}:not(#site-topping-root *)`;
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

function isAnimationSelector(selector: string): boolean {
  // 애니메이션, 트랜지션, 호버 등 인터랙션 관련 셀렉터 감지
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
  // CSS 변수와 커스텀 프로퍼티를 :root에서도 사용할 수 있도록 보존
  const lines = css.split('\n');
  const processedLines = lines.map(line => {
    // CSS 변수 정의를 전역으로 유지
    if (line.trim().startsWith('--') || line.includes('var(--')) {
      return line;
    }
    return line;
  });
  
  return processedLines.join('\n');
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
          
          // Enhanced timer patching with event listener preservation
          (function() {
            if (window.__siteTopping_timerPatched) return;
            window.__siteTopping_timerPatched = true;
            window.__siteTopping_previewActive = true;
            window.__siteTopping_timeoutIds = [];
            window.__siteTopping_intervalIds = [];
            window.__siteTopping_rafIds = [];
            window.__siteTopping_originalListeners = new Map();
            window.__siteTopping_addedListeners = new Map();
            
            const _setTimeout = window.setTimeout;
            const _setInterval = window.setInterval;
            const _raf = window.requestAnimationFrame;
            const _clearTimeout = window.clearTimeout;
            const _clearInterval = window.clearInterval;
            const _cancelAnimationFrame = window.cancelAnimationFrame || (window as any).webkitCancelAnimationFrame;
            const _addEventListener = Element.prototype.addEventListener;
            const _removeEventListener = Element.prototype.removeEventListener;
            
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
            
            // Track event listeners added during preview
            Element.prototype.addEventListener = function(type, listener, options) {
              if (window.__siteTopping_previewActive) {
                const key = this;
                if (!window.__siteTopping_addedListeners.has(key)) {
                  window.__siteTopping_addedListeners.set(key, []);
                }
                window.__siteTopping_addedListeners.get(key).push({ type, listener, options });
              }
              return _addEventListener.call(this, type, listener, options);
            };
            
            Element.prototype.removeEventListener = function(type, listener, options) {
              return _removeEventListener.call(this, type, listener, options);
            };
            
            window.__siteTopping_clearPreviewTimers = function() {
              try { (window.__siteTopping_timeoutIds||[]).forEach(function(id){ _clearTimeout(id); }); } catch {}
              try { (window.__siteTopping_intervalIds||[]).forEach(function(id){ _clearInterval(id); }); } catch {}
              try { (window.__siteTopping_rafIds||[]).forEach(function(id){ if (_cancelAnimationFrame) _cancelAnimationFrame(id); }); } catch {}
              window.__siteTopping_timeoutIds = [];
              window.__siteTopping_intervalIds = [];
              window.__siteTopping_rafIds = [];
            };
            
            window.__siteTopping_cleanupEventListeners = function() {
              // Remove event listeners added during preview
              try {
                window.__siteTopping_addedListeners.forEach(function(listeners, element) {
                  listeners.forEach(function(desc) {
                    try {
                      _removeEventListener.call(element, desc.type, desc.listener, desc.options);
                    } catch {}
                  });
                });
                window.__siteTopping_addedListeners.clear();
              } catch {}
            };
            
            window.__siteTopping_restoreEventListeners = function() {
              // Restore addEventListener and removeEventListener
              Element.prototype.addEventListener = _addEventListener;
              Element.prototype.removeEventListener = _removeEventListener;
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
                if (typeof window.__siteTopping_cleanupEventListeners === 'function') {
                  window.__siteTopping_cleanupEventListeners();
                }
                return;
              }
              if (data.type === 'SITE_TOPPING_FORCE_CLEANUP') {
                // Force cleanup and restore original methods
                if (typeof window.__siteTopping_clearPreviewTimers === 'function') {
                  window.__siteTopping_clearPreviewTimers();
                }
                if (typeof window.__siteTopping_cleanupEventListeners === 'function') {
                  window.__siteTopping_cleanupEventListeners();
                }
                if (typeof window.__siteTopping_restoreEventListeners === 'function') {
                  window.__siteTopping_restoreEventListeners();
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
  markerElement.setAttribute('data-type', 'text/plain');
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