import React, { createContext, useContext, useReducer, ReactNode, useMemo } from 'react';

export interface AppState {
  isOpen: boolean;
  activeTab: 'code' | 'chat' | 'user' | 'filelist';
  width: number;
  isLoading: boolean;
  error: string | null;
}

export type AppAction = 
  | { type: 'TOGGLE_PANEL' }
  | { type: 'OPEN_PANEL' }
  | { type: 'CLOSE_PANEL' }
  | { type: 'SET_ACTIVE_TAB'; payload: 'code' | 'chat' | 'user'| 'filelist' }
  | { type: 'SET_WIDTH'; payload: number }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'RESET_STATE' };

const initialState: AppState = {
  isOpen: false,
  activeTab: 'code',
  width: 400,
  isLoading: false,
  error: null,
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