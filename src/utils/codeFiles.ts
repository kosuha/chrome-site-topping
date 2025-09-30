export type CodeLanguage = 'javascript' | 'css';

export interface CodeFile {
  id: string;
  name: string;
  order: number;
  isActive: boolean;
  savedJavascript: string;
  savedCss: string;
  draftJavascript: string;
  draftCss: string;
  hasUnsavedChanges: boolean;
}

export interface BundleFilePayload {
  id: string;
  name: string;
  active: boolean;
  javascript: string;
  css: string;
  order: number;
}

export interface LanguageFileChunk {
  id: string;
  name: string;
  active: boolean;
  code: string;
  order: number;
}

const FILE_START = '/*#FILE';
const CSS_MARKER = '/*#CSS*/';
const FILE_END = '/*#END FILE*/';

const DEFAULT_FILE_PREFIX = 'feature';

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `file-${Math.random().toString(36).slice(2, 10)}`;
}

function parseMetadata(raw: string): { id: string; name: string; active: boolean; order?: number } {
  try {
    const parsed = JSON.parse(raw.trim());
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('metadata is not an object');
    }
    const id = typeof parsed.id === 'string' && parsed.id.trim() ? parsed.id : makeId();
    const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : DEFAULT_FILE_PREFIX;
    const active = typeof parsed.active === 'boolean' ? parsed.active : true;
    const order = typeof parsed.order === 'number' ? parsed.order : undefined;
    return { id, name, active, order };
  } catch {
    return { id: makeId(), name: DEFAULT_FILE_PREFIX, active: true };
  }
}

function safeJson(meta: { id: string; name: string; active: boolean; order: number }): string {
  return JSON.stringify({
    id: meta.id,
    name: meta.name,
    active: meta.active,
    order: meta.order,
  });
}

function escapeForRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function rstrip(value: string): string {
  return value.replace(/[\s\u00a0]+$/g, '');
}

export function createEmptyFile(order: number, baseName = DEFAULT_FILE_PREFIX): CodeFile {
  const id = makeId();
  const name = `${baseName}-${order}`;
  return {
    id,
    name,
    order,
    isActive: true,
    savedJavascript: '',
    savedCss: '',
    draftJavascript: '',
    draftCss: '',
    hasUnsavedChanges: false,
  };
}

export function cloneFiles(files: CodeFile[]): CodeFile[] {
  return files.map(file => ({ ...file }));
}

export function markDraft(file: CodeFile, language: CodeLanguage, value: string): CodeFile {
  const nextValue = value ?? '';
  if (language === 'javascript') {
    const hasUnsaved = nextValue !== file.savedJavascript;
    return {
      ...file,
      draftJavascript: nextValue,
      hasUnsavedChanges: hasUnsaved || file.draftCss !== file.savedCss,
    };
  }

  const hasUnsavedCss = nextValue !== file.savedCss;
  return {
    ...file,
    draftCss: nextValue,
    hasUnsavedChanges: hasUnsavedCss || file.draftJavascript !== file.savedJavascript,
  };
}

export function saveFileDraft(file: CodeFile): CodeFile {
  return {
    ...file,
    savedJavascript: file.draftJavascript,
    savedCss: file.draftCss,
    hasUnsavedChanges: false,
  };
}

export function ensureUniqueName(files: CodeFile[], desiredName: string): string {
  const existing = new Set(files.map(f => f.name.toLowerCase()));
  if (!existing.has(desiredName.toLowerCase())) {
    return desiredName;
  }

  let counter = 2;
  let candidate = `${desiredName}-${counter}`;
  while (existing.has(candidate.toLowerCase())) {
    counter += 1;
    candidate = `${desiredName}-${counter}`;
  }
  return candidate;
}

export function normaliseOrder(files: CodeFile[]): CodeFile[] {
  return files
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((file, index) => ({ ...file, order: index + 1 }));
}

export function serializeFilesToBundle(files: CodeFile[], useDraft = false): string {
  const sorted = files.slice().sort((a, b) => a.order - b.order);
  const blocks = sorted.map(file => {
    const metaJson = safeJson({ id: file.id, name: file.name, active: file.isActive, order: file.order });
    const jsSection = useDraft ? file.draftJavascript : file.savedJavascript;
    const cssSection = useDraft ? file.draftCss : file.savedCss;

    return [
      `${FILE_START} ${metaJson}*/`,
      jsSection ?? '',
      CSS_MARKER,
      cssSection ?? '',
      FILE_END,
    ].join('\n');
  });

  return blocks.join('\n\n').trim();
}

export function deserializeBundle(bundle: string): BundleFilePayload[] {
  if (!bundle || !bundle.trim()) return [];
  const pattern = `${escapeForRegex(FILE_START)}\\s+({[\\s\\S]*?})\\*/\\s*([\\s\\S]*?)(?:${escapeForRegex(CSS_MARKER)}\\s*([\\s\\S]*?))?${escapeForRegex(FILE_END)}`;
  const regex = new RegExp(pattern, 'g');

  const files: BundleFilePayload[] = [];
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(bundle)) !== null) {
    const [, rawMeta, jsRaw = '', cssRaw = ''] = match;
    const metadata = parseMetadata(rawMeta);
    const order = metadata.order ?? files.length + 1;
    files.push({
      id: metadata.id,
      name: metadata.name,
      active: metadata.active,
      javascript: rstrip(jsRaw),
      css: rstrip(cssRaw),
      order,
    });
  }
  return files;
}

export function parseLanguageSource(source: string): LanguageFileChunk[] {
  if (!source || !source.trim()) return [];

  const pattern = `${escapeForRegex(FILE_START)}\\s+({[\\s\\S]*?})\\*/\\s*([\\s\\S]*?)${escapeForRegex(FILE_END)}`;
  const regex = new RegExp(pattern, 'g');

  const files: LanguageFileChunk[] = [];
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(source)) !== null) {
    const [, rawMeta, codeRaw = ''] = match;
    const metadata = parseMetadata(rawMeta);
    files.push({
      id: metadata.id,
      name: metadata.name,
      active: metadata.active,
      code: rstrip(codeRaw),
      order: metadata.order ?? files.length + 1,
    });
  }
  return files;
}

export function mergeLanguageSources(jsSource: string, cssSource: string): CodeFile[] {
  const jsChunks = parseLanguageSource(jsSource);
  const cssChunks = parseLanguageSource(cssSource);
  const map = new Map<string, CodeFile>();

  const ensureFile = (chunk: LanguageFileChunk): CodeFile => {
    const existing = map.get(chunk.id);
    if (existing) {
      existing.name = chunk.name || existing.name;
      existing.isActive = chunk.active;
      if (chunk.order) existing.order = chunk.order;
      return existing;
    }
    const file: CodeFile = {
      id: chunk.id,
      name: chunk.name,
      order: chunk.order || map.size + 1,
      isActive: chunk.active,
      savedJavascript: '',
      savedCss: '',
      draftJavascript: '',
      draftCss: '',
      hasUnsavedChanges: false,
    };
    map.set(chunk.id, file);
    return file;
  };

  jsChunks.forEach(chunk => {
    const file = ensureFile(chunk);
    file.savedJavascript = chunk.code;
    file.draftJavascript = chunk.code;
  });

  cssChunks.forEach(chunk => {
    const file = ensureFile(chunk);
    file.savedCss = chunk.code;
    file.draftCss = chunk.code;
  });

  const files = Array.from(map.values());
  return normaliseOrder(files);
}

export function filesToLanguageString(files: CodeFile[], language: CodeLanguage, includeInactive = true, useDraft = false): string {
  const selected = files
    .filter(file => includeInactive || file.isActive)
    .sort((a, b) => a.order - b.order);

  const blocks = selected.map(file => {
    const metaJson = safeJson({ id: file.id, name: file.name, active: file.isActive, order: file.order });
    const code = language === 'javascript'
      ? (useDraft ? file.draftJavascript : file.savedJavascript)
      : (useDraft ? file.draftCss : file.savedCss);

    return [`${FILE_START} ${metaJson}*/`, code ?? '', FILE_END].join('\n');
  });

  return blocks.join('\n\n').trim();
}

export function applyLanguageStringToFiles(files: CodeFile[], aggregated: string, language: CodeLanguage): CodeFile[] {
  if (!aggregated || !aggregated.trim()) {
    return files;
  }

  const pattern = `${escapeForRegex(FILE_START)}\\s+({[\\s\\S]*?})\\*/\\s*([\\s\\S]*?)${escapeForRegex(FILE_END)}`;
  const regex = new RegExp(pattern, 'g');
  const updates = new Map<string, { code: string; active?: boolean; order?: number; name?: string }>();

  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(aggregated)) !== null) {
    const [, rawMeta, codeRaw = ''] = match;
    const metadata = parseMetadata(rawMeta);
    updates.set(metadata.id, {
      code: rstrip(codeRaw),
      active: metadata.active,
      order: metadata.order,
      name: metadata.name,
    });
  }

  return files.map(file => {
    const update = updates.get(file.id);
    if (!update) return file;

    if (language === 'javascript') {
      return {
        ...file,
        savedJavascript: update.code,
        draftJavascript: update.code,
        isActive: typeof update.active === 'boolean' ? update.active : file.isActive,
        name: update.name ?? file.name,
        order: typeof update.order === 'number' ? update.order : file.order,
        hasUnsavedChanges: false,
      };
    }

    return {
      ...file,
      savedCss: update.code,
      draftCss: update.code,
      isActive: typeof update.active === 'boolean' ? update.active : file.isActive,
      name: update.name ?? file.name,
      order: typeof update.order === 'number' ? update.order : file.order,
      hasUnsavedChanges: false,
    };
  });
}

export function mergeBundleIntoFiles(files: CodeFile[], bundle: string): CodeFile[] {
  const parsed = deserializeBundle(bundle);
  if (parsed.length === 0) return files;

  const byId = new Map(files.map(f => [f.id, f] as const));
  const next: CodeFile[] = [];

  parsed.forEach((item, index) => {
    const existing = byId.get(item.id);
    const base: CodeFile = existing ?? {
      id: item.id,
      name: item.name,
      order: item.order || index + 1,
      isActive: item.active,
      savedJavascript: '',
      savedCss: '',
      draftJavascript: '',
      draftCss: '',
      hasUnsavedChanges: false,
    };

    next.push({
      ...base,
      name: item.name,
      order: item.order || index + 1,
      isActive: item.active,
      savedJavascript: item.javascript,
      draftJavascript: item.javascript,
      savedCss: item.css,
      draftCss: item.css,
      hasUnsavedChanges: false,
    });
  });

  return normaliseOrder(next);
}

export function computeActiveOutput(files: CodeFile[], useDraft = false): { javascript: string; css: string } {
  const sorted = files.slice().sort((a, b) => a.order - b.order);
  const active = sorted.filter(file => file.isActive);

  const javascript = active
    .map(file => {
      const header = `// File: ${file.name}`;
      const source = useDraft ? file.draftJavascript : file.savedJavascript;
      const body = source.trim();
      return body ? `${header}\n${body}` : header;
    })
    .join('\n\n')
    .trim();

  const css = active
    .map(file => {
      const header = `/* File: ${file.name} */`;
      const source = useDraft ? file.draftCss : file.savedCss;
      const body = source.trim();
      return body ? `${header}\n${body}` : header;
    })
    .join('\n\n')
    .trim();

  return { javascript, css };
}

export function hasUnsavedFiles(files: CodeFile[]): boolean {
  return files.some(file => file.hasUnsavedChanges);
}
