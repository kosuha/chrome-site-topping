// 동적 모델 목록을 지원하기 위해 AIModelKey를 가변 문자열로 정의합니다.
export type AIModelKey = string;

// 서버에서 목록을 가져오기 전까지 사용할 폴백 모델 목록입니다.
export const AI_MODELS: Record<AIModelKey, { label: string; value?: string }> = {
  'gemini-2.5-pro': { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' },
  'gemini-2.5-flash': { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
  'gemini-2.5-flash-lite': { label: 'Gemini 2.5 Flash Lite', value: 'gemini-2.5-flash-lite' },
};

export const DEFAULT_AI_MODEL: AIModelKey = 'gemini-2.5-flash';

export const LOCAL_STORAGE_KEYS = {
  LAST_AI_MODEL: 'siteTopping:lastAiModel',
} as const;
