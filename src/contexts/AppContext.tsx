import React, { createContext, useContext, useReducer, ReactNode, useMemo, useEffect, useRef } from 'react';
import { aiService } from '../services/aiService';
import { supabase } from '../services/supabase';
import {
  CodeFile,
  createEmptyFile,
  cloneFiles,
  filesToLanguageString,
  applyLanguageStringToFiles,
  mergeLanguageSources,
  mergeBundleIntoFiles,
  computeActiveOutput,
  hasUnsavedFiles,
  ensureUniqueName,
  markDraft,
  saveFileDraft,
  normaliseOrder,
} from '../utils/codeFiles';
import { SiteIntegrationService } from '../services/siteIntegration';

export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  status?: 'pending' | 'in_progress' | 'completed' | 'failed'; // 메시지 상태
  // 서버에서 전달되는 부가 정보
  metadata?: any;
  cost_usd?: number;
  ai_model?: string;
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
      file_id: string;
      diff: string;
    };
    css?: {
      file_id: string;
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
  activeTab: 'code' | 'chat' | 'user';
  isLoading: boolean;
  error: string | null;
  isPreviewMode: boolean;
  isRestoring: boolean;
  isCreatingSnapshot: boolean;
  hasSnapshot: boolean;
  selectedSiteCode: string | null;
  codeFiles: CodeFile[];
  selectedFileId: string | null;
  serverCode: {
    draftScript: string | null;
    draftCss: string | null;
    deployedScript: string | null;
    deployedCss: string | null;
  };
  editorCode: {
    javascript: string;
    css: string;
  };
  codeHistoryStack: Array<{
    files: CodeFile[];
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
  | { type: 'SET_ACTIVE_TAB'; payload: 'code' | 'chat' | 'user' }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_PREVIEW_MODE'; payload: boolean }
  | { type: 'TOGGLE_PREVIEW_MODE' }
  | { type: 'SET_RESTORING'; payload: boolean }
  | { type: 'SET_CREATING_SNAPSHOT'; payload: boolean }
  | { type: 'SET_HAS_SNAPSHOT'; payload: boolean }
  | { type: 'SET_SELECTED_SITE_CODE'; payload: string | null }
  | { type: 'SET_SELECTED_FILE'; payload: string | null }
  | { type: 'SET_CODE_FILES'; payload: CodeFile[] }
  | { type: 'UPDATE_FILE_DRAFT'; payload: { fileId: string; language: 'javascript' | 'css'; code: string } }
  | { type: 'SAVE_FILE'; payload: { fileId: string; description?: string } }
  | { type: 'SAVE_ALL_FILES'; payload?: { description?: string } }
  | { type: 'CREATE_FILE'; payload?: { name?: string } }
  | { type: 'DELETE_FILE'; payload: { fileId: string } }
  | { type: 'RENAME_FILE'; payload: { fileId: string; name: string } }
  | { type: 'SET_FILE_ACTIVE'; payload: { fileId: string; isActive: boolean } }
  | { type: 'SET_EDITOR_CODE'; payload: { language: 'javascript' | 'css'; code: string } }
  | { type: 'SET_SERVER_CODE'; payload: { draftScript: string | null; draftCss: string | null; deployedScript: string | null; deployedCss: string | null } }
  | { type: 'APPLY_BUNDLE'; payload: { bundle: string } }
  | { type: 'PUSH_CODE_HISTORY'; payload: {
      files: CodeFile[];
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

const getInitialState = (): AppState => {
  const initialFile = createEmptyFile(1, 'main');
  const files = normaliseOrder([{ ...initialFile }]);
  const editorCode = buildEditorCode(files);

  return {
    activeTab: 'chat',
    isLoading: false,
    error: null,
    isPreviewMode: false,
    isRestoring: false,
    isCreatingSnapshot: false,
  hasSnapshot: false,
  selectedSiteCode: null,
  codeFiles: files,
  selectedFileId: resolveSelectedFileId(files, null),
  serverCode: {
    draftScript: null,
    draftCss: null,
    deployedScript: null,
    deployedCss: null,
  },
  editorCode,
    codeHistoryStack: [{
      files: cloneFiles(files),
      timestamp: new Date(),
      description: 'Initial state',
    }],
    currentHistoryIndex: 0,
    lastAppliedChange: null,
    chatThreads: [],
    currentThreadId: null,
    isAiLoading: false,
  };
};


const resolveSelectedFileId = (files: CodeFile[], preferredId: string | null): string | null => {
  if (!files.length) return null;
  if (preferredId && files.some(file => file.id === preferredId)) return preferredId;
  return files[0].id;
};

const buildEditorCode = (files: CodeFile[]) => ({
  javascript: filesToLanguageString(files, 'javascript', true, true),
  css: filesToLanguageString(files, 'css', true, true),
});

const initialState = getInitialState();


function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_ACTIVE_TAB':
      return { ...state, activeTab: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'TOGGLE_PREVIEW_MODE':
      return { 
        ...state, 
        isPreviewMode: !state.isPreviewMode,
        // 프리뷰 모드를 끄면 스냅샷도 없어짐
        hasSnapshot: state.isPreviewMode ? false : state.hasSnapshot
      };
    case 'SET_RESTORING':
      return { ...state, isRestoring: action.payload };
    case 'SET_CREATING_SNAPSHOT':
      return { ...state, isCreatingSnapshot: action.payload };
    case 'SET_HAS_SNAPSHOT':
      return { ...state, hasSnapshot: action.payload };
    case 'SET_SELECTED_SITE_CODE':
      return { ...state, selectedSiteCode: action.payload };
    case 'SET_SELECTED_FILE':
      return { ...state, selectedFileId: action.payload };
    case 'SET_CODE_FILES': {
      const normalised = normaliseOrder(action.payload.map(file => ({ ...file })));
      return {
        ...state,
        codeFiles: normalised,
        editorCode: buildEditorCode(normalised),
        selectedFileId: resolveSelectedFileId(normalised, state.selectedFileId),
      };
    }
    case 'SET_SERVER_CODE':
      return {
        ...state,
        serverCode: {
          draftScript: action.payload.draftScript,
          draftCss: action.payload.draftCss,
          deployedScript: action.payload.deployedScript,
          deployedCss: action.payload.deployedCss,
        },
      };
    case 'UPDATE_FILE_DRAFT': {
      const files = state.codeFiles.map(file =>
        file.id === action.payload.fileId
          ? markDraft(file, action.payload.language, action.payload.code)
          : file
      );
      return { ...state, codeFiles: files };
    }
    case 'SAVE_FILE': {
      const original = state.codeFiles.find(file => file.id === action.payload.fileId);
      if (!original || !original.hasUnsavedChanges) {
        return state;
      }
      const files = state.codeFiles.map(file =>
        file.id === action.payload.fileId ? saveFileDraft(file) : file
      );
      const normalised = normaliseOrder(files);
      const savedFile = normalised.find(file => file.id === action.payload.fileId);
      const description = action.payload.description || (savedFile ? `Saved ${savedFile.name}` : 'Saved file');
      const newHistoryItem = {
        files: cloneFiles(normalised),
        timestamp: new Date(),
        description,
        isSuccessful: true,
      };
      const newStack = state.codeHistoryStack.slice(0, state.currentHistoryIndex + 1);
      newStack.push(newHistoryItem);
      return {
        ...state,
        codeFiles: normalised,
        editorCode: buildEditorCode(normalised),
        codeHistoryStack: newStack,
        currentHistoryIndex: newStack.length - 1,
        lastAppliedChange: null,
        selectedFileId: resolveSelectedFileId(normalised, action.payload.fileId),
      };
    }
    case 'SAVE_ALL_FILES': {
      const hasDirty = state.codeFiles.some(file => file.hasUnsavedChanges);
      if (!hasDirty) return state;
      const files = state.codeFiles.map(saveFileDraft);
      const normalised = normaliseOrder(files);
      const newHistoryItem = {
        files: cloneFiles(normalised),
        timestamp: new Date(),
        description: action.payload?.description || 'Saved all files',
        isSuccessful: true,
      };
      const newStack = state.codeHistoryStack.slice(0, state.currentHistoryIndex + 1);
      newStack.push(newHistoryItem);
      return {
        ...state,
        codeFiles: normalised,
        editorCode: buildEditorCode(normalised),
        codeHistoryStack: newStack,
        currentHistoryIndex: newStack.length - 1,
        lastAppliedChange: null,
        selectedFileId: resolveSelectedFileId(normalised, state.selectedFileId),
      };
    }
    case 'CREATE_FILE': {
      const desired = (action.payload?.name || '').trim() || 'feature';
      const uniqueName = ensureUniqueName(state.codeFiles, desired);
      const baseFile = createEmptyFile(state.codeFiles.length + 1, uniqueName);
      const newFile = { ...baseFile, name: uniqueName };
      const files = normaliseOrder([...state.codeFiles, newFile]);
      return {
        ...state,
        codeFiles: files,
        editorCode: buildEditorCode(files),
        selectedFileId: newFile.id,
      };
    }
    case 'DELETE_FILE': {
      const remaining = state.codeFiles.filter(file => file.id !== action.payload.fileId);
      const nextFiles = remaining.length > 0 ? remaining : [createEmptyFile(1, 'main')];
      const normalised = normaliseOrder(nextFiles);
      const nextSelected = resolveSelectedFileId(normalised, state.selectedFileId === action.payload.fileId ? null : state.selectedFileId);
      return {
        ...state,
        codeFiles: normalised,
        editorCode: buildEditorCode(normalised),
        selectedFileId: nextSelected,
      };
    }
    case 'RENAME_FILE': {
      const desired = action.payload.name.trim();
      if (!desired) return state;
      const others = state.codeFiles.filter(file => file.id !== action.payload.fileId);
      const uniqueName = ensureUniqueName(others, desired);
      const files = state.codeFiles.map(file =>
        file.id === action.payload.fileId ? { ...file, name: uniqueName } : file
      );
      const normalised = normaliseOrder(files);
      return {
        ...state,
        codeFiles: normalised,
        editorCode: buildEditorCode(normalised),
      };
    }
    case 'SET_FILE_ACTIVE': {
      const files = state.codeFiles.map(file =>
        file.id === action.payload.fileId ? { ...file, isActive: action.payload.isActive } : file
      );
      const normalised = normaliseOrder(files);
      return {
        ...state,
        codeFiles: normalised,
        editorCode: buildEditorCode(normalised),
      };
    }
    case 'SET_EDITOR_CODE': {
      const updated = applyLanguageStringToFiles(state.codeFiles, action.payload.code, action.payload.language);
      const normalised = normaliseOrder(updated);
      return {
        ...state,
        codeFiles: normalised,
        editorCode: buildEditorCode(normalised),
      };
    }
    case 'APPLY_BUNDLE': {
      const merged = mergeBundleIntoFiles(state.codeFiles, action.payload.bundle);
      const normalised = normaliseOrder(merged);
      return {
        ...state,
        codeFiles: normalised,
        editorCode: buildEditorCode(normalised),
        selectedFileId: resolveSelectedFileId(normalised, state.selectedFileId),
      };
    }
    case 'PUSH_CODE_HISTORY': {
      const snapshot = cloneFiles(normaliseOrder(action.payload.files));
      const newHistoryItem = {
        files: snapshot,
        messageId: action.payload.messageId,
        timestamp: new Date(),
        description: action.payload.description || 'AI 코드 적용',
        changeSummary: action.payload.changeSummary,
        isSuccessful: action.payload.isSuccessful ?? true,
      };
      const newStack = state.codeHistoryStack.slice(0, state.currentHistoryIndex + 1);
      newStack.push(newHistoryItem);
      return {
        ...state,
        codeHistoryStack: newStack,
        currentHistoryIndex: newStack.length - 1,
      };
    }
    case 'GO_BACK_HISTORY': {
      if (state.currentHistoryIndex > 0) {
        const newIndex = state.currentHistoryIndex - 1;
        const targetHistory = state.codeHistoryStack[newIndex];
        const files = cloneFiles(targetHistory.files);
        const normalised = normaliseOrder(files);
        return {
          ...state,
          codeFiles: normalised,
          editorCode: buildEditorCode(normalised),
          currentHistoryIndex: newIndex,
          lastAppliedChange: targetHistory.messageId
            ? { messageId: targetHistory.messageId, timestamp: targetHistory.timestamp }
            : null,
          selectedFileId: resolveSelectedFileId(normalised, state.selectedFileId),
        };
      }
      return state;
    }
    case 'GO_FORWARD_HISTORY': {
      if (state.currentHistoryIndex < state.codeHistoryStack.length - 1) {
        const newIndex = state.currentHistoryIndex + 1;
        const targetHistory = state.codeHistoryStack[newIndex];
        const files = cloneFiles(targetHistory.files);
        const normalised = normaliseOrder(files);
        return {
          ...state,
          codeFiles: normalised,
          editorCode: buildEditorCode(normalised),
          currentHistoryIndex: newIndex,
          lastAppliedChange: targetHistory.messageId
            ? { messageId: targetHistory.messageId, timestamp: targetHistory.timestamp }
            : null,
          selectedFileId: resolveSelectedFileId(normalised, state.selectedFileId),
        };
      }
      return state;
    }
    case 'SET_LAST_APPLIED_CHANGE':
      return {
        ...state,
        lastAppliedChange: action.payload
      };
    case 'CLEAR_CODE_HISTORY':
      return {
        ...state,
        codeHistoryStack: [{
          files: cloneFiles(state.codeFiles),
          timestamp: new Date(),
          description: '히스토리 초기화',
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
    setActiveTab: (tab: 'code' | 'chat' | 'user') => void;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    togglePreviewMode: () => void;
    setCreatingSnapshot: (creating: boolean) => void;
    setHasSnapshot: (hasSnapshot: boolean) => void;
    setSelectedSiteCode: (siteCode: string | null) => void;
    setSelectedFile: (fileId: string | null) => void;
    updateFileDraft: (fileId: string, language: 'javascript' | 'css', code: string) => void;
    saveFile: (fileId: string, description?: string) => void;
    saveAllFiles: (description?: string) => void;
    createFile: (name?: string) => void;
    deleteFile: (fileId: string) => void;
    renameFile: (fileId: string, name: string) => void;
    setFileActive: (fileId: string, isActive: boolean) => void;
    setEditorCode: (language: 'javascript' | 'css', code: string) => void;
    setServerCode: (draftScript: string | null, draftCss: string | null, deployedScript: string | null, deployedCss: string | null) => void;
    // 코드 변경 히스토리 관련 액션들 (브라우저 스타일)
    pushCodeHistory: (history: {
      files: CodeFile[];
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
    loadSiteHistory: (siteCode: string) => Promise<void>;
  };
  computed: {
    currentThread: ChatThread | null;
    currentMessages: ChatMessage[];
    selectedFile: CodeFile | null;
    hasUnsavedFiles: boolean;
    hasPendingDeployment: boolean;
    activeJavascript: string;
    activeCss: string;
    draftScript: string;
    draftCss: string;
    deployedScript: string;
    deployedCss: string;
  };
}

// 선택된 사이트의 코드를 서버에서 로드
const loadSiteHistory = async (siteCode: string, dispatch: React.Dispatch<AppAction>, _currentState: AppState) => {
  try {
    const siteService = SiteIntegrationService.getInstance();
    dispatch({ type: 'SET_RESTORING', payload: true });

    const response = await siteService.getSiteScripts(siteCode);
    const deployedScript = (response?.script_content ?? '').toString();
    const deployedCss = (response?.css_content ?? '').toString();
    const draftScript = (response?.draft_script_content ?? deployedScript ?? '').toString();
    const draftCss = (response?.draft_css_content ?? deployedCss ?? '').toString();

    let files = mergeLanguageSources(draftScript, draftCss).map(file => ({
      ...file,
      savedJavascript: file.savedJavascript ?? '',
      draftJavascript: file.draftJavascript ?? file.savedJavascript ?? '',
      savedCss: file.savedCss ?? '',
      draftCss: file.draftCss ?? file.savedCss ?? '',
      hasUnsavedChanges: false,
    }));

    if (files.length === 0) {
      const base = createEmptyFile(1, 'main');
      files = normaliseOrder([
        {
          ...base,
          name: 'main',
          savedJavascript: draftScript,
          draftJavascript: draftScript,
          savedCss: draftCss,
          draftCss: draftCss,
          hasUnsavedChanges: false,
        },
      ]);
    } else {
      files = normaliseOrder(files);
    }

    dispatch({ type: 'SET_CODE_FILES', payload: files });
    dispatch({
      type: 'SET_SERVER_CODE',
      payload: {
        draftScript,
        draftCss,
        deployedScript,
        deployedCss,
      },
    });
    dispatch({ type: 'CLEAR_CODE_HISTORY' });
  } catch (error) {
    console.error('💥 [loadSiteHistory] 코드 로드 실패:', error);
    throw error;
  } finally {
    dispatch({ type: 'SET_RESTORING', payload: false });
  }
};

const AppContext = createContext<AppContextType | undefined>(undefined);

interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // 새로운 사용자 데이터 로드 함수
  const loadUserData = async (_user: any) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });

      // 스레드 목록 로드
      const threadsResponse = await aiService.getThreads();
      
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
              // ThreadManager와 동일한 변환 로직으로 metadata.changes 및 image_data 복원
              const serverMessages = messagesResponse.data.messages.map((msg) => {
                const images: string[] | undefined = (() => {
                  try {
                    if (!msg.image_data) return undefined;
                    const raw = msg.image_data as any;
                    if (typeof raw === 'string') {
                      const parsed = (() => { try { return JSON.parse(raw); } catch { return null; } })();
                      if (Array.isArray(parsed)) return parsed.filter(Boolean);
                      if (typeof parsed === 'string' && parsed.trim()) return [parsed];
                      if (raw.trim()) return [raw];
                      return undefined;
                    }
                    if (Array.isArray(raw)) return raw.filter(Boolean);
                    if ((raw as any).images && Array.isArray((raw as any).images)) return (raw as any).images.filter(Boolean);
                    return undefined;
                  } catch (e) {
                    console.warn('image_data 파싱 실패:', e);
                    return undefined;
                  }
                })();

                const changes = (() => {
                  try {
                    const meta = (msg as any).metadata;
                    if (!meta) return undefined;
                    const metadata = typeof meta === 'string' ? JSON.parse(meta) : meta;
                    return metadata.changes || undefined;
                  } catch (error) {
                    console.warn('메타데이터 파싱 실패:', error);
                    return undefined;
                  }
                })();

                const serverStatus = (msg.status as 'pending' | 'in_progress' | 'completed' | 'error') || 'completed';

                return {
                  id: msg.id,
                  type: msg.message_type as 'user' | 'assistant',
                  content: msg.message,
                  timestamp: new Date(msg.created_at),
                  status: (serverStatus === 'error' ? 'failed' : serverStatus) as 'pending' | 'in_progress' | 'completed' | 'failed',
                  changes,
                  cost_usd: (typeof (msg as any).cost_usd === 'number'
                    ? (msg as any).cost_usd
                    : (() => {
                        try {
                          const meta = (msg as any).metadata;
                          const m = typeof meta === 'string' ? JSON.parse(meta) : meta;
                          const cost = m?.token_usage?.total_cost_usd;
                          return typeof cost === 'number' ? cost : undefined;
                        } catch {
                          return undefined;
                        }
                      })()),
                  ai_model: ((msg as any).ai_model
                    ? (msg as any).ai_model
                    : (() => {
                        try {
                          const meta = (msg as any).metadata;
                          const m = typeof meta === 'string' ? JSON.parse(meta) : meta;
                          return m?.token_usage?.model_name || undefined;
                        } catch {
                          return undefined;
                        }
                      })()),
                  images,
                } as ChatMessage;
              });

              dispatch({ type: 'LOAD_THREAD_MESSAGES', payload: { 
                threadId: latestThread.id, 
                messages: serverMessages 
              }});
            }
          } catch (error) {
            console.error('메시지 로드 실패:', error);
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

  // 초기 로딩 상태 추적
  const initialLoadRef = useRef(false);
  
  // 초기 로딩 시 인증된 사용자 데이터 로드
  useEffect(() => {
    const loadInitialUserData = async () => {
      try {
        if (initialLoadRef.current) {
          return;
        }
        
        initialLoadRef.current = true;
        
        // Supabase에서 현재 세션 확인
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('❌ [AppContext] 세션 확인 실패:', sessionError);
          return;
        }
        
        
        if (session?.user) {
          
          await loadUserData(session.user);
          
        } else {
        }
      } catch (error) {
        console.error('💥 [AppContext] 초기 사용자 데이터 로드 실패:', error);
        console.error('💥 [AppContext] 에러 스택:', error instanceof Error ? error.stack : 'No stack trace');
      }
    };

    // 약간의 지연을 두고 실행 (다른 초기화와의 충돌 방지)
    setTimeout(loadInitialUserData, 100);
  }, []); // 초기화는 한 번만

  // 사용자 변경 이벤트 리스너
  useEffect(() => {
    const handleUserChange = (event: CustomEvent) => {
      const { action, user } = event.detail;
      
      if (action === 'logout') {
        // 로그아웃 시 모든 사용자 관련 상태 초기화
        dispatch({ type: 'RESET_STATE' });
        initialLoadRef.current = false; // 초기화 플래그 리셋
      } else if (action === 'login' || action === 'switch') {
        // 초기 로딩이 이미 완료되었다면 사용자 변경 이벤트에서만 처리
        if (initialLoadRef.current) {
          dispatch({ type: 'RESET_STATE' });
          loadUserData(user);
        } else {
        }
      }
    };

    window.addEventListener('auth:user-changed', handleUserChange as EventListener);
    
    return () => {
      window.removeEventListener('auth:user-changed', handleUserChange as EventListener);
    };
  }, []);

  // 선택된 사이트 코드가 변경될 때 자동으로 히스토리 로드
  useEffect(() => {
    if (state.selectedSiteCode) {
      const loadHistoryForSelectedSite = async () => {
        try {
          await loadSiteHistory(state.selectedSiteCode!, dispatch, state);
        } catch (error) {
          console.error('❌ [AppContext] 선택된 사이트 히스토리 로드 실패:', error);
        }
      };
      
      loadHistoryForSelectedSite();
    }
  }, [state.selectedSiteCode]);

  const actions = useMemo(() => ({
    setActiveTab: (tab: 'code' | 'chat' | 'user') => dispatch({ type: 'SET_ACTIVE_TAB', payload: tab }),
    setLoading: (loading: boolean) => dispatch({ type: 'SET_LOADING', payload: loading }),
    setError: (error: string | null) => dispatch({ type: 'SET_ERROR', payload: error }),
    togglePreviewMode: () => dispatch({ type: 'TOGGLE_PREVIEW_MODE' }),
    setRestoring: (restoring: boolean) => dispatch({ type: 'SET_RESTORING', payload: restoring }),
    setCreatingSnapshot: (creating: boolean) => dispatch({ type: 'SET_CREATING_SNAPSHOT', payload: creating }),
    setHasSnapshot: (hasSnapshot: boolean) => dispatch({ type: 'SET_HAS_SNAPSHOT', payload: hasSnapshot }),
    setSelectedSiteCode: (siteCode: string | null) => dispatch({ type: 'SET_SELECTED_SITE_CODE', payload: siteCode }),
    setSelectedFile: (fileId: string | null) => dispatch({ type: 'SET_SELECTED_FILE', payload: fileId }),
    updateFileDraft: (fileId: string, language: 'javascript' | 'css', code: string) =>
      dispatch({ type: 'UPDATE_FILE_DRAFT', payload: { fileId, language, code } }),
    saveFile: (fileId: string, description?: string) =>
      dispatch({ type: 'SAVE_FILE', payload: { fileId, description } }),
    saveAllFiles: (description?: string) =>
      dispatch({ type: 'SAVE_ALL_FILES', payload: { description } }),
    createFile: (name?: string) => dispatch({ type: 'CREATE_FILE', payload: { name } }),
    deleteFile: (fileId: string) => dispatch({ type: 'DELETE_FILE', payload: { fileId } }),
    renameFile: (fileId: string, name: string) => dispatch({ type: 'RENAME_FILE', payload: { fileId, name } }),
    setFileActive: (fileId: string, isActive: boolean) =>
      dispatch({ type: 'SET_FILE_ACTIVE', payload: { fileId, isActive } }),
    setEditorCode: (language: 'javascript' | 'css', code: string) =>
      dispatch({ type: 'SET_EDITOR_CODE', payload: { language, code } }),
    setServerCode: (draftScript: string | null, draftCss: string | null, deployedScript: string | null, deployedCss: string | null) =>
      dispatch({ type: 'SET_SERVER_CODE', payload: { draftScript, draftCss, deployedScript, deployedCss } }),
    pushCodeHistory: (history: {
      files: CodeFile[];
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
    setLastAppliedChange: (messageId: string, timestamp: Date) =>
      dispatch({ type: 'SET_LAST_APPLIED_CHANGE', payload: { messageId, timestamp } }),
    clearCodeHistory: () => dispatch({ type: 'CLEAR_CODE_HISTORY' }),
    createNewThread: (title?: string) => dispatch({ type: 'CREATE_NEW_THREAD', payload: title }),
    setCurrentThread: (threadId: string | null) => dispatch({ type: 'SET_CURRENT_THREAD', payload: threadId }),
    addMessageToThread: (threadId: string, message: ChatMessage) =>
      dispatch({ type: 'ADD_MESSAGE_TO_THREAD', payload: { threadId, message } }),
    updateMessageInThread: (threadId: string, messageId: string, message: ChatMessage) =>
      dispatch({ type: 'UPDATE_MESSAGE_IN_THREAD', payload: { threadId, messageId, message } }),
    deleteThread: (threadId: string) => dispatch({ type: 'DELETE_THREAD', payload: threadId }),
    updateThreadTitle: (threadId: string, title: string) => dispatch({ type: 'UPDATE_THREAD_TITLE', payload: { threadId, title } }),
    setAiLoading: (loading: boolean) => dispatch({ type: 'SET_AI_LOADING', payload: loading }),
    resetState: () => dispatch({ type: 'RESET_STATE' }),
    loadThreadsFromServer: (threads: ChatThread[]) => dispatch({ type: 'LOAD_THREADS_FROM_SERVER', payload: threads }),
    addServerThread: (thread: ChatThread) => dispatch({ type: 'ADD_SERVER_THREAD', payload: thread }),
    loadThreadMessages: (threadId: string, messages: ChatMessage[]) =>
      dispatch({ type: 'LOAD_THREAD_MESSAGES', payload: { threadId, messages } }),
    loadSiteHistory: async (siteCode: string) => {
      dispatch({ type: 'SET_SELECTED_SITE_CODE', payload: siteCode });
    },
  }), [dispatch]);
  const computed = useMemo(() => {
    const currentThread = state.currentThreadId
      ? state.chatThreads.find(thread => thread.id === state.currentThreadId) || null
      : null;
    const selectedFile = state.selectedFileId
      ? state.codeFiles.find(file => file.id === state.selectedFileId) || null
      : null;
    const draftActiveOutput = computeActiveOutput(state.codeFiles, true);
    const draftScript = filesToLanguageString(state.codeFiles, 'javascript', true, true);
    const draftCss = filesToLanguageString(state.codeFiles, 'css', true, true);
    const deployedScript = state.serverCode.deployedScript || '';
    const deployedCss = state.serverCode.deployedCss || '';
    const normalize = (value: string | null | undefined) => (value || '').trim();
    const hasPendingDeployment = normalize(draftScript) !== normalize(deployedScript)
      || normalize(draftCss) !== normalize(deployedCss);
    return {
      currentThread,
      currentMessages: currentThread?.messages || [],
      selectedFile,
      hasUnsavedFiles: hasUnsavedFiles(state.codeFiles),
      hasPendingDeployment,
      activeJavascript: draftActiveOutput.javascript,
      activeCss: draftActiveOutput.css,
      draftScript,
      draftCss,
      deployedScript,
      deployedCss,
    };
  }, [state.currentThreadId, state.chatThreads, state.codeFiles, state.selectedFileId, state.serverCode]);

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
