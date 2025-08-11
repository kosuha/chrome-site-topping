import React, { createContext, useContext, useReducer, ReactNode, useMemo } from 'react';

export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  codeBlocks?: {
    language: string;
    code: string;
  }[];
  code?: {
    javascript?: string;
    css?: string;
  };
  codeAction?: 'replace' | 'append' | 'insert' | 'modify';
  // 새로운 통합 diff 형식
  changes?: {
    javascript?: {
      diff: string;
    };
    css?: {
      diff: string;
    };
  };
}

export interface ChatThread {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AppState {
  isOpen: boolean;
  activeTab: 'code' | 'chat' | 'user';
  width: number;
  isLoading: boolean;
  error: string | null;
  isPreviewMode: boolean;
  editorCode: {
    javascript: string;
    css: string;
  };
  // 코드 변경 히스토리 스택 (브라우저 뒤로가기 스타일)
  codeHistoryStack: Array<{
    javascript: string;
    css: string;
    messageId?: string;
    timestamp: Date;
    description?: string;
    changeSummary?: {
      javascript?: { added: number; removed: number };
      css?: { added: number; removed: number };
    };
    isSuccessful?: boolean;
  }>;
  currentHistoryIndex: number;
  lastAppliedChange: {
    messageId: string;
    timestamp: Date;
  } | null;
  chatThreads: ChatThread[];
  currentThreadId: string | null;
  isAiLoading: boolean;
}

type AppAction = 
  | { type: 'TOGGLE_PANEL' }
  | { type: 'OPEN_PANEL' }
  | { type: 'CLOSE_PANEL' }
  | { type: 'SET_OPEN'; payload: boolean }
  | { type: 'SET_ACTIVE_TAB'; payload: 'code' | 'chat' | 'user' }
  | { type: 'SET_WIDTH'; payload: number }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_PREVIEW_MODE'; payload: boolean }
  | { type: 'TOGGLE_PREVIEW_MODE' }
  | { type: 'SET_EDITOR_CODE'; payload: { language: 'javascript' | 'css'; code: string } }
  | { type: 'PUSH_CODE_HISTORY'; payload: { 
      javascript: string; 
      css: string; 
      messageId?: string; 
      description?: string;
      changeSummary?: {
        javascript?: { added: number; removed: number };
        css?: { added: number; removed: number };
      };
      isSuccessful?: boolean;
    } }
  | { type: 'GO_BACK_HISTORY' }
  | { type: 'GO_FORWARD_HISTORY' }
  | { type: 'SET_LAST_APPLIED_CHANGE'; payload: { messageId: string; timestamp: Date } }
  | { type: 'CLEAR_CODE_HISTORY' }
  | { type: 'CREATE_THREAD' }
  | { type: 'CREATE_NEW_THREAD'; payload?: string }
  | { type: 'SET_CURRENT_THREAD'; payload: string | null }
  | { type: 'ADD_MESSAGE'; payload: { threadId: string; message: ChatMessage } }
  | { type: 'ADD_MESSAGE_TO_THREAD'; payload: { threadId: string; message: ChatMessage } }
  | { type: 'DELETE_THREAD'; payload: string }
  | { type: 'UPDATE_THREAD_TITLE'; payload: { threadId: string; title: string } }
  | { type: 'SET_AI_LOADING'; payload: boolean }
  | { type: 'RESET_STATE' }
  | { type: 'LOAD_THREADS_FROM_SERVER'; payload: ChatThread[] }
  | { type: 'ADD_SERVER_THREAD'; payload: ChatThread };

const initialState: AppState = {
  isOpen: false,
  activeTab: 'chat',
  width: 400,
  isLoading: false,
  error: null,
  isPreviewMode: false,
  editorCode: {
    javascript: '',
    css: ''
  },
  codeHistoryStack: [{
    javascript: '',
    css: '',
    timestamp: new Date(),
    description: '초기 상태'
  }],
  currentHistoryIndex: 0,
  lastAppliedChange: null,
  chatThreads: [],
  currentThreadId: null,
  isAiLoading: false,
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'TOGGLE_PANEL':
      return { ...state, isOpen: !state.isOpen };
    case 'OPEN_PANEL':
      return { ...state, isOpen: true };
    case 'CLOSE_PANEL':
      return { ...state, isOpen: false };
    case 'SET_ACTIVE_TAB':
      return { ...state, activeTab: action.payload };
    case 'SET_WIDTH':
      return { ...state, width: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'TOGGLE_PREVIEW_MODE':
      return { ...state, isPreviewMode: !state.isPreviewMode };
    case 'SET_EDITOR_CODE':
      return {
        ...state,
        editorCode: {
          ...state.editorCode,
          [action.payload.language]: action.payload.code
        }
      };
    case 'PUSH_CODE_HISTORY':
      const newHistoryItem = {
        javascript: action.payload.javascript,
        css: action.payload.css,
        messageId: action.payload.messageId,
        timestamp: new Date(),
        description: action.payload.description || 'AI 코드 적용',
        changeSummary: action.payload.changeSummary,
        isSuccessful: action.payload.isSuccessful ?? true
      };
      
      // 현재 인덱스 이후의 히스토리 제거 (브라우저 뒤로가기 스타일)
      const newStack = state.codeHistoryStack.slice(0, state.currentHistoryIndex + 1);
      newStack.push(newHistoryItem);
      
      return {
        ...state,
        codeHistoryStack: newStack,
        currentHistoryIndex: newStack.length - 1
      };
    case 'GO_BACK_HISTORY':
      if (state.currentHistoryIndex > 0) {
        const newIndex = state.currentHistoryIndex - 1;
        const targetHistory = state.codeHistoryStack[newIndex];
        return {
          ...state,
          editorCode: {
            javascript: targetHistory.javascript,
            css: targetHistory.css
          },
          currentHistoryIndex: newIndex,
          lastAppliedChange: targetHistory.messageId ? {
            messageId: targetHistory.messageId,
            timestamp: targetHistory.timestamp
          } : null
        };
      }
      return state;
    case 'GO_FORWARD_HISTORY':
      if (state.currentHistoryIndex < state.codeHistoryStack.length - 1) {
        const newIndex = state.currentHistoryIndex + 1;
        const targetHistory = state.codeHistoryStack[newIndex];
        return {
          ...state,
          editorCode: {
            javascript: targetHistory.javascript,
            css: targetHistory.css
          },
          currentHistoryIndex: newIndex,
          lastAppliedChange: targetHistory.messageId ? {
            messageId: targetHistory.messageId,
            timestamp: targetHistory.timestamp
          } : null
        };
      }
      return state;
    case 'SET_LAST_APPLIED_CHANGE':
      return {
        ...state,
        lastAppliedChange: action.payload
      };
    case 'CLEAR_CODE_HISTORY':
      return {
        ...state,
        codeHistoryStack: [{
          javascript: state.editorCode.javascript,
          css: state.editorCode.css,
          timestamp: new Date(),
          description: '히스토리 초기화'
        }],
        currentHistoryIndex: 0,
        lastAppliedChange: null
      };
    case 'CREATE_NEW_THREAD':
      // 현재 스레드만 해제 - 실제 스레드 생성은 메시지 전송 시에 수행
      return {
        ...state,
        currentThreadId: ''
      };
    case 'SET_CURRENT_THREAD':
      return {
        ...state,
        currentThreadId: action.payload
      };
    case 'ADD_MESSAGE_TO_THREAD':
      const updatedThreads = state.chatThreads.map(thread => {
        if (thread.id === action.payload.threadId) {
          return {
            ...thread,
            messages: [...thread.messages, action.payload.message],
            updatedAt: new Date(),
            title: thread.messages.length === 0 && action.payload.message.type === 'user' 
              ? action.payload.message.content.slice(0, 30) + (action.payload.message.content.length > 30 ? '...' : '')
              : thread.title
          };
        }
        return thread;
      });
      return {
        ...state,
        chatThreads: updatedThreads
      };
    case 'DELETE_THREAD':
      const remainingThreads = state.chatThreads.filter(thread => thread.id !== action.payload);
      const nextCurrentThreadId = state.currentThreadId === action.payload 
        ? (remainingThreads.length > 0 ? remainingThreads[0].id : null)
        : state.currentThreadId;
      return {
        ...state,
        chatThreads: remainingThreads,
        currentThreadId: nextCurrentThreadId
      };
    case 'UPDATE_THREAD_TITLE':
      return {
        ...state,
        chatThreads: state.chatThreads.map(thread =>
          thread.id === action.payload.threadId
            ? { ...thread, title: action.payload.title, updatedAt: new Date() }
            : thread
        )
      };
    case 'SET_AI_LOADING':
      return { ...state, isAiLoading: action.payload };
    case 'RESET_STATE':
      return initialState;
    case 'LOAD_THREADS_FROM_SERVER':
      return {
        ...state,
        chatThreads: action.payload
      };
    case 'ADD_SERVER_THREAD':
      return {
        ...state,
        chatThreads: [action.payload, ...state.chatThreads]
      };
    default:
      return state;
  }
}

interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  actions: {
    togglePanel: () => void;
    openPanel: () => void;
    closePanel: () => void;
    setActiveTab: (tab: 'code' | 'chat' | 'user') => void;
    setWidth: (width: number) => void;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    togglePreviewMode: () => void;
    setEditorCode: (language: 'javascript' | 'css', code: string) => void;
    // 코드 변경 히스토리 관련 액션들 (브라우저 스타일)
    pushCodeHistory: (history: { 
      javascript: string; 
      css: string; 
      messageId?: string; 
      description?: string;
      changeSummary?: {
        javascript?: { added: number; removed: number };
        css?: { added: number; removed: number };
      };
      isSuccessful?: boolean;
    }) => void;
    goBackHistory: () => void;
    goForwardHistory: () => void;
    setLastAppliedChange: (messageId: string, timestamp: Date) => void;
    clearCodeHistory: () => void;
    createNewThread: (title?: string) => void;
    setCurrentThread: (threadId: string) => void;
    addMessageToThread: (threadId: string, message: ChatMessage) => void;
    deleteThread: (threadId: string) => void;
    updateThreadTitle: (threadId: string, title: string) => void;
    setAiLoading: (loading: boolean) => void;
    resetState: () => void;
    // 서버 연동용 액션들
    loadThreadsFromServer: (threads: ChatThread[]) => void;
    addServerThread: (thread: ChatThread) => void;
  };
  computed: {
    currentThread: ChatThread | null;
    currentMessages: ChatMessage[];
  };
}

const AppContext = createContext<AppContextType | undefined>(undefined);

interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  const actions = useMemo(() => ({
    togglePanel: () => dispatch({ type: 'TOGGLE_PANEL' }),
    openPanel: () => dispatch({ type: 'OPEN_PANEL' }),
    closePanel: () => dispatch({ type: 'CLOSE_PANEL' }),
    setActiveTab: (tab: 'code' | 'chat' | 'user') => dispatch({ type: 'SET_ACTIVE_TAB', payload: tab }),
    setWidth: (width: number) => dispatch({ type: 'SET_WIDTH', payload: width }),
    setLoading: (loading: boolean) => dispatch({ type: 'SET_LOADING', payload: loading }),
    setError: (error: string | null) => dispatch({ type: 'SET_ERROR', payload: error }),
    togglePreviewMode: () => dispatch({ type: 'TOGGLE_PREVIEW_MODE' }),
    setEditorCode: (language: 'javascript' | 'css', code: string) => dispatch({ type: 'SET_EDITOR_CODE', payload: { language, code } }),
    // 코드 변경 히스토리 관련 액션들 (브라우저 스타일)
    pushCodeHistory: (history: { 
      javascript: string; 
      css: string; 
      messageId?: string; 
      description?: string;
      changeSummary?: {
        javascript?: { added: number; removed: number };
        css?: { added: number; removed: number };
      };
      isSuccessful?: boolean;
    }) => dispatch({ type: 'PUSH_CODE_HISTORY', payload: history }),
    goBackHistory: () => dispatch({ type: 'GO_BACK_HISTORY' }),
    goForwardHistory: () => dispatch({ type: 'GO_FORWARD_HISTORY' }),
    setLastAppliedChange: (messageId: string, timestamp: Date) => dispatch({ type: 'SET_LAST_APPLIED_CHANGE', payload: { messageId, timestamp } }),
    clearCodeHistory: () => dispatch({ type: 'CLEAR_CODE_HISTORY' }),
    createNewThread: (title?: string) => dispatch({ type: 'CREATE_NEW_THREAD', payload: title }),
    setCurrentThread: (threadId: string) => dispatch({ type: 'SET_CURRENT_THREAD', payload: threadId }),
    addMessageToThread: (threadId: string, message: ChatMessage) => dispatch({ type: 'ADD_MESSAGE_TO_THREAD', payload: { threadId, message } }),
    deleteThread: (threadId: string) => dispatch({ type: 'DELETE_THREAD', payload: threadId }),
    updateThreadTitle: (threadId: string, title: string) => dispatch({ type: 'UPDATE_THREAD_TITLE', payload: { threadId, title } }),
    setAiLoading: (loading: boolean) => dispatch({ type: 'SET_AI_LOADING', payload: loading }),
    resetState: () => dispatch({ type: 'RESET_STATE' }),
    // 서버 연동용 액션들
    loadThreadsFromServer: (threads: ChatThread[]) => dispatch({ type: 'LOAD_THREADS_FROM_SERVER', payload: threads }),
    addServerThread: (thread: ChatThread) => dispatch({ type: 'ADD_SERVER_THREAD', payload: thread }),
  }), [dispatch]);

  const computed = useMemo(() => ({
    currentThread: state.currentThreadId ? state.chatThreads.find(thread => thread.id === state.currentThreadId) || null : null,
    currentMessages: state.currentThreadId ? state.chatThreads.find(thread => thread.id === state.currentThreadId)?.messages || [] : [],
  }), [state.currentThreadId, state.chatThreads]);

  const contextValue = useMemo(() => ({
    state,
    dispatch,
    actions,
    computed,
  }), [state, dispatch, actions, computed]);

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}