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
  clearUserData: () => void
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

  // AppContext를 임포트하지 않고 전역 이벤트로 통신
  const clearUserData = () => {
    window.dispatchEvent(new CustomEvent('auth:user-changed', { detail: { action: 'logout' } }))
  }

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
      async (event, session) => {
        console.log('🔐 Auth state change:', event, session?.user?.id, 'previous:', state.user?.id)
        
        const previousUser = state.user
        dispatch({
          type: 'SET_SESSION',
          payload: { user: session?.user ?? null, session }
        })

        // 사용자 변경 감지 - 더 확실한 감지 로직
        if (event === 'SIGNED_OUT' || (!session?.user && previousUser)) {
          // 로그아웃
          console.log('👋 사용자 로그아웃, 상태 초기화')
          window.dispatchEvent(new CustomEvent('auth:user-changed', { 
            detail: { action: 'logout' } 
          }))
        } else if (event === 'SIGNED_IN' && session?.user) {
          if (!previousUser) {
            // 완전히 새로운 로그인
            console.log('👋 새 사용자 로그인:', session.user.id)
            window.dispatchEvent(new CustomEvent('auth:user-changed', { 
              detail: { action: 'login', user: session.user } 
            }))
          } else if (previousUser.id !== session.user.id) {
            // 다른 사용자로 전환
            console.log('🔄 사용자 전환:', previousUser.id, '->', session.user.id)
            window.dispatchEvent(new CustomEvent('auth:user-changed', { 
              detail: { action: 'switch', user: session.user } 
            }))
          }
        }
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
      console.log('🚪 수동 로그아웃 시작')
      
      // 먼저 직접 로그아웃 이벤트 발송
      window.dispatchEvent(new CustomEvent('auth:user-changed', { 
        detail: { action: 'logout' } 
      }))
      
      await supabase.auth.signOut()
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.clear()
      }
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
      signOut,
      clearUserData
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