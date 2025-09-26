/**
 * 스냅샷 기반 코드 프리뷰 시스템
 * DOM 전체 스냅샷을 캡처하고 사용자 코드 적용 후 완전한 복원을 제공합니다.
 */

export interface DOMSnapshot {
  /** 전체 DOM의 스냅샷 (documentElement.outerHTML) */
  fullSnapshot: string;
  /** 변경된 요소들의 원본 상태 (요소 경로 -> 원본 HTML) */
  changedElements: Map<string, string>;
  /** 삽입된 CSS 요소의 ID */
  cssElementId?: string;
  /** JS 추적을 위한 고유 ID */
  jsTrackingId?: string;
  /** 스냅샷 생성 시점의 타임스탬프 */
  timestamp: number;
  /** 스냅샷 생성 시점의 URL */
  url: string;
  /** 현재 스크롤 위치 */
  scrollPosition: { x: number; y: number };
}

/**
 * 요소의 고유 경로를 생성합니다.
 */
function getElementPath(element: Element): string {
  const path: string[] = [];
  let current: Element | null = element;
  
  while (current && current !== document.documentElement) {
    let selector = current.tagName.toLowerCase();
    
    // ID가 있으면 사용
    if (current.id) {
      selector += `#${current.id}`;
      path.unshift(selector);
      break;
    }
    
    // 클래스가 있으면 사용
    if (current.className && typeof current.className === 'string') {
      const classes = current.className.trim().split(/\s+/).slice(0, 3); // 최대 3개 클래스만
      if (classes.length > 0 && classes[0]) {
        selector += '.' + classes.join('.');
      }
    }
    
    // 같은 부모 내에서의 순서
    if (current.parentElement) {
      const siblings = Array.from(current.parentElement.children).filter(
        child => child.tagName === current!.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }
    
    path.unshift(selector);
    current = current.parentElement;
  }
  
  return path.join(' > ');
}

/**
 * 스냅샷 기반 프리뷰 서비스
 */
class SnapshotPreviewService {
  private currentSnapshot: DOMSnapshot | null = null;
  private mutationObserver: MutationObserver | null = null;
  private appliedCSSElement: HTMLStyleElement | null = null;
  private isTracking: boolean = false;
  private jsTrackingId: string | null = null;

  /**
   * DOM 스냅샷을 생성합니다.
   */
  async createSnapshot(): Promise<DOMSnapshot> {
    try {
      
      const snapshot: DOMSnapshot = {
        fullSnapshot: document.documentElement.outerHTML,
        changedElements: new Map(),
        timestamp: Date.now(),
        url: window.location.href,
        scrollPosition: {
          x: window.scrollX,
          y: window.scrollY
        }
      };

      this.currentSnapshot = snapshot;
      
      return snapshot;
    } catch (error) {
      console.error('[SnapshotPreview] 스냅샷 생성 실패:', error);
      throw new Error(`스냅샷 생성 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * MutationObserver를 시작하여 DOM 변경사항을 추적합니다.
   */
  private startTracking() {
    if (this.isTracking || !this.currentSnapshot) return;

    
    this.mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        // 추가된 노드들 추적
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            // Site Topping 관련 요소가 아닌 경우에만 추적
            if (!this.isSiteToppingElement(element)) {
              const path = getElementPath(element);
              if (path && !this.currentSnapshot?.changedElements.has(path)) {
                // 새로 추가된 요소의 부모를 원본에서 가져와 저장
                this.trackElementChange(element.parentElement);
              }
            }
          }
        });

        // 제거된 노드들 추적
        mutation.removedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            if (!this.isSiteToppingElement(element)) {
              // 제거된 요소의 부모를 추적
              this.trackElementChange(mutation.target as Element);
            }
          }
        });

        // 속성 변경 추적
        if (mutation.type === 'attributes' && mutation.target.nodeType === Node.ELEMENT_NODE) {
          const element = mutation.target as Element;
          if (!this.isSiteToppingElement(element)) {
            this.trackElementChange(element);
          }
        }
      });
    });

    this.mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      characterData: true,
      characterDataOldValue: true
    });

    this.isTracking = true;
  }

  /**
   * Site Topping이 생성한 요소인지 확인합니다.
   */
  private isSiteToppingElement(element: Element): boolean {
    return element.hasAttribute('data-site-topping') ||
           element.id === 'site-topping-style' ||
           element.className?.includes('site-topping') ||
           element.id?.includes('site-topping');
  }

  /**
   * 요소의 변경사항을 추적합니다.
   */
  private trackElementChange(element: Element | null) {
    if (!element || !this.currentSnapshot) return;

    const path = getElementPath(element);
    if (path && !this.currentSnapshot.changedElements.has(path)) {
      // 스냅샷에서 해당 요소의 원본 상태 찾아서 저장
      const parser = new DOMParser();
      const doc = parser.parseFromString(this.currentSnapshot.fullSnapshot, 'text/html');
      const originalElement = this.findElementInSnapshot(doc, path);
      
      if (originalElement) {
        this.currentSnapshot.changedElements.set(path, originalElement.outerHTML);
      }
    }
  }

  /**
   * 스냅샷 DOM에서 경로에 해당하는 요소를 찾습니다.
   */
  private findElementInSnapshot(doc: Document, path: string): Element | null {
    try {
      return doc.querySelector(path);
    } catch (error) {
      console.warn('[SnapshotPreview] 요소 경로 검색 실패:', path, error);
      return null;
    }
  }

  /**
   * MutationObserver를 중지합니다.
   */
  private stopTracking() {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
    this.isTracking = false;
  }

  /**
   * 사용자 코드를 적용하고 변경사항을 추적합니다.
   */
  async applyCodeWithTracking(css: string, js: string): Promise<void> {
    if (!this.currentSnapshot) {
      throw new Error('스냅샷이 생성되지 않았습니다. createSnapshot()을 먼저 호출하세요.');
    }

    try {

      // 변경 추적 시작
      this.startTracking();

      // CSS 적용
      if (css && css.trim()) {
        await this.applyCSSCode(css);
      }

      // JavaScript 적용
      if (js && js.trim()) {
        await this.applyJSCode(js);
      }

    } catch (error) {
      console.error('[SnapshotPreview] 코드 적용 실패:', error);
      throw error;
    }
  }

  /**
   * CSS 코드를 적용합니다.
   */
  private async applyCSSCode(css: string) {
    // 익스텐션 UI 보호를 위한 스코핑 적용
    const scopedCSS = this.addCSSScoping(css);

    let styleElement = document.getElementById('site-topping-style') as HTMLStyleElement;
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = 'site-topping-style';
      styleElement.setAttribute('data-site-topping', 'style');
      document.head.appendChild(styleElement);
    }

    styleElement.textContent = scopedCSS;
    this.appliedCSSElement = styleElement;
    this.currentSnapshot!.cssElementId = styleElement.id;

  }

  /**
   * JavaScript 코드를 적용합니다.
   */
  private async applyJSCode(js: string) {
    // 기존 JS 효과 정리
    await this.cleanupJSEffects();

    // 고유 추적 ID 생성
    this.jsTrackingId = `site-topping-js-${Date.now()}`;
    this.currentSnapshot!.jsTrackingId = this.jsTrackingId;

    const wrapper = `
(() => {
  try {
    // 사용자 코드에서 클린업 함수를 등록할 수 있도록 지원
    const trackingId = ${JSON.stringify(this.jsTrackingId)};
    
    // 클린업 함수 등록 헬퍼
    window.__siteTopping_registerCleanup = window.__siteTopping_registerCleanup || function(fn) {
      if (typeof fn === 'function') {
        window.__siteToppingCleanups = window.__siteToppingCleanups || [];
        window.__siteToppingCleanups.push(fn);
      }
    };
    
    // 사용자 코드 실행
    ${js}
  } catch (e) {
    console.error('[Site Topping] 사용자 코드 실행 오류:', e);
  }
})();`;

    const script = document.createElement('script');
    script.setAttribute('data-site-topping', 'script');
    script.setAttribute('data-tracking-id', this.jsTrackingId);
    script.textContent = wrapper;
    document.documentElement.appendChild(script);

    // 실행 후 스크립트 태그 제거 (효과는 유지)
    setTimeout(() => {
      try {
        script.remove();
      } catch (e) {
        console.warn('[SnapshotPreview] 스크립트 태그 제거 실패:', e);
      }
    }, 0);

  }

  /**
   * 기존 JS 효과들을 정리합니다.
   */
  private async cleanupJSEffects() {
    try {
      const g = window as any;
      
      // 사용자 정의 클린업 함수들 실행
      if (Array.isArray(g.__siteToppingCleanups)) {
        g.__siteToppingCleanups.forEach((fn: any) => {
          try {
            if (typeof fn === 'function') fn();
          } catch (e) {
            console.warn('[SnapshotPreview] 클린업 함수 실행 실패:', e);
          }
        });
        g.__siteToppingCleanups = [];
      }

      // 전역 클린업 함수 실행
      if (typeof g.__siteTopping_cleanup === 'function') {
        try {
          g.__siteTopping_cleanup();
        } catch (e) {
          console.warn('[SnapshotPreview] 전역 클린업 실패:', e);
        }
        delete g.__siteTopping_cleanup;
      }

      // Site Topping이 추가한 요소들 제거
      const selectors = [
        '[data-site-topping="preview"]',
        '[data-site-topping="preview-css"]', 
        '[data-site-topping="preview-js"]',
        '[data-site-topping="script"]',
        '.site-topping-element'
      ];

      selectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
          try {
            el.remove();
          } catch (e) {
            console.warn('[SnapshotPreview] 요소 제거 실패:', selector, e);
          }
        });
      });

    } catch (error) {
      console.error('[SnapshotPreview] JS 클린업 실패:', error);
    }
  }

  /**
   * 코드를 실시간으로 업데이트합니다 (스냅샷은 유지).
   */
  async updateCode(css: string, js: string): Promise<void> {
    if (!this.currentSnapshot) {
      throw new Error('스냅샷이 생성되지 않았습니다.');
    }

    try {

      // CSS 업데이트
      if (this.appliedCSSElement) {
        const scopedCSS = css ? this.addCSSScoping(css) : '';
        this.appliedCSSElement.textContent = scopedCSS;
      }

      // JavaScript 재적용
      if (js && js.trim()) {
        await this.applyJSCode(js);
      } else {
        await this.cleanupJSEffects();
      }

    } catch (error) {
      console.error('[SnapshotPreview] 실시간 업데이트 실패:', error);
      throw error;
    }
  }

  /**
   * 스냅샷에서 완전히 복원합니다.
   */
  async restoreFromSnapshot(): Promise<void> {
    if (!this.currentSnapshot) {
      console.warn('[SnapshotPreview] 복원할 스냅샷이 없습니다.');
      return;
    }

    try {

      // 변경 추적 중지
      this.stopTracking();

      // 방법 1: 변경된 요소들만 선택적으로 복원 (성능 최적화)
      if (this.currentSnapshot.changedElements.size > 0) {
        
        let restoredCount = 0;
        this.currentSnapshot.changedElements.forEach((originalHTML, path) => {
          try {
            const element = document.querySelector(path);
            if (element && element.parentElement) {
              const parser = new DOMParser();
              const doc = parser.parseFromString(`<div>${originalHTML}</div>`, 'text/html');
              const restoredElement = doc.querySelector('div')?.firstElementChild;
              
              if (restoredElement) {
                element.parentElement.replaceChild(
                  document.importNode(restoredElement, true), 
                  element
                );
                restoredCount++;
              }
            }
          } catch (e) {
            console.warn('[SnapshotPreview] 개별 요소 복원 실패:', path, e);
          }
        });

      } else {
      }

      // Site Topping 요소들 제거
      this.removeSiteToppingElements();

      // 스크롤 위치 복원
      if (this.currentSnapshot.scrollPosition) {
        window.scrollTo(
          this.currentSnapshot.scrollPosition.x, 
          this.currentSnapshot.scrollPosition.y
        );
      }

      // 상태 초기화
      this.currentSnapshot = null;
      this.appliedCSSElement = null;
      this.jsTrackingId = null;

    } catch (error) {
      console.error('[SnapshotPreview] 복원 실패:', error);
      // 복원 실패 시 페이지 새로고침으로 대체
      window.location.reload();
    }
  }

  /**
   * Site Topping 관련 요소들을 모두 제거합니다.
   */
  private removeSiteToppingElements() {
    const selectors = [
      '#site-topping-style',
      '[data-site-topping]',
      '.site-topping-element'
    ];

    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        try {
          el.remove();
        } catch (e) {
          console.warn('[SnapshotPreview] Site Topping 요소 제거 실패:', selector, e);
        }
      });
    });
  }

  /**
   * CSS에 스코핑을 적용하여 익스텐션 UI를 보호합니다.
   */
  private addCSSScoping(css: string): string {
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
      console.warn('[SnapshotPreview] CSS 스코핑 실패, 원본 사용:', error);
      return css;
    }
  }

  /**
   * 현재 스냅샷 상태를 반환합니다.
   */
  getSnapshot(): DOMSnapshot | null {
    return this.currentSnapshot;
  }

  /**
   * 프리뷰가 활성 상태인지 확인합니다.
   */
  isActive(): boolean {
    return this.currentSnapshot !== null;
  }
}

// 싱글톤 인스턴스
let snapshotPreviewService: SnapshotPreviewService | null = null;

/**
 * SnapshotPreviewService 싱글톤 인스턴스를 반환합니다.
 */
export function getSnapshotPreviewService(): SnapshotPreviewService {
  if (!snapshotPreviewService) {
    snapshotPreviewService = new SnapshotPreviewService();
  }
  return snapshotPreviewService;
}

/**
 * 편의 함수들 - 기존 codePreview.ts 인터페이스와 호환
 */

/**
 * 스냅샷을 생성하고 코드를 적용합니다.
 */
export async function createSnapshotAndApplyCode(css: string, js: string): Promise<void> {
  const service = getSnapshotPreviewService();
  await service.createSnapshot();
  await service.applyCodeWithTracking(css, js);
}

/**
 * 실시간으로 코드를 업데이트합니다.
 */
export async function updatePreviewCode(css: string, js: string): Promise<void> {
  const service = getSnapshotPreviewService();
  await service.updateCode(css, js);
}

/**
 * 스냅샷에서 복원합니다.
 */
export async function restoreFromSnapshot(): Promise<void> {
  const service = getSnapshotPreviewService();
  await service.restoreFromSnapshot();
}

/**
 * 프리뷰가 활성 상태인지 확인합니다.
 */
export function isSnapshotPreviewActive(): boolean {
  const service = getSnapshotPreviewService();
  return service.isActive();
}