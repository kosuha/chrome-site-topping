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

export interface SiteScriptResponse {
  script_content: string
  css_content: string
  draft_script_content: string
  draft_css_content: string
  draft_updated_at: string | null
  version: number
  last_updated: string | null
  updated_at?: string | null
  site_code?: string
  message?: string
}

export class SiteIntegrationService {
  private static instance: SiteIntegrationService
  private baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
  
  private getTranslations() {
    return translations[getCurrentLocale()]
  }

  public static getInstance(): SiteIntegrationService {
    if (!SiteIntegrationService.instance) {
      SiteIntegrationService.instance = new SiteIntegrationService()
    }
    return SiteIntegrationService.instance
  }

  private async getAuthToken(): Promise<string> {
    const localeStrings = this.getTranslations();

    try {
      const { supabase } = await import('./supabase')
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session?.access_token) {
        return session.access_token
      }
    } catch (error) {
      console.error('[SiteIntegration] Failed to obtain Supabase session:', error)
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
        console.error('[SiteIntegration] Chrome storage access failed:', error)
      }
    }
    
    throw new Error(localeStrings.userTab.account.errors.missingSession)
  }

  private async apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const localeStrings = this.getTranslations();
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
      if (error instanceof Error && error.message.includes(localeStrings.userTab.account.errors.missingSession)) {
        throw new Error(localeStrings.userTab.errors.loginRequired)
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

  async getSiteScripts(siteCode: string): Promise<SiteScriptResponse> {
    return this.apiRequest<SiteScriptResponse>(`/sites/${siteCode}/scripts`)
  }

  async deployScript(siteCode: string, payload: { draftScriptContent: string; draftCssContent: string }): Promise<SiteScriptResponse> {
    return this.apiRequest<SiteScriptResponse>(`/sites/${siteCode}/scripts/deploy`, {
      method: 'POST',
      body: JSON.stringify({
        draft_script_content: payload.draftScriptContent,
        draft_css_content: payload.draftCssContent,
      })
    })
  }

  async saveDraftScript(siteCode: string, payload: { draftScriptContent: string; draftCssContent: string }): Promise<SiteScriptResponse> {
    return this.apiRequest<SiteScriptResponse>(`/sites/${siteCode}/scripts/draft`, {
      method: 'POST',
      body: JSON.stringify({
        draft_script_content: payload.draftScriptContent,
        draft_css_content: payload.draftCssContent,
      })
    })
  }

  async checkSiteConnection(siteId: string): Promise<{ connected: boolean, error?: string }> {
    // 현재 도메인과 사이트 도메인 비교
    const sites = await this.getUserSites()
    const site = sites.find(s => s.id === siteId)
    if (!site) {
      const localeStrings = this.getTranslations();
      return { connected: false, error: localeStrings.userTab.errors.siteNotFound }
    }

    // Chrome Extension에서 현재 활성 탭의 도메인 가져오기
    let currentDomain = '';
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab?.url) {
          const url = new URL(activeTab.url);
          currentDomain = url.hostname;
        }
      }
      
      // 백업: window.location 사용 (content script에서)
      if (!currentDomain) {
        currentDomain = window.location.hostname;
      }
    } catch (error) {
      console.error('[SiteIntegration] Failed to obtain domain:', error);
      const localeStrings = this.getTranslations();
      return { connected: false, error: localeStrings.userTab.errors.domainUnavailable };
    }
    
    const isDomainMatch = currentDomain === site.domain
    
    if (!isDomainMatch) {
      // 도메인이 다르면 연결 안됨
      const localeStrings = this.getTranslations();
      return { connected: false, error: localeStrings.userTab.errors.domainMismatch(currentDomain, site.domain) }
    }

    // 도메인이 일치하면 실제 스크립트 존재 여부 확인
    try {
      const isScriptInstalled = await this.checkScriptInstalled(site.site_code)
      
      if (isScriptInstalled) {
        return { connected: true }
      } else {
        const localeStrings = this.getTranslations();
        return { connected: false, error: localeStrings.userTab.errors.scriptMissing }
      }
    } catch (error) {
      const localeStrings = this.getTranslations();
      return { connected: false, error: localeStrings.userTab.errors.connectionCheck }
    }
  }

  private async checkScriptInstalled(siteCode?: string): Promise<boolean> {
    if (!siteCode) return false
    
    try {
      // Chrome Extension에서는 content script를 통해 웹페이지 DOM을 확인해야 함
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (activeTab?.id) {
          try {
            // content script에 스크립트 설치 여부 확인 요청
            const result = await chrome.tabs.sendMessage(activeTab.id, {
              type: 'CHECK_SCRIPT_INSTALLED',
              siteCode: siteCode,
              scriptUrl: `${this.baseUrl}/api/v1/sites/${siteCode}/script`
            });
            
            return result?.installed === true;
          } catch (error) {
            console.warn('content script 통신 실패:', error);
            // content script가 응답하지 않으면 설치되지 않은 것으로 간주
            return false;
          }
        }
      }
      
      // 백업: 서버에서 스크립트 존재 여부만 확인
      try {
        const scriptUrl = `${this.baseUrl}/api/v1/sites/${siteCode}/script`
        const response = await fetch(scriptUrl, { method: 'HEAD' })
        if (response.ok) {
          // 서버에 스크립트가 존재하면 연동 가능으로 간주
          return true;
        }
      } catch (fetchError) {
        console.warn('서버 스크립트 확인 실패:', fetchError);
      }

      return false;
    } catch (error) {
      console.error('스크립트 설치 확인 중 오류:', error);
      return false;
    }
  }

  async getSiteById(siteId: string): Promise<Site | null> {
    const sites = await this.getUserSites()
    return sites.find(site => site.id === siteId) || null
  }

  async getCurrentDomain(): Promise<string> {
    try {
      // Chrome Extension에서 현재 활성 탭의 도메인 가져오기
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab?.url) {
          const url = new URL(activeTab.url);
          return url.hostname;
        }
      }
      
      // 백업: window.location 사용
      return window.location.hostname;
    } catch (error) {
      console.error('현재 도메인 가져오기 실패:', error);
      return window.location.hostname;
    }
  }

  async isCurrentSiteConnected(sites: Site[]): Promise<Site | null> {
    const currentDomain = await this.getCurrentDomain()
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
import { translations } from '../i18n/translations'
import { getCurrentLocale } from '../contexts/LanguageContext'
