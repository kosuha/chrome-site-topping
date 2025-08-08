# Supabase OAuth Integration for Chrome Extension

This document outlines how to integrate Supabase OAuth authentication into the Site Topping Chrome extension based on the implementation guide from BeastX.

## Overview

Chrome extensions face unique challenges when implementing OAuth flows:
- Extension popups can close unexpectedly during authentication
- Content security policies restrict inline scripts
- Authentication flows need to be handled across different extension contexts

## Required Dependencies

```bash
npm install @supabase/supabase-js
```

## Manifest V3 Configuration

Update `manifest.json` to include required permissions:

```json
{
  "manifest_version": 3,
  "permissions": [
    "identity",
    "tabs",
    "storage",
    "activeTab",
    "scripting"
  ],
  "host_permissions": [
    "*://*/*"
  ],
  "oauth2": {
    "client_id": "your-google-client-id.apps.googleusercontent.com",
    "scopes": ["openid", "email", "profile"]
  }
}
```

## Supabase Setup

1. Create a new Supabase project
2. Configure OAuth providers in Supabase dashboard
3. Add Chrome extension redirect URL: `chrome-extension://YOUR_EXTENSION_ID/`

## Implementation Structure

### 1. Supabase Client Configuration

Create `src/services/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'YOUR_SUPABASE_URL'
const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: {
      getItem: (key: string) => {
        return chrome.storage.local.get([key]).then(result => result[key])
      },
      setItem: (key: string, value: string) => {
        return chrome.storage.local.set({ [key]: value })
      },
      removeItem: (key: string) => {
        return chrome.storage.local.remove([key])
      }
    },
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false
  }
})
```

### 2. Background Script OAuth Handler

Update `src/background.ts`:

```typescript
// Existing imports...
import { supabase } from './services/supabase'

// Add OAuth tab listener
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const url = new URL(tab.url)
    
    // Check if this is our OAuth callback
    if (url.pathname === '/auth/callback' || url.hash.includes('access_token')) {
      try {
        // Extract tokens from URL
        const hashParams = new URLSearchParams(url.hash.substring(1))
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')
        
        if (accessToken) {
          // Set the session in Supabase
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || ''
          })
          
          if (!error) {
            // Store user session
            await chrome.storage.local.set({
              'supabase.auth.token': JSON.stringify(data.session)
            })
            
            // Close the auth tab
            chrome.tabs.remove(tabId)
            
            // Notify content script of successful auth
            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
              if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id!, {
                  type: 'AUTH_SUCCESS',
                  user: data.user
                })
              }
            })
          }
        }
      } catch (error) {
        console.error('OAuth callback error:', error)
      }
    }
  }
})

// Handle auth requests from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'INIT_OAUTH') {
    initOAuth(message.provider)
      .then(sendResponse)
      .catch(error => sendResponse({ error: error.message }))
    return true // Keep message channel open for async response
  }
})

async function initOAuth(provider: string) {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: provider as any,
      options: {
        redirectTo: chrome.identity.getRedirectURL()
      }
    })
    
    if (error) throw error
    
    // Open OAuth URL in new tab
    await chrome.tabs.create({ url: data.url })
    
    return { success: true }
  } catch (error) {
    console.error('OAuth initialization error:', error)
    throw error
  }
}
```

### 3. Authentication Context

Create `src/contexts/AuthContext.tsx`:

```typescript
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
      async (event, session) => {
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

    chrome.runtime.onMessage.addListener(handleMessage)

    return () => {
      subscription.unsubscribe()
      chrome.runtime.onMessage.removeListener(handleMessage)
    }
  }, [])

  const signInWithProvider = async (provider: string) => {
    dispatch({ type: 'SET_LOADING', payload: true })
    try {
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
```

### 4. Login Component

Create `src/components/LoginTab.tsx`:

```typescript
import React from 'react'
import { useAuth } from '../contexts/AuthContext'
import styles from '../styles/LoginTab.module.css'

export function LoginTab() {
  const { user, loading, error, signInWithProvider, signOut } = useAuth()

  if (loading) {
    return <div className={styles.loading}>Loading...</div>
  }

  if (user) {
    return (
      <div className={styles.container}>
        <div className={styles.userInfo}>
          <h3>Welcome, {user.email}!</h3>
          <p>You are signed in</p>
          <img 
            src={user.user_metadata?.avatar_url} 
            alt="Profile" 
            className={styles.avatar}
          />
        </div>
        <button 
          onClick={signOut}
          className={styles.signOutButton}
        >
          Sign Out
        </button>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <h3>Sign In</h3>
      {error && <div className={styles.error}>{error}</div>}
      
      <div className={styles.providers}>
        <button 
          onClick={() => signInWithProvider('google')}
          className={`${styles.provider} ${styles.google}`}
        >
          Continue with Google
        </button>
        
        <button 
          onClick={() => signInWithProvider('github')}
          className={`${styles.provider} ${styles.github}`}
        >
          Continue with GitHub
        </button>
      </div>
    </div>
  )
}
```

### 5. Integration with Existing Architecture

Update `src/components/SidePanel.tsx` to include LoginTab:

```typescript
// Add to existing imports
import { LoginTab } from './LoginTab'

// Add 'login' to tab types
type TabType = 'code' | 'chat' | 'login'

// Add login tab button in render method
<button
  className={`${styles.tabButton} ${activeTab === 'login' ? styles.active : ''}`}
  onClick={() => actions.setActiveTab('login')}
>
  <UserIcon className={styles.tabIcon} />
</button>

// Add login tab content
{activeTab === 'login' && <LoginTab />}
```

Update `src/content.tsx` to wrap with AuthProvider:

```typescript
import { AuthProvider } from './contexts/AuthContext'

// Wrap App component
const App = () => (
  <AppProvider>
    <AuthProvider>
      <AppWrapper />
    </AuthProvider>
  </AppProvider>
)
```

## Environment Variables

Create `.env` file:

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Security Considerations

1. **Content Security Policy**: Ensure CSP allows Supabase domains
2. **Token Storage**: Use Chrome's secure storage API
3. **HTTPS Only**: OAuth providers require HTTPS in production
4. **Scope Limitation**: Request minimal OAuth scopes needed

## Testing

1. Load unpacked extension in Chrome
2. Test OAuth flow with different providers
3. Verify token persistence across browser sessions
4. Test sign-out functionality

## Troubleshooting

Common issues:
- **Popup closes**: Implement background script handling
- **CORS errors**: Configure Supabase settings correctly
- **Token expiry**: Ensure auto-refresh is enabled
- **Storage issues**: Check Chrome storage permissions

This integration provides secure, persistent authentication for the Site Topping extension while maintaining compatibility with Chrome's security model.