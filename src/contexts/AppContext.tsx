import React, { createContext, useContext, useReducer, ReactNode, useMemo } from 'react';
import { FileItem } from '../types/file';

export interface AppState {
  isOpen: boolean;
  activeTab: 'code' | 'chat' | 'user' | 'filelist';
  width: number;
  isLoading: boolean;
  error: string | null;
  files: FileItem[];
  expandedFiles: Set<string>;
  selectedFileId: string | null;
  selectedVersionId: string | null;
  isPreviewMode: boolean;
  editorCode: {
    javascript: string;
    css: string;
  };
}

export type AppAction = 
  | { type: 'TOGGLE_PANEL' }
  | { type: 'OPEN_PANEL' }
  | { type: 'CLOSE_PANEL' }
  | { type: 'SET_ACTIVE_TAB'; payload: 'code' | 'chat' | 'user'| 'filelist' }
  | { type: 'SET_WIDTH'; payload: number }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_FILES'; payload: FileItem[] }
  | { type: 'TOGGLE_FILE_APPLIED'; payload: string }
  | { type: 'SET_PRIMARY_VERSION'; payload: { fileId: string; versionId: string } }
  | { type: 'TOGGLE_FILE_EXPANSION'; payload: string }
  | { type: 'SELECT_FILE'; payload: { fileId: string; versionId?: string } }
  | { type: 'TOGGLE_PREVIEW_MODE' }
  | { type: 'SET_EDITOR_CODE'; payload: { language: 'javascript' | 'css'; code: string } }
  | { type: 'RESET_STATE' };

const initialState: AppState = {
  isOpen: false,
  activeTab: 'code',
  width: 400,
  isLoading: false,
  error: null,
  files: [],
  expandedFiles: new Set(),
  selectedFileId: null,
  selectedVersionId: null,
  isPreviewMode: false,
  editorCode: {
    javascript: '// JavaScript code goes here',
    css: '/* CSS Styles */'
  },
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
    case 'SET_FILES':
      return { ...state, files: action.payload };
    case 'TOGGLE_FILE_APPLIED':
      return {
        ...state,
        files: state.files.map(file => 
          file.id === action.payload 
            ? { ...file, isApplied: !file.isApplied } 
            : file
        )
      };
    case 'SET_PRIMARY_VERSION':
      return {
        ...state,
        files: state.files.map(file => 
          file.id === action.payload.fileId 
            ? { ...file, primaryVersionId: action.payload.versionId } 
            : file
        )
      };
    case 'TOGGLE_FILE_EXPANSION':
      const newExpanded = new Set(state.expandedFiles);
      if (newExpanded.has(action.payload)) {
        newExpanded.delete(action.payload);
      } else {
        newExpanded.add(action.payload);
      }
      return { ...state, expandedFiles: newExpanded };
    case 'SELECT_FILE':
      return {
        ...state,
        selectedFileId: action.payload.fileId,
        selectedVersionId: action.payload.versionId || null
      };
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
    case 'RESET_STATE':
      return initialState;
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
    setActiveTab: (tab: 'code' | 'chat' | 'user' | 'filelist') => void;
    setWidth: (width: number) => void;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    setFiles: (files: FileItem[]) => void;
    toggleFileApplied: (fileId: string) => void;
    setPrimaryVersion: (fileId: string, versionId: string) => void;
    toggleFileExpansion: (fileId: string) => void;
    selectFile: (fileId: string, versionId?: string) => void;
    togglePreviewMode: () => void;
    setEditorCode: (language: 'javascript' | 'css', code: string) => void;
    resetState: () => void;
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
    setActiveTab: (tab: 'code' | 'chat' | 'user' | 'filelist') => dispatch({ type: 'SET_ACTIVE_TAB', payload: tab }),
    setWidth: (width: number) => dispatch({ type: 'SET_WIDTH', payload: width }),
    setLoading: (loading: boolean) => dispatch({ type: 'SET_LOADING', payload: loading }),
    setError: (error: string | null) => dispatch({ type: 'SET_ERROR', payload: error }),
    setFiles: (files: FileItem[]) => dispatch({ type: 'SET_FILES', payload: files }),
    toggleFileApplied: (fileId: string) => dispatch({ type: 'TOGGLE_FILE_APPLIED', payload: fileId }),
    setPrimaryVersion: (fileId: string, versionId: string) => dispatch({ type: 'SET_PRIMARY_VERSION', payload: { fileId, versionId } }),
    toggleFileExpansion: (fileId: string) => dispatch({ type: 'TOGGLE_FILE_EXPANSION', payload: fileId }),
    selectFile: (fileId: string, versionId?: string) => dispatch({ type: 'SELECT_FILE', payload: { fileId, versionId } }),
    togglePreviewMode: () => dispatch({ type: 'TOGGLE_PREVIEW_MODE' }),
    setEditorCode: (language: 'javascript' | 'css', code: string) => dispatch({ type: 'SET_EDITOR_CODE', payload: { language, code } }),
    resetState: () => dispatch({ type: 'RESET_STATE' }),
  }), [dispatch]);

  const contextValue = useMemo(() => ({
    state,
    dispatch,
    actions,
  }), [state, dispatch, actions]);

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