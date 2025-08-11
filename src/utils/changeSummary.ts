// 코드 변경사항 요약 계산
export function calculateChangeSummary(oldCode: string, newCode: string): { added: number; removed: number } {
  const oldLines = oldCode.split('\n').filter(line => line.trim() !== '');
  const newLines = newCode.split('\n').filter(line => line.trim() !== '');
  
  // 간단한 diff 계산
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);
  
  const added = newLines.filter(line => !oldSet.has(line)).length;
  const removed = oldLines.filter(line => !newSet.has(line)).length;
  
  return { added, removed };
}

// 변경사항 요약을 문자열로 포맷
export function formatChangeSummary(
  changeSummary?: {
    javascript?: { added: number; removed: number };
    css?: { added: number; removed: number };
  }
): string {
  if (!changeSummary) return '';
  
  const parts: string[] = [];
  
  if (changeSummary.javascript) {
    const { added, removed } = changeSummary.javascript;
    if (added > 0 || removed > 0) {
      parts.push(`JavaScript+${added}-${removed}`);
    }
  }
  
  if (changeSummary.css) {
    const { added, removed } = changeSummary.css;
    if (added > 0 || removed > 0) {
      parts.push(`CSS+${added}-${removed}`);
    }
  }
  
  return parts.join(', ') || '변경사항 없음';
}
