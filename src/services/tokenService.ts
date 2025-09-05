import { supabase } from './supabase'

export interface WalletInfo {
  user_id?: string
  balance_usd: number
  total_spent_usd: number
  created_at?: string
  updated_at?: string
}

export interface TokenTransaction {
  id: string
  type: 'debit' | 'credit'
  amount_usd: number
  balance_after?: number
  model_name?: string
  input_tokens?: number
  output_tokens?: number
  thoughts_tokens?: number
  thread_id?: string
  message_id?: string
  metadata?: any
  created_at: string
}

class TokenService {
  private baseUrl: string
  constructor() {
    this.baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
  }

  private async getAuthToken(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('로그인이 필요합니다.')
    return session.access_token
  }

  async getWallet(): Promise<WalletInfo> {
    const token = await this.getAuthToken()
    const res = await fetch(`${this.baseUrl}/api/v1/membership/wallet`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const data = await res.json()
    if (!res.ok || data.status === 'error') throw new Error(data.message || '지갑 조회 실패')
    return data.data
  }

  async getTransactions(limit: number = 20): Promise<TokenTransaction[]> {
    const token = await this.getAuthToken()
    const res = await fetch(`${this.baseUrl}/api/v1/membership/wallet/transactions?limit=${limit}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const data = await res.json()
    if (!res.ok || data.status === 'error') throw new Error(data.message || '거래 내역 조회 실패')
    return data.data?.transactions || []
  }

  async credit(amountUsd: number): Promise<WalletInfo> {
    const token = await this.getAuthToken()
    const res = await fetch(`${this.baseUrl}/api/v1/membership/wallet/credit?amount_usd=${amountUsd}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const data = await res.json()
    if (!res.ok || data.status === 'error') throw new Error(data.message || '충전 실패')
    return data.data?.wallet
  }
}

const tokenService = new TokenService()
export default tokenService
