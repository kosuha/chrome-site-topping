/**
 * Site Topping Code Preview Service
 * 올바른 Chrome Extension 아키텍처를 사용한 코드 프리뷰 시스템
 * 
 * 구조: Side Panel → Background Script → Web Page
 */

/**
 * 활성 탭 ID 반환
 */
async function getActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('활성 탭을 찾을 수 없습니다');
  return tab.id;
}

/**
 * 탭 리로드 후 지연 대기
 */
export async function reloadActiveTab(delayMs = 800): Promise<void> {
  const tabId = await getActiveTabId();
  await chrome.tabs.reload(tabId);
  await new Promise((r) => setTimeout(r, delayMs));
}

/**
 * 웹페이지에 CSS와 JavaScript 코드를 적용합니다.
 * Background Script를 통해 chrome.scripting API 사용
 */
export async function applyCodeToPage(css: string, js: string): Promise<void> {
  console.log('[CodePreview] Background Script를 통해 코드 적용 요청');
  const response = await chrome.runtime.sendMessage({ type: 'APPLY_CODE_PREVIEW', css, js });
  if (!response?.success) throw new Error(response?.error || '코드 적용 실패');
}

/**
 * 리로드 후 코드 적용
 */
export async function applyAfterReload(css: string, js: string, delayMs = 800): Promise<void> {
  await reloadActiveTab(delayMs);
  await applyCodeToPage(css, js);
}

/**
 * 웹페이지에서 모든 프리뷰 코드를 제거합니다.
 * Background Script를 통해 chrome.scripting API 사용
 */
export async function removeCodeFromPage(): Promise<void> {
  console.log('[CodePreview] Background Script를 통해 코드 제거 요청');
  const response = await chrome.runtime.sendMessage({ type: 'REMOVE_CODE_PREVIEW' });
  if (!response?.success) throw new Error(response?.error || '코드 제거 실패');
}

/**
 * 프리뷰 제거 후 리로드
 */
export async function removeAndReload(delayMs = 800): Promise<void> {
  await removeCodeFromPage();
  await reloadActiveTab(delayMs);
}

/**
 * 미리보기 비활성화 (removeCodeFromPage와 동일)
 */
export function disablePreview(): void {
  // 유지: 레거시 사용처 대비
  void removeCodeFromPage();
}

/**
 * 현재 프리뷰 상태 확인 - 이제 Background Script에서 관리됨
 */
export function isPreviewActive(): boolean {
  console.warn('[CodePreview] 프리뷰 상태는 AppContext에서 확인하세요');
  return false;
}