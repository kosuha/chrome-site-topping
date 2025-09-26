/**
 * Site Topping Code Preview Service
 * 스냅샷 기반 프리뷰 시스템과 기존 시스템의 통합 인터페이스
 * 
 * 구조: Side Panel → Background Script → Web Page
 * 새로운 스냅샷 시스템을 기본으로 하고, 기존 함수들은 호환성을 위해 유지
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
 * 스냅샷 기반 시스템을 우선 사용하고, 실패 시 기존 시스템으로 폴백
 */
export async function applyCodeToPage(css: string, js: string): Promise<void> {
  
  try {
    // 스냅샷 기반 시스템 사용
    const response = await chrome.runtime.sendMessage({ 
      type: 'CREATE_SNAPSHOT_AND_APPLY', 
      css, 
      js 
    });
    
    if (response?.success) {
      return;
    }
    
    console.warn('[CodePreview] 스냅샷 기반 적용 실패, 기존 시스템으로 폴백:', response?.error);
  } catch (error) {
    console.warn('[CodePreview] 스냅샷 시스템 오류, 기존 시스템으로 폴백:', error);
  }
  
  // 기존 시스템으로 폴백
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
 * 스냅샷이 있으면 스냅샷으로 복원하고, 없으면 기존 방식으로 제거
 */
export async function removeCodeFromPage(): Promise<void> {
  
  try {
    // 스냅샷에서 복원 시도
    const response = await chrome.runtime.sendMessage({ type: 'RESTORE_FROM_SNAPSHOT' });
    
    if (response?.success) {
      return;
    }
    
    console.warn('[CodePreview] 스냅샷 복원 실패, 기존 시스템으로 폴백:', response?.error);
  } catch (error) {
    console.warn('[CodePreview] 스냅샷 복원 오류, 기존 시스템으로 폴백:', error);
  }
  
  // 기존 시스템으로 폴백
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
 * 실시간 코드 업데이트 (스냅샷 유지)
 * 스냅샷이 있는 경우에만 실시간 업데이트, 없으면 일반 적용
 */
export async function updateCodePreview(css: string, js: string): Promise<void> {
  
  try {
    // 스냅샷 기반 실시간 업데이트 시도
    const response = await chrome.runtime.sendMessage({ 
      type: 'UPDATE_PREVIEW_CODE', 
      css, 
      js 
    });
    
    if (response?.success) {
      return;
    }
    
    console.warn('[CodePreview] 실시간 업데이트 실패, 일반 적용으로 폴백:', response?.error);
  } catch (error) {
    console.warn('[CodePreview] 실시간 업데이트 오류, 일반 적용으로 폴백:', error);
  }
  
  // 일반 적용으로 폴백
  await applyCodeToPage(css, js);
}

/**
 * 현재 프리뷰 상태 확인 - 이제 Background Script에서 관리됨
 */
export function isPreviewActive(): boolean {
  console.warn('[CodePreview] 프리뷰 상태는 AppContext에서 확인하세요');
  return false;
}