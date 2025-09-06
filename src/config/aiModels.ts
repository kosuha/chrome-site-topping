// 동적 모델 목록을 지원하기 위해 AIModelKey를 가변 문자열로 정의합니다.
export type AIModelKey = string;

// 의도: 서버 목록을 받기 전에는 모델 선택 UI를 렌더하지 않습니다.
// 과거에는 폴백 모델 상수(AI_MODELS)를 사용했지만 현재는 제거했습니다.

export const DEFAULT_AI_MODEL: AIModelKey = 'gpt-5-mini';

export const LOCAL_STORAGE_KEYS = {
  LAST_AI_MODEL: 'siteTopping:lastAiModel',
} as const;
