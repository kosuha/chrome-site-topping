/**
 * DOM 구조를 추출하고 AI가 읽기 쉬운 형태로 변환하는 서비스
 */

export interface DOMElementInfo {
  tagName: string;
  id?: string;
  className?: string;
  textContent?: string;
  children?: DOMElementInfo[];
  attributes?: Record<string, string>;
}

export interface ExtractedDOMInfo {
  url: string;
  title: string;
  description?: string;
  structure: DOMElementInfo;
  headElements: {
    title: string;
    meta: Array<{ name?: string; property?: string; content?: string; }>;
    links: Array<{ rel?: string; href?: string; }>;
  };
}

class DOMExtractor {
  /**
   * 현재 페이지의 DOM 구조를 AI가 읽기 쉬운 형태로 추출
   */
  extractPageDOM(): ExtractedDOMInfo {
    try {
      // 익스텐션 루트 요소 제외
      const extensionRoot = document.getElementById('site-topping-root');
      
      const result: ExtractedDOMInfo = {
        url: window.location.href,
        title: document.title,
        description: this.getMetaDescription(),
        structure: this.extractElement(document.body, extensionRoot),
        headElements: this.extractHeadElements(),
      };

      return result;
    } catch (error) {
      console.error('DOM 추출 실패:', error);
      throw new Error('페이지 DOM 구조를 추출할 수 없습니다.');
    }
  }

  /**
   * DOM 요소를 AI가 읽기 쉬운 구조로 변환
   */
  private extractElement(element: Element, skipElement?: Element | null): DOMElementInfo {
    // 익스텐션 관련 요소는 스킵
    if (element === skipElement || element.closest('#site-topping-root')) {
      return {
        tagName: 'SKIPPED',
        textContent: '[Site Topping Extension - 무시됨]',
      };
    }

    const info: DOMElementInfo = {
      tagName: element.tagName.toLowerCase(),
    };

    // ID 속성 추가
    if (element.id) {
      info.id = element.id;
    }

    // 클래스 속성 추가
    if (element.className && typeof element.className === 'string') {
      info.className = element.className.trim();
    }

    // 중요한 속성들 추가
    const importantAttributes = ['data-*', 'aria-*', 'role', 'type', 'name', 'href', 'src', 'alt'];
    const attributes: Record<string, string> = {};
    
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      if (
        importantAttributes.some(pattern => 
          pattern.includes('*') ? attr.name.startsWith(pattern.replace('*', '')) : attr.name === pattern
        ) ||
        ['data-', 'aria-'].some(prefix => attr.name.startsWith(prefix))
      ) {
        attributes[attr.name] = attr.value;
      }
    }

    if (Object.keys(attributes).length > 0) {
      info.attributes = attributes;
    }

    // 텍스트 콘텐츠 추가 (직접 자식 텍스트만)
    const textContent = this.getDirectTextContent(element);
    if (textContent.trim()) {
      info.textContent = textContent.trim().substring(0, 200); // 최대 200자
    }

    // 자식 요소들 처리 (중요한 요소들만)
    const children: DOMElementInfo[] = [];
    const childElements = Array.from(element.children);
    
    for (const child of childElements) {
      // 스크립트, 스타일, 숨겨진 요소는 스킵
      if (this.shouldSkipElement(child)) {
        continue;
      }

      // 너무 깊지 않게 제한 (최대 5레벨)
      if (this.getElementDepth(child) > 5) {
        continue;
      }

      const childInfo = this.extractElement(child, skipElement);
      if (childInfo.tagName !== 'SKIPPED') {
        children.push(childInfo);
      }
    }

    // 자식이 너무 많으면 제한 (최대 20개)
    if (children.length > 20) {
      info.children = children.slice(0, 20);
      children.push({
        tagName: 'MORE',
        textContent: `... 및 ${children.length - 20}개 더`
      });
    } else if (children.length > 0) {
      info.children = children;
    }

    return info;
  }

  /**
   * 요소의 직접 텍스트 콘텐츠만 가져오기
   */
  private getDirectTextContent(element: Element): string {
    let text = '';
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || '';
      }
    }
    return text;
  }

  /**
   * 스킵해야 할 요소인지 확인
   */
  private shouldSkipElement(element: Element): boolean {
    const tagName = element.tagName.toLowerCase();
    const skipTags = ['script', 'style', 'noscript', 'meta', 'link'];
    
    if (skipTags.includes(tagName)) {
      return true;
    }

    // 숨겨진 요소
    const computedStyle = window.getComputedStyle(element);
    if (
      computedStyle.display === 'none' ||
      computedStyle.visibility === 'hidden' ||
      computedStyle.opacity === '0'
    ) {
      return true;
    }

    // 익스텐션 관련 요소
    if (element.closest('#site-topping-root')) {
      return true;
    }

    return false;
  }

  /**
   * 요소의 깊이 계산
   */
  private getElementDepth(element: Element): number {
    let depth = 0;
    let parent = element.parentElement;
    while (parent && parent !== document.body) {
      depth++;
      parent = parent.parentElement;
    }
    return depth;
  }

  /**
   * meta description 추출
   */
  private getMetaDescription(): string | undefined {
    const metaDesc = document.querySelector('meta[name="description"]') as HTMLMetaElement;
    return metaDesc?.content || undefined;
  }

  /**
   * head 요소들의 중요한 정보 추출
   */
  private extractHeadElements() {
    const title = document.title;
    
    const meta: Array<{ name?: string; property?: string; content?: string; }> = [];
    document.querySelectorAll('meta[name], meta[property]').forEach(metaEl => {
      const element = metaEl as HTMLMetaElement;
      meta.push({
        name: element.name || undefined,
        property: element.getAttribute('property') || undefined,
        content: element.content || undefined,
      });
    });

    const links: Array<{ rel?: string; href?: string; }> = [];
    document.querySelectorAll('link[rel]').forEach(linkEl => {
      const element = linkEl as HTMLLinkElement;
      links.push({
        rel: element.rel || undefined,
        href: element.href || undefined,
      });
    });

    return { title, meta, links };
  }

  /**
   * DOM 구조를 AI가 읽기 쉬운 텍스트 형태로 변환
   */
  formatDOMForAI(domInfo: ExtractedDOMInfo): string {
    let result = '';
    
    result += `# 웹페이지 정보\n`;
    result += `- URL: ${domInfo.url}\n`;
    result += `- 제목: ${domInfo.title}\n`;
    if (domInfo.description) {
      result += `- 설명: ${domInfo.description}\n`;
    }
    result += `\n`;

    result += `# DOM 구조\n`;
    result += this.formatElementForAI(domInfo.structure, 0);
    
    return result;
  }

  /**
   * DOM 요소를 AI가 읽기 쉬운 텍스트로 포맷팅
   */
  private formatElementForAI(element: DOMElementInfo, depth: number): string {
    const indent = '  '.repeat(depth);
    let result = '';

    // 태그 정보
    let tagInfo = `${indent}<${element.tagName}`;
    
    if (element.id) {
      tagInfo += ` id="${element.id}"`;
    }
    
    if (element.className) {
      tagInfo += ` class="${element.className}"`;
    }

    if (element.attributes) {
      Object.entries(element.attributes).forEach(([key, value]) => {
        tagInfo += ` ${key}="${value}"`;
      });
    }

    tagInfo += '>';
    result += tagInfo + '\n';

    // 텍스트 콘텐츠
    if (element.textContent) {
      result += `${indent}  텍스트: "${element.textContent}"\n`;
    }

    // 자식 요소들
    if (element.children && element.children.length > 0) {
      element.children.forEach(child => {
        result += this.formatElementForAI(child, depth + 1);
      });
    }

    return result;
  }

  /**
   * 현재 페이지의 사용자 작성 코드 정보 가져오기
   */
  getCurrentCodeContext(jsCode?: string, cssCode?: string): string {
    let result = '';
    
    if (jsCode && jsCode.trim()) {
      result += `# 사용자가 작성한 JavaScript 코드\n`;
      result += '```javascript\n';
      result += jsCode;
      result += '\n```\n\n';
    }

    if (cssCode && cssCode.trim()) {
      result += `# 사용자가 작성한 CSS 코드\n`;
      result += '```css\n';
      result += cssCode;
      result += '\n```\n\n';
    }

    return result;
  }

  /**
   * AI에게 전달할 전체 컨텍스트 생성
   */
  createFullContext(jsCode?: string, cssCode?: string): string {
    try {
      const domInfo = this.extractPageDOM();
      let context = '';
      
      // 사용자 작성 코드
      context += this.getCurrentCodeContext(jsCode, cssCode);
      
      // DOM 구조
      context += this.formatDOMForAI(domInfo);
      
      // 컨텍스트 사용 안내
      context += `\n# AI 어시스턴트 안내\n`;
      context += `위 정보는 현재 사용자가 보고 있는 웹페이지의 DOM 구조와 작성한 코드입니다.\n`;
      context += `이 정보를 참고하여 더 정확하고 유용한 코드를 생성해주세요.\n`;
      context += `- 기존 요소의 ID, 클래스명을 활용하세요\n`;
      context += `- 페이지 구조에 맞는 CSS 선택자를 사용하세요\n`;
      context += `- 사용자가 이미 작성한 코드와 충돌하지 않도록 주의하세요\n`;
      
      return context;
    } catch (error) {
      console.error('컨텍스트 생성 실패:', error);
      return this.getCurrentCodeContext(jsCode, cssCode);
    }
  }
}

export const domExtractor = new DOMExtractor();
export default domExtractor;