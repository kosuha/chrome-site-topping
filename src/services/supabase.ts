import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

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