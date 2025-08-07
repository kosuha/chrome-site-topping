const EXTENSION_PREFIX = 'site-topping-';

interface AppliedCode {
  css?: HTMLStyleElement;
  js?: HTMLScriptElement;
}

let appliedCode: AppliedCode = {};

export function applyCodeToPage(css: string, js: string): void {
  removeCodeFromPage();

  if (css.trim()) {
    applyCSSCode(css);
  }

  if (js.trim()) {
    applyJSCode(js);
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

function applyJSCode(js: string): void {
  try {
    const scriptElement = document.createElement('script');
    scriptElement.id = `${EXTENSION_PREFIX}injected-js`;
    scriptElement.type = 'text/javascript';
    
    const wrappedJS = `
(function() {
  try {
    ${js}
  } catch (error) {
    console.error('[Site Topping] JavaScript execution error:', error);
  }
})();
`;
    
    scriptElement.textContent = wrappedJS;
    document.head.appendChild(scriptElement);
    appliedCode.js = scriptElement;
  } catch (error) {
    console.error('[Site Topping] Failed to inject JavaScript:', error);
  }
}

export function isCodeApplied(): boolean {
  return !!(appliedCode.css || appliedCode.js);
}