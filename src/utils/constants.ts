// 사이드패널 크기 제한
export const SIDE_PANEL = {
  MIN_WIDTH: 450,
  MAX_WIDTH: 2000,
  DEFAULT_WIDTH: 420,
} as const;

// 메시지 액션 타입
export const CHROME_ACTIONS = {
  TOGGLE_PANEL: 'togglePanel',
} as const;

// 탭 타입
export const TABS = {
  CODE: 'code',
  CHAT: 'chat',
} as const;