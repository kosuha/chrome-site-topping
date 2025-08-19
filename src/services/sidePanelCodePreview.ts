import { useSidePanelMessage } from '../hooks/useSidePanelMessage';

// Side Panel용 코드 미리보기 서비스
export class SidePanelCodePreviewService {
  private currentCSS: string = '';
  private currentJS: string = '';
  private isApplied: boolean = false;
  private sendMessage: ReturnType<typeof useSidePanelMessage>['sendMessageToActiveTab'];

  constructor(sendMessage: ReturnType<typeof useSidePanelMessage>['sendMessageToActiveTab']) {
    this.sendMessage = sendMessage;
  }

  async applyCode(css: string, js: string): Promise<boolean> {
    try {
      const prevHadJS = this.currentJS.trim().length > 0;
      const newHasJS = js.trim().length > 0;

      // JS에서 CSS-only로 전환되는 경우: 완전한 베이스라인 복구 후 적용
      if (prevHadJS && !newHasJS) {
        const restore = await this.sendMessage({ type: 'DISABLE_PREVIEW' });
        if (!restore.success) {
          console.error('[SidePanel] Baseline restoration before CSS-only apply failed:', restore.error);
          return false;
        }
        // content 쪽 복원이 setTimeout으로 지연 수행되므로 잠시 대기
        await new Promise((r) => setTimeout(r, 200));
      }

      // CSS와 JavaScript를 함께 적용 (JavaScript가 있을 때 베이스라인 복원을 위해)
      const result = await this.sendMessage({
        type: 'APPLY_CODE',
        css: this.addCSSScoping(css),
        js: js
      });
      
      if (!result.success) {
        console.error('[SidePanel] Code application failed:', result.error);
        return false;
      }

      this.currentCSS = css;
      this.currentJS = js;
      this.isApplied = true;
      return true;
    } catch (error) {
      console.error('[SidePanel] Code application failed:', error);
      return false;
    }
  }

  async removeCode(): Promise<boolean> {
    try {
      console.log('[SidePanel] Removing code and restoring page state');
      
      // 프리뷰 끄기는 항상 완전한 베이스라인 복원 수행
      const result = await this.sendMessage({ type: 'DISABLE_PREVIEW' });
      
      if (!result.success) {
        console.error('[SidePanel] Baseline restoration failed:', result.error);
        return false;
      }
      
      this.currentCSS = '';
      this.currentJS = '';
      this.isApplied = false;
      
      return true;
    } catch (error) {
      console.error('[SidePanel] Code removal failed:', error);
      return false;
    }
  }

  private addCSSScoping(css: string): string {
    try {
      // CSS 규칙 파싱 및 스코핑
      const cssRuleRegex = /([^{}]+)\{([^{}]*)\}/g;
      
      return css.replace(cssRuleRegex, (_, selectorsPart, propertiesPart) => {
        const selectors = selectorsPart.split(',').map((selector: string) => {
          const trimmed = selector.trim();
          
          // 특별한 경우들 처리
          if (this.shouldSkipSelector(trimmed)) {
            return trimmed;
          }
          
          return this.applyScopeToSelector(trimmed);
        });
        
        return `${selectors.join(', ')} { ${propertiesPart} }`;
      });
    } catch (error) {
      console.error('[SidePanel] CSS scoping failed:', error);
      return css; // 실패 시 원본 반환
    }
  }

  private shouldSkipSelector(selector: string): boolean {
    // @규칙들 (keyframes, media 등)
    if (selector.startsWith('@')) return true;
    
    // 주석
    if (selector.includes('/*') || selector.includes('*/')) return true;
    
    // 의사 선택자만 있는 경우
    if (selector.startsWith(':') && !selector.includes(' ')) return true;
    
    return false;
  }

  private applyScopeToSelector(selector: string): string {
    const trimmed = selector.trim();
    
    // 전역 셀렉터 특별 처리
    if (trimmed === '*' || trimmed === 'html' || trimmed === 'body') {
      return `${trimmed}:not(.chrome-extension-side-panel):not(.chrome-extension-side-panel *)`;
    }
    
    // 복합 셀렉터 처리 (공백, >, +, ~ 등)
    const combinatorRegex = /(\s+|>|\+|~)/;
    const parts = trimmed.split(combinatorRegex);
    
    if (parts.length > 1) {
      // 첫 번째 부분에만 스코핑 적용
      const firstPart = parts[0].trim();
      if (firstPart && !this.shouldSkipSelector(firstPart)) {
        parts[0] = `${firstPart}:not(.chrome-extension-side-panel):not(.chrome-extension-side-panel *)`;
      }
      return parts.join('');
    }
    
    // 단순 셀렉터
    return `${trimmed}:not(.chrome-extension-side-panel):not(.chrome-extension-side-panel *)`;
  }

  getCurrentCSS(): string {
    return this.currentCSS;
  }

  getCurrentJS(): string {
    return this.currentJS;
  }

  isCodeApplied(): boolean {
    return this.isApplied;
  }
}

// 싱글톤 인스턴스를 위한 팩토리 함수
let codePreviewService: SidePanelCodePreviewService | null = null;

export function createSidePanelCodePreviewService(
  sendMessage: ReturnType<typeof useSidePanelMessage>['sendMessageToActiveTab']
): SidePanelCodePreviewService {
  if (!codePreviewService) {
    codePreviewService = new SidePanelCodePreviewService(sendMessage);
  }
  return codePreviewService;
}