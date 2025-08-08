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
  // CSS 규칙을 파싱하고 각 셀렉터에 :not(#site-topping-root *) 추가
  const lines = css.split('\n');
  const processedLines = lines.map(line => {
    const trimmed = line.trim();
    
    // CSS 규칙의 시작인지 확인 (중괄호가 있고, @규칙이 아니며, 주석이 아님)
    if (trimmed.includes('{') && !trimmed.startsWith('@') && !trimmed.startsWith('/*')) {
      const selectorPart = trimmed.substring(0, trimmed.indexOf('{')).trim();
      const rulePart = trimmed.substring(trimmed.indexOf('{'));
      
      // 여러 셀렉터가 쉼표로 구분되어 있을 수 있음
      const selectors = selectorPart.split(',').map(selector => {
        const cleanSelector = selector.trim();
        
        // 이미 스코핑이 적용되어 있거나 의사 셀렉터인 경우 건너뛰기
        if (cleanSelector.includes('#site-topping-root') || 
            cleanSelector.startsWith(':') || 
            cleanSelector === '*') {
          return cleanSelector;
        }
        
        // 익스텐션 컨테이너 제외 스코핑 추가
        return `${cleanSelector}:not(#site-topping-root):not(#site-topping-root *)`;
      });
      
      return `${selectors.join(', ')} ${rulePart}`;
    }
    
    return line;
  });
  
  return processedLines.join('\n');
}

async function applyJSCode(js: string): Promise<void> {
  try {
    // Content script에서는 background script를 통해 실행
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      try {
        // background script에 메시지 전송
        await chrome.runtime.sendMessage({
          type: 'EXECUTE_SCRIPT',
          code: js
        });
        
        console.log('[Site Topping] JavaScript execution requested via background script');
      } catch (runtimeError) {
        console.error('[Site Topping] Runtime message failed:', runtimeError);
        // fallback to other methods
        fallbackJSExecution(js);
      }
    } else {
      // 크롬 API가 없는 경우 fallback
      fallbackJSExecution(js);
    }
    
    // 추적을 위해 더미 스크립트 엘리먼트 생성
    const markerElement = document.createElement('script');
    markerElement.id = `${EXTENSION_PREFIX}injected-js-marker`;
    markerElement.type = 'text/plain';
    markerElement.dataset.applied = 'true';
    document.head.appendChild(markerElement);
    appliedCode.js = markerElement;
    
  } catch (error) {
    console.error('[Site Topping] Failed to inject JavaScript:', error);
  }
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