export interface CodeBlock {
  language: string;
  code: string;
}

export function calculateDiffSummary(diff: string): { added: number; removed: number } {
  const lines = diff.split('\n');
  let added = 0;
  let removed = 0;

  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      added++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      removed++;
    }
  }

  return { added, removed };
}

export function parseCodeBlocks(content: string): { text: string; codeBlocks: CodeBlock[] } {
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)\n```/g;
  const codeBlocks: CodeBlock[] = [];
  let text = content;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const [fullMatch, language = 'text', code] = match;
    codeBlocks.push({ language, code: code.trim() });
    text = text.replace(fullMatch, `[코드 블록: ${language}]`);
  }

  return { text, codeBlocks };
}

export function formatTime(date: Date) {
  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit'
  });
}
