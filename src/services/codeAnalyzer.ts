/**
 * 코드 분석 및 지능형 병합을 위한 서비스
 * Git diff 기반의 Cursor AI 스타일 부분 수정을 담당
 */

export interface AIResponse {
  responseType: 'unified_diff' | 'legacy_code';
  changes?: {
    javascript?: {
      diff: string;
    };
    css?: {
      diff: string;
    };
  };
  explanation?: string;
}

class CodeAnalyzer {
  /**
   * Git diff를 현재 코드에 직접 적용
   */
  applyDiffDirectly(currentCode: string, diffString: string): string {
    
    try {
      const lines = currentCode.split('\n');
      const diffLines = diffString.split('\n');
      
      let currentLineIndex = 0;
      let i = 0;
      
      while (i < diffLines.length) {
        const line = diffLines[i];
        
        if (line.startsWith('@@')) {
          // diff 헤더 파싱: @@ -oldStart,oldCount +newStart,newCount @@
          const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
          if (match) {
            currentLineIndex = parseInt(match[3]) - 1; // 새로운 시작 라인 (0-based)
          }
        } else if (line.startsWith('-')) {
          // 삭제할 라인 - 해당 라인을 제거
          if (currentLineIndex < lines.length) {
            lines.splice(currentLineIndex, 1);
          }
        } else if (line.startsWith('+')) {
          // 추가할 라인 - 해당 위치에 삽입
          const newLine = line.substring(1);
          lines.splice(currentLineIndex, 0, newLine);
          currentLineIndex++;
        } else if (line.startsWith(' ')) {
          // 컨텍스트 라인 - 변경 없음
          currentLineIndex++;
        }
        i++;
      }
      
      const result = lines.join('\n');
      return result;
    } catch (error) {
      console.warn('❌ Git diff 적용 실패:', error);
      return currentCode; // 실패시 원본 반환
    }
  }

  /**
   * 지능형 코드 병합 (Cursor AI 스타일 changes 형식)
   */
  intelligentMerge(
    currentCode: { javascript?: string; css?: string },
    aiResponse: string | object
  ): { javascript?: string; css?: string } {
    
    // changes 객체 직접 전달 처리
    if (typeof aiResponse === 'object' && 'changes' in aiResponse) {
      const changes = (aiResponse as any).changes;
      const result: { javascript?: string; css?: string } = {};
      
      if (changes.javascript?.diff && currentCode.javascript !== undefined) {
        result.javascript = this.applyDiffDirectly(currentCode.javascript, changes.javascript.diff);
      } else {
        result.javascript = currentCode.javascript;
      }
      
      if (changes.css?.diff && currentCode.css !== undefined) {
        result.css = this.applyDiffDirectly(currentCode.css, changes.css.diff);
      } else {
        result.css = currentCode.css;
      }
      return result;
    }
    
    return currentCode;
  }
}

export const codeAnalyzer = new CodeAnalyzer();
export default codeAnalyzer;