const EXTENSION_PREFIX = 'site-topping-';

interface AppliedCode {
  css?: HTMLStyleElement;
  js?: HTMLScriptElement;
}

let appliedCode: AppliedCode = {};

export async function applyCodeToPage(css: string, js: string): Promise<void> {
  removeCodeFromPage();

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
  // CSS 규칙을 정규식으로 파싱
  const cssRuleRegex = /([^{}]+)\{([^{}]*)\}/g;
  let scopedCSS = css;
  
  // 전체 CSS를 래핑하여 익스텐션 영역 제외
  const wrappedCSS = `
    /* Site Topping: 익스텐션 영역 제외 스타일 */
    :not(#site-topping-root):not(#site-topping-root *) {
      /* CSS 초기화 방지 */
    }
    
    /* 사용자 CSS (스코핑 적용) */
    ${scopedCSS.replace(cssRuleRegex, (_match, selectorsPart, propertiesPart) => {
      const selectors = selectorsPart.split(',').map((selector: string) => {
        const trimmedSelector = selector.trim();
        
        // 스킵할 셀렉터들
        if (shouldSkipSelector(trimmedSelector)) {
          return trimmedSelector;
        }
        
        // 스코핑 적용
        return applyScopeToSelector(trimmedSelector);
      });
      
      return `${selectors.join(', ')} { ${propertiesPart} }`;
    })}
  `;
  
  return wrappedCSS;
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
          
          window.__siteTopping_messageListener = true;
          window.addEventListener('message', function(event) {
            if (event.source === window && event.data.type === 'SITE_TOPPING_EXECUTE') {
              try {
                
                eval(event.data.code);
              } catch (e) {
                console.error('[Page Context] Execution error:', e);
              }
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