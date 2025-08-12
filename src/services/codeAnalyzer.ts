/**
 * 코드 분석 및 지능형 병합을 위한 서비스
 * Git diff 기반의 Cursor AI 스타일 부분 수정을 담당
 */
import { applyPatch as diffApplyPatch } from 'diff';

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
   * 패치 문자열에 파일 헤더(---/+++)가 없으면 임의 헤더를 추가하고,
   * 헝크 내 유효하지 않은 라인을 컨텍스트 라인으로 보정한다.
   */
  private normalizeUnifiedDiff(patch: string): string {
    // 코드펜스 제거
    let normalized = patch.replace(/^```[a-zA-Z]*\n?|\n?```$/g, '').trimEnd();
    // EOL 정규화
    normalized = normalized.replace(/\r\n/g, '\n');

    const hasHeader = /^(---|\+\+\+)/m.test(normalized);
    const hasHunk = /^@@\s+-/m.test(normalized);
    if (!hasHeader && hasHunk) {
      normalized = `--- a\n+++ b\n${normalized}`;
    }

    // 헝크 내 invalid 라인 보정: 허용 접두어(' ', '+', '-', '\\')가 없으면 컨텍스트로 간주
    const lines = normalized.split('\n');
    let inHunk = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('@@ ')) {
        inHunk = true; continue;
      }
      if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('diff ')) {
        inHunk = false; continue;
      }
      if (inHunk) {
        const first = line.charAt(0);
        const isAllowed = first === ' ' || first === '+' || first === '-' || first === '\\' || line === '';
        if (!isAllowed) {
          lines[i] = ' ' + line; // 컨텍스트로 보정
        }
      }
    }

    normalized = lines.join('\n');
    if (!normalized.endsWith('\n')) normalized += '\n';
    return normalized;
  }

  /**
   * 매우 단순한 폴백 적용기 (라이브러리 실패 시 사용)
   */
  private naiveApply(currentCode: string, diffString: string): string {
    try {
      const lines = currentCode.split('\n');
      const diffLines = diffString.split('\n');
      let currentLineIndex = 0;
      for (let i = 0; i < diffLines.length; i++) {
        const line = diffLines[i];
        if (line.startsWith('@@')) {
          const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
          if (match) currentLineIndex = parseInt(match[3]) - 1;
        } else if (line.startsWith(' ')) {
          currentLineIndex++;
        } else if (line.startsWith('-')) {
          // 컨텍스트 확인 후 삭제 시도
          const expected = line.slice(1);
          if (lines[currentLineIndex] === expected) {
            lines.splice(currentLineIndex, 1);
          } else {
            const idx = lines.indexOf(expected, Math.max(0, currentLineIndex - 2));
            if (idx !== -1) lines.splice(idx, 1);
          }
        } else if (line.startsWith('+')) {
          lines.splice(currentLineIndex, 0, line.slice(1));
          currentLineIndex++;
        }
      }
      return lines.join('\n');
    } catch {
      return currentCode;
    }
  }

  /**
   * Git diff를 현재 코드에 직접 적용
   */
  applyDiffDirectly(currentCode: string, diffString: string): string {
    try {
      const eol = currentCode.includes('\r\n') ? '\r\n' : '\n';
      const normalizedPatch = this.normalizeUnifiedDiff(diffString);
      const base = currentCode.replace(/\r\n/g, '\n');
      const applied = diffApplyPatch(base, normalizedPatch);
      if (applied === false) {
        console.warn('diff.applyPatch 실패, 폴백 로직 사용');
        return this.naiveApply(currentCode, diffString);
      }
      return (applied as string).replace(/\n/g, eol);
    } catch (error) {
      // 과도한 에러 노이즈 방지
      console.warn('Git diff 적용 실패, 폴백 사용');
      return this.naiveApply(currentCode, diffString);
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