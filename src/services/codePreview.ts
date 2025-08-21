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
let isApplyingCode = false;
let modifiedElements: Set<Element> = new Set();
let originalEventListeners: Map<Element, EventDescriptor[]> = new Map();

// Bridge readiness flag to decide local fallback tracking
let pageBridgeReady = false;

function getExtensionRoot(): HTMLElement | null {
  return document.getElementById('site-topping-root');
}

function captureBaselineIfNeeded(): void {
  if (baselineSnapshot) return;
  try {
    // 문서 준비 상태 확인 (로드 완료 전에는 캡처 보류)
    if (document.readyState !== 'complete') {
      window.addEventListener('load', () => {
        setTimeout(() => {
          try { captureBaselineIfNeeded(); } catch {}
        }, 100);
      }, { once: true });
      return;
    }

    // DOM 내용이 너무 빈약하면(SSR 스켈레톤/로딩 상태) 잠시 후 재시도
    const bodyHTML = document.body.innerHTML.trim();
    if (bodyHTML.length < 200) {
      setTimeout(() => {
        try { captureBaselineIfNeeded(); } catch {}
      }, 300);
      return;
    }

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
    console.log('[Site Topping] Baseline captured (size:', baselineSnapshot.bodyHTML.length, ')');
  } catch (e) {
    console.warn('[Site Topping] Failed to capture baseline snapshot:', e);
  }
}

function cleanupHeadExtras(): void {
  // 기존: baselineSnapshot과 비교해 head의 추가 요소들을 제거했으나,
  // 사이트가 동적으로 삽입한 style/link 등이 제거되어 애니메이션/스타일이 깨질 수 있음.
  // 변경: 확장프로그램이 삽입한 것으로 확실히 식별 가능한 요소만 정리.
  try {
    Array.from(document.head.children).forEach((el) => {
      const he = el as HTMLElement;
      const id = he.id || '';
      const isOurEl = id.startsWith(EXTENSION_PREFIX) || he.hasAttribute('data-site-topping');
      if (isOurEl) {
        try { he.remove(); } catch {}
      }
    });
  } catch (e) {
    console.warn('[Site Topping] Failed to cleanup head extras:', e);
  }
}

export function restoreBaseline(forceFull: boolean = false): void {
  if (!baselineSnapshot || isRestoringBaseline) return;
  isRestoringBaseline = true;
  try {
    // Remove previously injected artifacts from our extension
    removeCodeFromPage();
    
    // Clear JavaScript timers and cleanup
    cleanupJavaScriptEffects();

    const root = getExtensionRoot();

    const hasValidBaseline = !!baselineSnapshot && baselineSnapshot.bodyHTML.trim().length > 0;

    // If forceFull is requested, skip gentle path
    if (forceFull && hasValidBaseline) {
      performFullRestore(root);
    } else {
      // Use gentler restoration approach to preserve animations
      if (!hasValidBaseline || shouldUseGentleRestore()) {
        performGentleRestore(root);
      } else {
        performFullRestore(root);
      }
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
        void htmlEl.offsetHeight; // Force reflow by reading property
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
// Track text mutations and text nodes added during preview to revert operations like `innerHTML += '0'`
let previewAddedTextNodes: Set<Text> = new Set();
let previewModifiedTextNodes: Map<Text, string> = new Map();

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
          if (n.nodeType === Node.ELEMENT_NODE) {
            const el = n as Element;
            if (shouldIgnoreAddedElement(el)) return;
            // 브리지 사용 시 DOM 추가에 대한 복구는 브리지에 위임
            // 로컬 폴백 모드에서는 텍스트 노드만 추적
          } else if (n.nodeType === Node.TEXT_NODE) {
            if (!pageBridgeReady) {
              try { previewAddedTextNodes.add(n as Text); } catch {}
            }
          }
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
      } else if (rec.type === 'characterData') {
        // 로컬 폴백 모드에서만 텍스트 변경을 추적
        if (!pageBridgeReady) {
          try {
            const txt = rec.target as Text;
            if (txt && rec.oldValue !== null && !previewModifiedTextNodes.has(txt)) {
              previewModifiedTextNodes.set(txt, rec.oldValue);
            }
          } catch {}
        }
      }
    }
  });

  try {
    previewObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'data-*'],
      characterData: true,
      characterDataOldValue: true,
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
    // 이전에는 추적된 추가 노드를 DOM에서 제거했으나,
    // 사이트 고유 동작까지 사라지는 문제가 있어 제거 로직을 중단합니다.
  } finally {
    previewAddedNodes.clear();
    modifiedElementsTracker.clear();
    previewAddedTextNodes.clear();
    previewModifiedTextNodes.clear();
  }
}

function revertDOMChangesFromPreview(): void {
  try {
    // 브리지가 없을 때만 로컬 텍스트 변경 복구 수행 (중복 누적 방지)
    if (!pageBridgeReady) {
      // Revert modified text nodes first
      previewModifiedTextNodes.forEach((oldVal, txt) => {
        try {
          if (!txt || !(txt as CharacterData).isConnected) return;
          (txt as CharacterData).data = oldVal;
        } catch {}
      });
      previewModifiedTextNodes.clear();

      // Remove text nodes added during preview
      previewAddedTextNodes.forEach((txt) => {
        try {
          if (!txt || !txt.parentNode) return;
          txt.parentNode.removeChild(txt);
        } catch {}
      });
      previewAddedTextNodes.clear();
    }

    // 1) 프리뷰 동안 변경된 속성 되돌리기
    modifiedElementsTracker.forEach((info, el) => {
      try {
        if (!el || !(el as Element).isConnected) return;
        const originalAttrs = info.originalAttributes;

        // 존재하지 않았던 속성 제거(data-site-topping* 제외)
        Array.from((el as Element).attributes).forEach((attr) => {
          const name = attr.name;
          if (!originalAttrs.has(name) && !name.startsWith('data-site-topping')) {
            (el as Element).removeAttribute(name);
          }
        });

        // 원래 값으로 복구
        originalAttrs.forEach((value, name) => {
          const current = (el as Element).getAttribute(name);
          if (current !== value) {
            if ((name === 'style' || name === 'class') && value === '') {
              (el as Element).removeAttribute(name);
            } else {
              (el as Element).setAttribute(name, value);
            }
          }
        });
      } catch {}
    });
  } catch (e) {
    console.warn('[Site Topping] Failed to revert DOM changes from preview:', e);
  }
}

// 매 재적용 전에, 프리뷰를 끄고 다시 켠 것과 동일한 강제 초기화/복구 수행
async function fullResetForReapply(): Promise<void> {
  try {
    // 프리뷰를 완전히 껐다가 다시 켜는 것과 동일하게 처리
    disablePreview();
    // DOM 안정화 대기
    await new Promise(resolve => setTimeout(resolve, 80));
    // 브리지 준비 상태는 리셋 후 다시 판단
    pageBridgeReady = false;
  } catch (e) {
    console.warn('[Site Topping] fullResetForReapply error:', e);
  }
}

export async function applyCodeToPage(css: string, js: string): Promise<void> {
  // 중복 실행 방지 - 이미 적용 중이거나 복구 중이면 대기
  if (isApplyingCode || isRestoringBaseline) {
    console.warn('[Site Topping] Code application blocked - another operation in progress');
    return;
  }
  
  isApplyingCode = true;
  
  try {
    // Ensure we have a clean baseline of the page for future full restore
    captureBaselineIfNeeded();

    // 프리뷰를 끄고 다시 켠 것과 동일한 강제 초기화/복구를 먼저 수행
    await fullResetForReapply();

    // 페이지 브리지 준비 확인 (로컬 추적 여부 결정)
    try {
      installPageMessageBridgeIfNeeded();
      pageBridgeReady = await waitForBridgeReady(250);
    } catch { pageBridgeReady = false; }
    
    // Start tracking nodes added during this preview session
    startPreviewObserver();
    
    // Notify page context that a new preview session starts
    try { window.postMessage({ type: 'SITE_TOPPING_PREVIEW_START' }, '*'); } catch {}

    // CSS와 JS 모두 비어있지 않을 때만 적용
    if (css.trim()) {
      applyCSSCode(css);
    }

    if (js.trim()) {
      await applyJSCode(js);
    }
  } finally {
    isApplyingCode = false;
  }
}

export function removeCodeFromPage(): void {
  // 확장프로그램이 생성한 모든 style 및 script 요소 제거
  const extensionStyles = document.querySelectorAll(`style[id^="${EXTENSION_PREFIX}"], style[data-site-topping]`);
  extensionStyles.forEach(el => {
    try {
      el.remove();
    } catch {}
  });

  const extensionScripts = document.querySelectorAll(`script[id^="${EXTENSION_PREFIX}"], script[data-site-topping]`);
  extensionScripts.forEach(el => {
    try {
      el.remove();
    } catch {}
  });

  // appliedCode 객체 초기화
  if (appliedCode.css) {
    try {
      appliedCode.css.remove();
    } catch {}
    appliedCode.css = undefined;
  }

  if (appliedCode.js) {
    try {
      appliedCode.js.remove();
    } catch {}
    appliedCode.js = undefined;
  }
}

function applyCSSCode(css: string): void {
  // 기존 CSS 스타일 요소가 남아있다면 제거 (중복 방지)
  const existingStyle = document.getElementById(`${EXTENSION_PREFIX}injected-css`);
  if (existingStyle) {
    existingStyle.remove();
  }

  const styleElement = document.createElement('style');
  styleElement.id = `${EXTENSION_PREFIX}injected-css`;
  styleElement.setAttribute('data-site-topping', 'true');
  
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
    console.log('[Site Topping] Attempting to execute JavaScript:', js);

    // 1) 페이지 브리지를 설치하고 준비 여부 확인(PING/PONG)
    installPageMessageBridgeIfNeeded();
    const bridgeReady = await waitForBridgeReady(250);
    if (bridgeReady) {
      console.log('[Site Topping] Page bridge ready, executing via postMessage');
      await contentScriptExecution(js);
      return;
    } else {
      console.warn('[Site Topping] Page bridge not ready, falling back');
    }

    // 2) 브리지가 실패한 경우에만 백그라운드 경로 시도
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      try {
        console.log('[Site Topping] Trying background script execution...');
        const response = await chrome.runtime.sendMessage({
          type: 'EXECUTE_SCRIPT',
          code: js
        });
        console.log('[Site Topping] Background script response:', response);
        if (response && response.success) {
          console.log('[Site Topping] JavaScript executed successfully via background script');
          return;
        } else {
          console.warn('[Site Topping] Background script execution failed or returned unsuccessful response');
        }
      } catch (runtimeError) {
        console.error('[Site Topping] Background script execution failed:', runtimeError);
      }
    }

    // 3) 최후의 수단: 폴백 실행
    console.log('[Site Topping] Falling back to inline execution methods...');
    fallbackJSExecution(js);
  } catch (error) {
    console.error('[Site Topping] All JavaScript execution methods failed:', error);
  }
}

function waitForBridgeReady(timeout = 250): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const handler = (event: MessageEvent) => {
      try {
        if (event.source !== window || !event.data) return;
        if (event.data.type === 'SITE_TOPPING_PONG') {
          settled = true;
          window.removeEventListener('message', handler as any);
          resolve(true);
        }
      } catch {}
    };
    window.addEventListener('message', handler as any);
    try { window.postMessage({ type: 'SITE_TOPPING_PING' }, '*'); } catch {}
    setTimeout(() => {
      if (!settled) {
        window.removeEventListener('message', handler as any);
        resolve(false);
      }
    }, timeout);
  });
}

async function contentScriptExecution(js: string): Promise<void> {
  console.log('[Site Topping] Starting content script execution methods...');
  
  // Method 1: Window postMessage를 통한 실행 (페이지 컨텍스트로 전달)
  try {
    console.log('[Site Topping] Trying postMessage method...');
    
    // 페이지에 리스너 설치 (한 번만)
    installPageMessageBridgeIfNeeded();
    
    // 메시지 전송
    console.log('[Site Topping] Sending postMessage to execute JavaScript...');
    window.postMessage({
      type: 'SITE_TOPPING_EXECUTE',
      code: js
    }, '*');
    
    console.log('[Site Topping] PostMessage method completed');
    return;
  } catch (postMessageError) {
    console.error('[Site Topping] postMessage method failed:', postMessageError);
  }
  
  // Method 2: 개선된 fallback 방법들
  // await advancedFallbackExecution(js); // 참조 문제 회피
  fallbackJSExecution(js);
  return;
}

function installPageMessageBridgeIfNeeded(): void {
  try {
    const script = document.createElement('script');
    script.textContent = `
      (function() {
        if (window.__siteTopping_messageListener) return;
        
        (function() {
          if (window.__siteTopping_timerPatched) return;
          window.__siteTopping_timerPatched = true;
          window.__siteTopping_previewActive = true;
          window.__siteTopping_inUserCode = false;
          
          window.__siteTopping_timeoutIds = [];
          window.__siteTopping_intervalIds = [];
          window.__siteTopping_rafIds = [];
          window.__siteTopping_addedNodes = new Set();
          window.__siteTopping_modifiedTexts = new Map();
          window.__siteTopping_innerHTMLBackup = new Map();
          window.__siteTopping_addedListeners = new Map();
          
          const _setTimeout = window.setTimeout;
          const _setInterval = window.setInterval;
          const _raf = window.requestAnimationFrame;
          const _clearTimeout = window.clearTimeout;
          const _clearInterval = window.clearInterval;
          const _cancelAnimationFrame = window.cancelAnimationFrame || (window as any).webkitCancelAnimationFrame;
          const _addEventListener = Element.prototype.addEventListener;
          const _removeEventListener = Element.prototype.removeEventListener;
          const _appendChild = Node.prototype.appendChild;
          const _insertBefore = Node.prototype.insertBefore;
          const _replaceChild = Node.prototype.replaceChild;
          const _removeChild = Node.prototype.removeChild;
          const _insertAdjacentHTML = Element.prototype.insertAdjacentHTML;
          
          const innerHTMLDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
          const textContentDesc = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
          const nodeValueDesc = Object.getOwnPropertyDescriptor(CharacterData.prototype, 'nodeValue');
          
          function shouldTrackNode(node) {
            try {
              if (!node) return false;
              if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as any;
                if (el.id && el.id.startsWith('site-topping-')) return false;
                if (el.closest && el.closest('#site-topping-root')) return false;
              }
              return true;
            } catch { return false; }
          }
          function trackAdded(node) {
            try {
              if (!window.__siteTopping_previewActive || !window.__siteTopping_inUserCode) return;
              if (!shouldTrackNode(node)) return;
              window.__siteTopping_addedNodes.add(node);
            } catch {}
          }
          function backupInnerHTML(el) {
            try {
              if (!window.__siteTopping_previewActive || !window.__siteTopping_inUserCode) return;
              if (!el || window.__siteTopping_innerHTMLBackup.has(el)) return;
              if (el.closest && el.closest('#site-topping-root')) return;
              if (innerHTMLDesc && innerHTMLDesc.get) {
                const old = innerHTMLDesc.get.call(el);
                window.__siteTopping_innerHTMLBackup.set(el, old);
              }
            } catch {}
          }
          function backupTextNode(textNode) {
            try {
              if (!window.__siteTopping_previewActive || !window.__siteTopping_inUserCode) return;
              if (!textNode || window.__siteTopping_modifiedTexts.has(textNode)) return;
              window.__siteTopping_modifiedTexts.set(textNode, textNode.data);
            } catch {}
          }
          
          window.setTimeout = function(cb, t) {
            const wrapped = function() {
              try { window.__siteTopping_inUserCode = true; return cb.apply(this, arguments as any); }
              finally { window.__siteTopping_inUserCode = false; }
            } as any;
            const id = _setTimeout(wrapped, t as any);
            try { if (window.__siteTopping_previewActive) (window.__siteTopping_timeoutIds as any[]).push(id as any); } catch {}
            return id as any;
          } as any;
          window.setInterval = function(cb, t) {
            const wrapped = function() {
              try { window.__siteTopping_inUserCode = true; return cb.apply(this, arguments as any); }
              finally { window.__siteTopping_inUserCode = false; }
            } as any;
            const id = _setInterval(wrapped, t as any);
            try { if (window.__siteTopping_previewActive) (window.__siteTopping_intervalIds as any[]).push(id as any); } catch {}
            return id as any;
          } as any;
          window.requestAnimationFrame = function(cb) {
            const wrapped = function(ts) {
              try { window.__siteTopping_inUserCode = true; return (cb as any).call(this, ts); }
              finally { window.__siteTopping_inUserCode = false; }
            } as any;
            const id = _raf(wrapped as any);
            try { if (window.__siteTopping_previewActive) (window.__siteTopping_rafIds as any[]).push(id as any); } catch {}
            return id as any;
          } as any;
          
          Node.prototype.appendChild = function(child) {
            const res = _appendChild.call(this, child);
            trackAdded(child);
            return res;
          };
          Node.prototype.insertBefore = function(newNode, referenceNode) {
            const res = _insertBefore.call(this, newNode, referenceNode);
            trackAdded(newNode);
            return res;
          };
          Node.prototype.replaceChild = function(newChild, oldChild) {
            const res = _replaceChild.call(this, newChild, oldChild);
            trackAdded(newChild);
            return res;
          };
          Node.prototype.removeChild = function(child) {
            return _removeChild.call(this, child);
          };
          Element.prototype.insertAdjacentHTML = function(position, text) {
            backupInnerHTML(this);
            return _insertAdjacentHTML.call(this, position, text);
          };
          if (innerHTMLDesc && innerHTMLDesc.set && innerHTMLDesc.get) {
            Object.defineProperty(Element.prototype, 'innerHTML', {
              configurable: true,
              get: innerHTMLDesc.get,
              set: function(v) {
                backupInnerHTML(this);
                return innerHTMLDesc.set.call(this, v);
              }
            });
          }
          if (textContentDesc && textContentDesc.set) {
            Object.defineProperty(Node.prototype, 'textContent', {
              configurable: true,
              get: textContentDesc.get,
              set: function(v) {
                if (this && this.nodeType === Node.TEXT_NODE) backupTextNode(this as any);
                return textContentDesc.set.call(this, v);
              }
            });
          }
          if (nodeValueDesc && nodeValueDesc.set) {
            Object.defineProperty(CharacterData.prototype, 'nodeValue', {
              configurable: true,
              get: nodeValueDesc.get,
              set: function(v) {
                backupTextNode(this as any);
                return nodeValueDesc.set.call(this, v);
              }
            });
          }
          
          (window as any).__siteTopping_clearPreviewTimers = function() {
            try { (window.__siteTopping_timeoutIds||[]).forEach(function(id){ _clearTimeout(id as any); }); } catch {}
            try { (window.__siteTopping_intervalIds||[]).forEach(function(id){ _clearInterval(id as any); }); } catch {}
            try { (window.__siteTopping_rafIds||[]).forEach(function(id){ if (_cancelAnimationFrame) _cancelAnimationFrame(id as any); }); } catch {}
            (window as any).__siteTopping_timeoutIds = [];
            (window as any).__siteTopping_intervalIds = [];
            (window as any).__siteTopping_rafIds = [];
          };
          (window as any).__siteTopping_cleanupEventListeners = function() {
            try {
              if (!(window as any).__siteTopping_addedListeners) return;
              (window as any).__siteTopping_addedListeners.forEach(function(listeners, element) {
                listeners.forEach(function(desc) {
                  try { _removeEventListener.call(element, desc.type, desc.listener, desc.options); } catch {}
                });
              });
              (window as any).__siteTopping_addedListeners.clear();
            } catch {}
          };
          (window as any).__siteTopping_restoreEventListeners = function() {
            Element.prototype.addEventListener = _addEventListener;
            Element.prototype.removeEventListener = _removeEventListener;
          };
          (window as any).__siteTopping_revertDOM = function() {
            try {
              (window as any).__siteTopping_innerHTMLBackup.forEach(function(oldHTML, el) {
                try {
                  if (!el || !(el as any).isConnected) return;
                  if ((el as any).closest && (el as any).closest('#site-topping-root')) return;
                  (el as any).innerHTML = oldHTML;
                } catch {}
              });
              (window as any).__siteTopping_innerHTMLBackup.clear();
              (window as any).__siteTopping_modifiedTexts.forEach(function(oldVal, txt) {
                try { if (!txt || !(txt as any).isConnected) return; (txt as any).data = oldVal; } catch {}
              });
              (window as any).__siteTopping_modifiedTexts.clear();
              Array.from((window as any).__siteTopping_addedNodes || []).forEach(function(n:any){
                try {
                  if (!n || !(n as any).isConnected) return;
                  if ((n as any).closest && (n as any).closest('#site-topping-root')) return;
                  (n as any).parentNode && (n as any).parentNode.removeChild(n);
                } catch {}
              });
              (window as any).__siteTopping_addedNodes.clear();
            } catch {}
          };
        })();
        
        window.__siteTopping_messageListener = true;
        window.addEventListener('message', function(event) {
          if (event.source !== window || !event.data) return;
          var data = event.data;
          try {
            if (data.type === 'SITE_TOPPING_PREVIEW_START') {
              window.__siteTopping_previewActive = true; return;
            }
            if (data.type === 'SITE_TOPPING_PREVIEW_STOP') {
              window.__siteTopping_previewActive = false;
              if (typeof (window as any).__siteTopping_clearPreviewTimers === 'function') (window as any).__siteTopping_clearPreviewTimers();
              if (typeof (window as any).__siteTopping_cleanupEventListeners === 'function') (window as any).__siteTopping_cleanupEventListeners();
              if (typeof (window as any).__siteTopping_revertDOM === 'function') (window as any).__siteTopping_revertDOM();
              return;
            }
            if (data.type === 'SITE_TOPPING_FORCE_CLEANUP') {
              if (typeof (window as any).__siteTopping_clearPreviewTimers === 'function') (window as any).__siteTopping_clearPreviewTimers();
              if (typeof (window as any).__siteTopping_cleanupEventListeners === 'function') (window as any).__siteTopping_cleanupEventListeners();
              if (typeof (window as any).__siteTopping_restoreEventListeners === 'function') (window as any).__siteTopping_restoreEventListeners();
              if (typeof (window as any).__siteTopping_revertDOM === 'function') (window as any).__siteTopping_revertDOM();
              return;
            }
            if (data.type === 'SITE_TOPPING_PING') {
              window.postMessage({ type: 'SITE_TOPPING_PONG' }, '*');
              return;
            }
            if (data.type === 'SITE_TOPPING_EXECUTE') {
              try {
                window.__siteTopping_inUserCode = true;
                try { (new Function(data.code))(); }
                finally { window.__siteTopping_inUserCode = false; }
              } catch (e) {
                try {
                  window.__siteTopping_inUserCode = true;
                  try {
                    const s = document.createElement('script');
                    s.textContent = data.code;
                    document.head.appendChild(s);
                    document.head.removeChild(s);
                  } finally { window.__siteTopping_inUserCode = false; }
                } catch {}
              }
              return;
            }
          } catch (e) {}
        });
      })();
    `;
    document.head.appendChild(script);
    script.remove();
  } catch {}
}

function fallbackJSExecution(js: string): void {
  try {
    const blob = new Blob([js], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => URL.revokeObjectURL(url);
    document.head.appendChild(script);
    return;
  } catch {}
  try {
    const dataUrl = `data:application/javascript;base64,${btoa(js)}`;
    const script = document.createElement('script');
    script.src = dataUrl;
    document.head.appendChild(script);
    return;
  } catch {}
  try { (new Function(js))(); } catch {}
}

function cleanupInlineStyles(): void {
  try {
    const modifiedElements = document.querySelectorAll('[data-site-topping-modified], [data-site-topping-added]');
    modifiedElements.forEach(element => {
      if (element.hasAttribute('data-site-topping-added')) {
        try { element.remove(); } catch {}
        return;
      }
      const originalStyle = element.getAttribute('data-original-style');
      if (originalStyle !== null) {
        if (originalStyle === '') {
          (element as HTMLElement).removeAttribute('style');
        } else {
          (element as HTMLElement).setAttribute('style', originalStyle);
        }
        (element as HTMLElement).removeAttribute('data-original-style');
        (element as HTMLElement).removeAttribute('data-site-topping-modified');
      }
    });
    document.body.offsetHeight;
  } catch (e) {
    console.warn('[Site Topping] Failed to cleanup inline styles:', e);
  }
}

// 완전한 원상복구를 수행하는 공개 API
export function disablePreview(): void {
  try {
    // 1) 페이지 컨텍스트에 정리 신호 전송
    try { window.postMessage({ type: 'SITE_TOPPING_PREVIEW_STOP' }, '*'); } catch {}
    try { window.postMessage({ type: 'SITE_TOPPING_FORCE_CLEANUP' }, '*'); } catch {}

    // 2) 프리뷰 중 추적된 변경사항 되돌리기 (베이스라인이 없을 경우 대비)
    revertDOMChangesFromPreview();

    // 3) 확장 주입물 정리 및 헤드 정리
    removeCodeFromPage();
    cleanupHeadExtras();

    // 4) 옵저버 중지 및 트래킹 정리
    stopPreviewObserverAndCleanup();

    // 5) JS 효과 및 인라인 스타일 정리
    cleanupJavaScriptEffects();
    cleanupInlineStyles();

    // 6) 베이스라인으로 완전 복구 시도 (가능하면 강제 전체 복구)
    restoreBaseline(true);

    // 7) 약간의 안정화 처리
    document.body.offsetHeight;
    setTimeout(() => { try { window.dispatchEvent(new Event('resize')); } catch {} }, 50);
  } catch (e) {
    console.warn('[Site Topping] disablePreview failed:', e);
  }
}