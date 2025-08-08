import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Mock storage for dev preview mode
const mockStorage = {
  getItem: (key: string) => {
    return Promise.resolve(localStorage.getItem(key))
  },
  setItem: (key: string, value: string) => {
    localStorage.setItem(key, value)
    return Promise.resolve()
  },
  removeItem: (key: string) => {
    localStorage.removeItem(key)
    return Promise.resolve()
  }
}

// Check if chrome.storage is available (extension environment)
const isExtension = typeof chrome !== 'undefined' && chrome.storage

const storage = isExtension ? {
  getItem: (key: string) => {
    return chrome.storage.local.get([key]).then(result => result[key])
  },
  setItem: (key: string, value: string) => {
    return chrome.storage.local.set({ [key]: value })
  },
  removeItem: (key: string) => {
    return chrome.storage.local.remove([key])
  }
} : mockStorage

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false
  }
})