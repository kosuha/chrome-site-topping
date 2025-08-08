import React, { createContext, useContext, useEffect, useReducer } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '../services/supabase'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  error: string | null
}

interface AuthContextType extends AuthState {
  signInWithProvider: (provider: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

type AuthAction = 
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_SESSION'; payload: { user: User | null; session: Session | null } }
  | { type: 'SET_ERROR'; payload: string | null }

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload }
    case 'SET_SESSION':
      return { 
        ...state, 
        user: action.payload.user, 
        session: action.payload.session,
        loading: false,
        error: null
      }
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false }
    default:
      return state
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, {
    user: null,
    session: null,
    loading: true,
    error: null
  })

  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      dispatch({
        type: 'SET_SESSION',
        payload: { user: session?.user ?? null, session }
      })
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_, session) => {
        dispatch({
          type: 'SET_SESSION',
          payload: { user: session?.user ?? null, session }
        })
      }
    )

    // Listen for auth success from background script
    const handleMessage = (message: any) => {
      if (message.type === 'AUTH_SUCCESS') {
        // Session will be updated by onAuthStateChange
        dispatch({ type: 'SET_ERROR', payload: null })
      }
    }

    // Only add listener in extension environment
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage.addListener(handleMessage)
    }

    return () => {
      subscription.unsubscribe()
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.onMessage.removeListener(handleMessage)
      }
    }
  }, [])

  const signInWithProvider = async (provider: string) => {
    dispatch({ type: 'SET_LOADING', payload: true })
    try {
      // In dev preview mode, mock the auth flow
      if (typeof chrome === 'undefined' || !chrome.runtime) {
        dispatch({ type: 'SET_ERROR', payload: 'Auth not available in preview mode' })
        return
      }
      
      const response = await chrome.runtime.sendMessage({
        type: 'INIT_OAUTH',
        provider
      })
      
      if (response.error) {
        throw new Error(response.error)
      }
    } catch (error) {
      dispatch({ 
        type: 'SET_ERROR', 
        payload: error instanceof Error ? error.message : 'Authentication failed' 
      })
    }
  }

  const signOut = async () => {
    dispatch({ type: 'SET_LOADING', payload: true })
    try {
      await supabase.auth.signOut()
      await chrome.storage.local.clear()
    } catch (error) {
      dispatch({ 
        type: 'SET_ERROR', 
        payload: error instanceof Error ? error.message : 'Sign out failed' 
      })
    }
  }

  return (
    <AuthContext.Provider value={{ 
      ...state, 
      signInWithProvider, 
      signOut 
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}