import { createTwoFilesPatch } from 'diff';
import aiService from './aiService';
import codeAnalyzer from './codeAnalyzer';

export type VersionType = 'snapshot' | 'patch';

interface SaveVersionPayload {
  site_code: string;
  type: VersionType;
  parent_id?: string | null;
  javascript?: string | null;
  css?: string | null;
  js_patch?: string | null;
  css_patch?: string | null;
  patch_count_from_snapshot: number;
  metadata?: Record<string, any> | null;
}

export interface VersionRecord {
  id: string;
  site_code: string;
  user_id: string;
  parent_id: string | null;
  type: VersionType;
  is_release: boolean;
  javascript: string | null;
  css: string | null;
  js_patch: string | null;
  css_patch: string | null;
  patch_count_from_snapshot: number;
  metadata: any;
  created_at: string;
}

/**
 * 서버 API 경로 도우미
 */
function getApiBase() {
  return aiService.getBaseUrl() + '/api/v1';
}

async function authedFetch(path: string, init?: RequestInit) {
  const token = await (aiService as any).getAuthToken?.();
  if (!token) throw new Error('인증 필요');
  const res = await fetch(getApiBase() + path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getHeadVersion(siteCode: string): Promise<VersionRecord | null> {
  const data = await authedFetch(`/sites/${siteCode}/versions/head`, { method: 'GET' }).catch(() => null);
  return data?.data || data || null;
}

export async function getAllVersions(siteCode: string): Promise<VersionRecord[]> {
  const data = await authedFetch(`/sites/${siteCode}/versions`, { method: 'GET' }).catch(() => ({ data: { versions: [] } }));
  const list: VersionRecord[] = (data?.data?.versions || data?.versions || data?.data || data || []) as VersionRecord[];
  // created_at 오름차순으로 정렬 보장
  return [...list].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export async function saveVersion(payload: SaveVersionPayload): Promise<VersionRecord> {
  const data = await authedFetch(`/sites/${payload.site_code}/versions`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data?.data || data;
}

export function createUnifiedDiff(oldStr: string, newStr: string, filename = 'code'): string {
  return createTwoFilesPatch(filename, filename, oldStr || '', newStr || '', '', '');
}

export type ReconstructedStep = {
  id?: string;
  javascript: string;
  css: string;
  messageId?: string;
  changeSummary?: any;
  created_at?: string;
};

/**
 * 서버에서 받아온 버전 체인으로부터 클라이언트에서 코드를 복원
 */
export function reconstructFromVersions(versions: VersionRecord[]): ReconstructedStep[] {
  if (!versions || versions.length === 0) return [];

  // 가장 오래된 스냅샷부터 시작
  // 목록은 created_at asc로 들어온다고 가정(위에서 정렬)
  let js = '';
  let css = '';
  const steps: ReconstructedStep[] = [];

  for (let idx = 0; idx < versions.length; idx++) {
    const v = versions[idx];

    if (v.type === 'snapshot') {
      js = v.javascript ?? '';
      css = v.css ?? '';
    } else {
      // 첫 레코드가 patch인 경우, 초기 빈 상태를 스텝으로 먼저 추가해 내비게이션 가능하게 함
      if (steps.length === 0) {
        steps.push({ javascript: js, css: css });
      }
      if (v.js_patch) js = codeAnalyzer.applyDiffDirectly(js, v.js_patch);
      if (v.css_patch) css = codeAnalyzer.applyDiffDirectly(css, v.css_patch);
    }

    steps.push({
      id: v.id,
      javascript: js,
      css: css,
      messageId: v.metadata?.message_id,
      changeSummary: v.metadata?.changeSummary,
      created_at: v.created_at,
    });
  }

  return steps;
}

export async function persistHistoryStep(opts: {
  siteCode: string;
  previous?: { javascript: string; css: string } | null;
  current: { javascript: string; css: string };
  messageId?: string;
  changeSummary?: any;
}) {
  const { siteCode, previous, current, messageId, changeSummary } = opts;

  // HEAD 조회
  const head = await getHeadVersion(siteCode);
  const isFirst = !head;

  if (isFirst) {
    // 초기 스냅샷
    return await saveVersion({
      site_code: siteCode,
      type: 'snapshot',
      parent_id: null,
      javascript: current.javascript,
      css: current.css,
      js_patch: null,
      css_patch: null,
      patch_count_from_snapshot: 0,
      metadata: { message_id: messageId, changeSummary },
    });
  }

  // parent는 HEAD
  const patchCount = (head?.patch_count_from_snapshot ?? 0) + 1;

  // 주기 조건: 20스텝마다 스냅샷
  const shouldSnapshot = patchCount >= 20;

  if (shouldSnapshot) {
    return await saveVersion({
      site_code: siteCode,
      type: 'snapshot',
      parent_id: head.id,
      javascript: current.javascript,
      css: current.css,
      js_patch: null,
      css_patch: null,
      patch_count_from_snapshot: 0,
      metadata: { message_id: messageId, changeSummary },
    });
  }

  // 패치 생성 (previous가 없으면 빈 문자열 기준으로 생성)
  const prevJS = previous?.javascript ?? '';
  const prevCSS = previous?.css ?? '';
  const jsPatch = createUnifiedDiff(prevJS, current.javascript, 'script.js');
  const cssPatch = createUnifiedDiff(prevCSS, current.css, 'styles.css');

  return await saveVersion({
    site_code: siteCode,
    type: 'patch',
    parent_id: head.id,
    javascript: null,
    css: null,
    js_patch: jsPatch,
    css_patch: cssPatch,
    patch_count_from_snapshot: patchCount,
    metadata: { message_id: messageId, changeSummary },
  });
}
