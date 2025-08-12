export interface Site {
  id: string              // API에서는 'id'로 오네요
  site_id?: string        // 호환성을 위해 옵셔널로
  domain: string
  site_name: string
  site_code?: string
  created_at: string
  connection_status?: 'connected' | 'disconnected' | 'checking'
  last_checked_at?: string | null
  error_message?: string | null
}

export interface CreateSiteRequest {
  domain: string
}

export class SiteIntegrationService {
  private static instance: SiteIntegrationService
  private baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
  
  public static getInstance(): SiteIntegrationService {
    if (!SiteIntegrationService.instance) {
      SiteIntegrationService.instance = new SiteIntegrationService()
    }
    return SiteIntegrationService.instance
  }

  private async getAuthToken(): Promise<string> {
    // Supabase 세션에서 토큰 가져오기
    try {
      const { supabase } = await import('./supabase')
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session?.access_token) {
        return session.access_token
      }
    } catch (error) {
      console.error('Supabase session 가져오기 실패:', error)
    }

    // 대안: Chrome storage에서 직접 가져오기
    if (typeof chrome !== 'undefined' && chrome.storage) {
      try {
        // 실제 Chrome storage에 저장된 키들 시도
        const keys = [
          'supabase.auth.token'
        ]
        
        for (const key of keys) {
          const result = await chrome.storage.local.get([key])
          if (result[key]) {
            const sessionData = typeof result[key] === 'string' ? JSON.parse(result[key]) : result[key]
            if (sessionData?.access_token) {
              return sessionData.access_token
            }
          }
        }
        
      } catch (error) {
        console.error('Chrome storage 접근 오류:', error)
      }
    }
    
    throw new Error('인증 토큰을 찾을 수 없습니다. 로그인이 필요합니다.')
  }

  private async apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    try {
      const token = await this.getAuthToken()
      
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...options.headers,
        },
      })

      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.message || `HTTP ${response.status}: ${response.statusText}`)
      }

      if (data.success === false) {
        throw new Error(data.message || 'API 요청 실패')
      }

      // API 응답 구조에 따라 적절히 파싱
      // 서버 응답: {status: "success", data: {sites: [...]}}
      if (data.data?.sites) {
        return data.data.sites  // {data: {sites: [...]}} 형태
      }
      if (data.sites) {
        return data.sites  // {sites: [...]} 형태  
      }
      return data.data || data
    } catch (error) {
      if (error instanceof Error && error.message.includes('인증 토큰을 찾을 수 없습니다')) {
        throw new Error('로그인이 필요합니다. UserTab에서 Google 또는 Kakao로 로그인해주세요.')
      }
      throw error
    }
  }

  async getUserSites(): Promise<Site[]> {
    return this.apiRequest<Site[]>('/api/v1/sites')
  }

  async addSite(request: CreateSiteRequest): Promise<Site> {
    const domain = this.sanitizeDomain(request.domain)
    return this.apiRequest<Site>('/api/v1/websites', {
      method: 'POST',
      body: JSON.stringify({ domain })
    })
  }

  async updateSite(siteId: string, updates: { site_name?: string }): Promise<Site> {
    return this.apiRequest<Site>(`/api/v1/websites/${siteId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    })
  }

  async deleteSite(siteId: string): Promise<void> {
    await this.apiRequest<void>(`/api/v1/websites/${siteId}`, {
      method: 'DELETE'
    })
  }

  async getSiteScripts(siteCode: string): Promise<{ css_content: string, js_content: string, version: number, last_updated: string }> {
    return this.apiRequest<{ css_content: string, js_content: string, version: number, last_updated: string }>(`/sites/${siteCode}/scripts`)
  }

  async deployScript(siteCode: string, cssContent: string, jsContent: string): Promise<any> {
    return this.apiRequest<any>(`/sites/${siteCode}/scripts/deploy`, {
      method: 'POST',
      body: JSON.stringify({ 
        css_content: cssContent,
        js_content: jsContent 
      })
    })
  }

  async checkSiteConnection(siteId: string): Promise<{ connected: boolean, error?: string }> {
    // 현재 도메인과 사이트 도메인 비교
    const sites = await this.getUserSites()
    const site = sites.find(s => s.id === siteId)
    if (!site) {
      return { connected: false, error: '사이트를 찾을 수 없습니다' }
    }

    const currentDomain = window.location.hostname
    const isDomainMatch = currentDomain === site.domain
    
    if (!isDomainMatch) {
      // 도메인이 다르면 연결 안됨
      return { connected: false, error: `현재 ${site.domain}에 있지 않습니다` }
    }

    // 도메인이 일치하면 실제 스크립트 존재 여부 확인
    try {
      const isScriptInstalled = await this.checkScriptInstalled(site.site_code)
      
      if (isScriptInstalled) {
        return { connected: true }
      } else {
        return { connected: false, error: '연동 스크립트가 설치되지 않았습니다' }
      }
    } catch (error) {
      return { connected: false, error: '연동 상태 확인 중 오류가 발생했습니다' }
    }
  }

  private async checkScriptInstalled(siteCode?: string): Promise<boolean> {
    if (!siteCode) return false
    
    try {
      // 1. DOM에서 해당 사이트의 스크립트 태그 존재 여부 확인
      const scriptUrl = `${this.baseUrl}/api/v1/sites/${siteCode}/script`
      const existingScript = document.querySelector(`script[src="${scriptUrl}"]`)
      
      if (existingScript) {
        
        return true
      }

      // 2. 스크립트가 이미 로드되어 실행 중인지 확인
      // window 객체에 사이트 특정 식별자가 있는지 확인
      const siteIdentifier = `siteTopping_${siteCode}`
      if ((window as any)[siteIdentifier]) {
        
        return true
      }

      // 3. 실제 스크립트 URL로 HTTP 요청을 보내서 응답이 있는지 확인
      try {
        const response = await fetch(scriptUrl, { method: 'HEAD' })
        if (response.ok) {
          
          // 스크립트가 서버에 존재하지만 아직 설치되지 않은 상태
          return false
        }
      } catch (fetchError) {
        
      }

      return false
    } catch (error) {
      console.error('스크립트 설치 확인 중 오류:', error)
      return false
    }
  }

  async getSiteById(siteId: string): Promise<Site | null> {
    const sites = await this.getUserSites()
    return sites.find(site => site.id === siteId) || null
  }

  getCurrentDomain(): string {
    return window.location.hostname
  }

  isCurrentSiteConnected(sites: Site[]): Site | null {
    const currentDomain = this.getCurrentDomain()
    return sites.find(site => site.domain === currentDomain && site.connection_status === 'connected') || null
  }

  private sanitizeDomain(domain: string): string {
    return domain
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '')
      .trim()
  }

  generateIntegrationScript(domain: string, siteCode?: string): string {
    if (siteCode) {
      // CSS와 JS를 분리한 두 줄 스크립트
      return `<link rel="stylesheet" href="${this.baseUrl}/api/v1/sites/${siteCode}/styles">
<script src='${this.baseUrl}/api/v1/sites/${siteCode}/script' type='module'></script>`
    } else {
      // site_code가 없는 경우 기본 스크립트 (도메인 기반)  
      return `<link rel="stylesheet" href="${this.baseUrl}/api/v1/sites/default/styles?domain=${encodeURIComponent(domain)}">
<script src='${this.baseUrl}/api/v1/sites/default/script?domain=${encodeURIComponent(domain)}' type='module'></script>`
    }
  }
}