import React, { createContext, useContext, useReducer, ReactNode, useMemo, useEffect } from 'react';

export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  status?: 'pending' | 'in_progress' | 'completed' | 'failed'; // 메시지 상태
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
  images?: string[]; // 이미지 첨부
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
  | { type: 'UPDATE_MESSAGE_IN_THREAD'; payload: { threadId: string; messageId: string; message: ChatMessage } }
  | { type: 'DELETE_THREAD'; payload: string }
  | { type: 'UPDATE_THREAD_TITLE'; payload: { threadId: string; title: string } }
  | { type: 'SET_AI_LOADING'; payload: boolean }
  | { type: 'RESET_STATE' }
  | { type: 'LOAD_THREADS_FROM_SERVER'; payload: ChatThread[] }
  | { type: 'ADD_SERVER_THREAD'; payload: ChatThread }
  | { type: 'LOAD_THREAD_MESSAGES'; payload: { threadId: string; messages: ChatMessage[] } };

const getInitialState = (): AppState => ({
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
});

const initialState = getInitialState();

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
        currentThreadId: null
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
    case 'UPDATE_MESSAGE_IN_THREAD':
      const threadsWithUpdatedMessage = state.chatThreads.map(thread => {
        if (thread.id === action.payload.threadId) {
          return {
            ...thread,
            messages: thread.messages.map(message => 
              message.id === action.payload.messageId 
                ? action.payload.message 
                : message
            ),
            updatedAt: new Date()
          };
        }
        return thread;
      });
      return {
        ...state,
        chatThreads: threadsWithUpdatedMessage
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
      console.log('🔄 RESET_STATE 실행됨 - 완전 초기화');
      return getInitialState();
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
    case 'LOAD_THREAD_MESSAGES':
      const loadedThreads = state.chatThreads.map(thread => {
        if (thread.id !== action.payload.threadId) return thread;

        const serverMessages = action.payload.messages;
        const serverMap = new Map(serverMessages.map(m => [m.id, m]));

        // 우선 서버 메시지 기준으로 병합
        const rank = (s?: ChatMessage['status']) => {
          switch (s) {
            case 'failed': return 3;
            case 'completed': return 2;
            case 'in_progress': return 1;
            case 'pending': return 0;
            default: return -1;
          }
        };

        const merged = serverMessages.map(sm => {
          const existing = thread.messages.find(em => em.id === sm.id);
          if (!existing) return sm;
          // 상태는 더 진척된 쪽을 유지, 내용/changes는 비어있는 쪽을 채움
          const betterStatus = rank(existing.status) > rank(sm.status) ? existing.status : sm.status;
          return {
            ...sm,
            content: (existing.content && (!sm.content || sm.content.length === 0)) ? existing.content : sm.content,
            status: betterStatus,
            changes: existing.changes || sm.changes,
            timestamp: sm.timestamp || existing.timestamp,
          } as ChatMessage;
        });

        // 서버에 아직 반영되지 않은 로컬 pending/in_progress 어시스턴트 메시지 보존
        thread.messages.forEach(localMsg => {
          if (!serverMap.has(localMsg.id) && localMsg.type === 'assistant' && (localMsg.status === 'pending' || localMsg.status === 'in_progress')) {
            merged.push(localMsg);
          }
        });

        // 타임스탬프 기준 정렬(오름차순)
        merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        return { ...thread, messages: merged, updatedAt: new Date() };
      });
      
      return {
        ...state,
        chatThreads: loadedThreads
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
    setCurrentThread: (threadId: string | null) => void;
    addMessageToThread: (threadId: string, message: ChatMessage) => void;
    updateMessageInThread: (threadId: string, messageId: string, message: ChatMessage) => void;
    deleteThread: (threadId: string) => void;
    updateThreadTitle: (threadId: string, title: string) => void;
    setAiLoading: (loading: boolean) => void;
    resetState: () => void;
    // 서버 연동용 액션들
    loadThreadsFromServer: (threads: ChatThread[]) => void;
    addServerThread: (thread: ChatThread) => void;
    loadThreadMessages: (threadId: string, messages: ChatMessage[]) => void;
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

  // 새로운 사용자 데이터 로드 함수
  const loadUserData = async (_user: any) => {
    try {
      console.log('🔄 사용자 데이터 로드 시작');
      dispatch({ type: 'SET_LOADING', payload: true });

      // AI 서비스를 동적으로 import (순환 참조 방지)
      const { aiService } = await import('../services/aiService');
      const { getAllVersions, reconstructFromVersions } = await import('../services/versioning');

      // 스레드 목록 로드
      console.log('📋 스레드 목록 로드 중...');
      const threadsResponse = await aiService.getThreads();
      console.log('📋 스레드 응답:', threadsResponse);
      
      if (threadsResponse.status === 'success' && threadsResponse.data.threads) {
        const serverThreads = threadsResponse.data.threads.map(thread => ({
          id: thread.id,
          title: thread.title,
          messages: [], // 메시지는 나중에 로드
          createdAt: new Date(thread.created_at),
          updatedAt: new Date(thread.updated_at)
        }));

        dispatch({ type: 'LOAD_THREADS_FROM_SERVER', payload: serverThreads });

        // 가장 최근 스레드를 현재 스레드로 설정
        if (serverThreads.length > 0) {
          const latestThread = serverThreads[0];
          dispatch({ type: 'SET_CURRENT_THREAD', payload: latestThread.id });

          // 최신 스레드의 메시지 로드
          try {
            const messagesResponse = await aiService.getThreadMessages(latestThread.id);
            if (messagesResponse.status === 'success' && messagesResponse.data.messages) {
              const serverMessages = messagesResponse.data.messages.map(msg => ({
                id: msg.id,
                type: msg.message_type as 'user' | 'assistant',
                content: msg.message,
                timestamp: new Date(msg.created_at),
                status: (msg.status as any) || 'completed'
              }));

              dispatch({ type: 'LOAD_THREAD_MESSAGES', payload: { 
                threadId: latestThread.id, 
                messages: serverMessages 
              }});
            }
          } catch (error) {
            console.error('메시지 로드 실패:', error);
          }

          // 코드 히스토리 전체 로드
          try {
            const currentSiteCode = await aiService.getCurrentSiteCode();
            console.log('🌐 현재 사이트 코드:', currentSiteCode);
            
            if (currentSiteCode) {
              // 모든 버전 가져오기
              const allVersions = await getAllVersions(currentSiteCode);
              console.log('📝 모든 코드 버전:', allVersions.length, '개');
              
              if (allVersions.length > 0) {
                // 버전들을 히스토리로 재구성
                const reconstructedSteps = reconstructFromVersions(allVersions);
                console.log('🔄 재구성된 히스토리 스텝:', reconstructedSteps.length, '개');
                
                // 히스토리 스택 초기화 후 재구성
                dispatch({ type: 'CLEAR_CODE_HISTORY' });
                
                reconstructedSteps.forEach((step, index) => {
                  dispatch({ type: 'PUSH_CODE_HISTORY', payload: {
                    javascript: step.javascript,
                    css: step.css,
                    description: `버전 ${index + 1}`,
                    isSuccessful: true
                  }});
                });
                
                // 최신 코드를 에디터에 설정
                const latestStep = reconstructedSteps[reconstructedSteps.length - 1];
                if (latestStep) {
                  dispatch({ type: 'SET_EDITOR_CODE', payload: { language: 'javascript', code: latestStep.javascript } });
                  dispatch({ type: 'SET_EDITOR_CODE', payload: { language: 'css', code: latestStep.css } });
                }
              } else {
                console.log('📝 코드 버전 없음');
              }
            }
          } catch (error) {
            console.error('코드 버전 로드 실패:', error);
          }
        }
      }
    } catch (error) {
      console.error('사용자 데이터 로드 실패:', error);
      dispatch({ type: 'SET_ERROR', payload: '사용자 데이터를 로드할 수 없습니다.' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  // 초기 로딩 시 인증된 사용자 데이터 로드
  useEffect(() => {
    const loadInitialUserData = async () => {
      try {
        console.log('🚀 초기 사용자 데이터 로드 시도');
        // Supabase에서 현재 세션 확인
        const { supabase } = await import('../services/supabase');
        const { data: { session } } = await supabase.auth.getSession();
        
        console.log('🔐 현재 세션:', session?.user?.id ? `사용자 ${session.user.id}` : '로그인 안됨');
        
        if (session?.user) {
          console.log('👤 로그인된 사용자 발견, 데이터 로드 시작');
          await loadUserData(session.user);
        } else {
          console.log('❌ 로그인된 사용자 없음');
        }
      } catch (error) {
        console.error('초기 사용자 데이터 로드 실패:', error);
      }
    };

    loadInitialUserData();
  }, []);

  // 사용자 변경 이벤트 리스너
  useEffect(() => {
    const handleUserChange = (event: CustomEvent) => {
      const { action, user } = event.detail;
      console.log('📱 AppContext 사용자 변경 이벤트:', action, user?.id);
      
      if (action === 'logout') {
        // 로그아웃 시 모든 사용자 관련 상태 초기화
        console.log('🗑️ AppContext 상태 초기화 (로그아웃)');
        dispatch({ type: 'RESET_STATE' });
      } else if (action === 'login' || action === 'switch') {
        // 로그인/사용자 전환 시 상태 초기화 후 새 데이터 로드
        console.log('🗑️ AppContext 상태 초기화 (로그인/전환)');
        dispatch({ type: 'RESET_STATE' });
        loadUserData(user);
      }
    };

    window.addEventListener('auth:user-changed', handleUserChange as EventListener);
    
    return () => {
      window.removeEventListener('auth:user-changed', handleUserChange as EventListener);
    };
  }, []);

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
    setCurrentThread: (threadId: string | null) => dispatch({ type: 'SET_CURRENT_THREAD', payload: threadId }),
    addMessageToThread: (threadId: string, message: ChatMessage) => dispatch({ type: 'ADD_MESSAGE_TO_THREAD', payload: { threadId, message } }),
    updateMessageInThread: (threadId: string, messageId: string, message: ChatMessage) => dispatch({ type: 'UPDATE_MESSAGE_IN_THREAD', payload: { threadId, messageId, message } }),
    deleteThread: (threadId: string) => dispatch({ type: 'DELETE_THREAD', payload: threadId }),
    updateThreadTitle: (threadId: string, title: string) => dispatch({ type: 'UPDATE_THREAD_TITLE', payload: { threadId, title } }),
    setAiLoading: (loading: boolean) => dispatch({ type: 'SET_AI_LOADING', payload: loading }),
    resetState: () => dispatch({ type: 'RESET_STATE' }),
    // 서버 연동용 액션들
    loadThreadsFromServer: (threads: ChatThread[]) => dispatch({ type: 'LOAD_THREADS_FROM_SERVER', payload: threads }),
    addServerThread: (thread: ChatThread) => dispatch({ type: 'ADD_SERVER_THREAD', payload: thread }),
    loadThreadMessages: (threadId: string, messages: ChatMessage[]) => dispatch({ type: 'LOAD_THREAD_MESSAGES', payload: { threadId, messages } }),
  }), [dispatch]);

  const computed = useMemo(() => {
    const currentThread = state.currentThreadId ? state.chatThreads.find(thread => thread.id === state.currentThreadId) || null : null;
    return {
      currentThread,
      currentMessages: currentThread?.messages || [],
    };
  }, [state.currentThreadId, state.chatThreads]);

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