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

// 컴포넌트 Props 타입들
export interface SidePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface FloatingButtonProps {
  onClick: () => void;
  isVisible: boolean;
}