// Chrome 메시지 타입
export interface ChromeMessage {
  action: string;
  data?: any;
}

// 사이드패널 상태 타입
export interface SidePanelState {
  isOpen: boolean;
  width: number;
  activeTab: 'code' | 'chat';
}

export interface FloatingButtonProps {
  onClick: () => void;
  isVisible: boolean;
}