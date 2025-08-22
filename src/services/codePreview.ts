/**
 * Site Topping Code Preview Service
 * 올바른 Chrome Extension 아키텍처를 사용한 코드 프리뷰 시스템
 * 
 * 구조: Side Panel → Background Script → Web Page
 */

/**
 * 웹페이지에 CSS와 JavaScript 코드를 적용합니다.
 * Background Script를 통해 chrome.scripting API 사용
 */
export async function applyCodeToPage(css: string, js: string): Promise<void> {
  console.log('[CodePreview] Background Script를 통해 코드 적용 요청');
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'APPLY_CODE_PREVIEW',
      css,
      js
    });
    
    if (!response?.success) {
      throw new Error(response?.error || '코드 적용 실패');
    }
    
    console.log('[CodePreview] 코드 적용 성공');
    
  } catch (error) {
    console.error('[CodePreview] 코드 적용 실패:', error);
    throw error;
  }
}

/**
 * 웹페이지에서 모든 프리뷰 코드를 제거합니다.
 * Background Script를 통해 chrome.scripting API 사용
 */
export function removeCodeFromPage(): void {
  console.log('[CodePreview] Background Script를 통해 코드 제거 요청');
  
  chrome.runtime.sendMessage({
    type: 'REMOVE_CODE_PREVIEW'
  }).then(response => {
    if (response?.success) {
      console.log('[CodePreview] 코드 제거 성공');
    } else {
      console.error('[CodePreview] 코드 제거 실패:', response?.error);
    }
  }).catch(error => {
    console.error('[CodePreview] 코드 제거 메시지 전송 실패:', error);
  });
}

/**
 * 미리보기 비활성화 (removeCodeFromPage와 동일)
 */
export function disablePreview(): void {
  removeCodeFromPage();
}

/**
 * 현재 프리뷰 상태 확인 - 이제 Background Script에서 관리됨
 */
export function isPreviewActive(): boolean {
  // 실제 상태는 Background Script에서 관리되므로
  // Side Panel의 상태를 기준으로 판단
  console.warn('[CodePreview] 프리뷰 상태는 AppContext에서 확인하세요');
  return false;
}