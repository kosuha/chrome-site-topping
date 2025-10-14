import { supabase } from './supabase';
import { translations } from '../i18n/translations';
import { getCurrentLocale } from '../contexts/LanguageContext';

export interface SendChatMessageRequest {
  thread_id?: string;
  message: string;
  message_type: 'user';
  metadata?: Record<string, any>;
  site_code?: string;
  auto_deploy?: boolean;
  image_data?: string[];
}

export interface SendChatMessageResponse {
  status: 'success' | 'error';
  data: {
    user_message: {
      id: string;
      thread_id: string;
      user_id: string;
      message: string;
      message_type: 'user';
      created_at: string;
      metadata?: Record<string, any>;
      status: string;
      image_data?: any;
      cost_usd: number;
      ai_model?: string;
    };
    ai_message: {
        id: string;
        thread_id: string;
        user_id: string;
        message: string;
        message_type: 'assistant';
        created_at: string;
        metadata?: Record<string, any>;
        status: string;
        image_data?: any;
        cost_usd: number;
        ai_model?: string;
        code?: {
          javascript?: string;
          css?: string;
        };
        codeAction?: 'replace' | 'append' | 'insert' | 'modify';
        
        // 새로운 통합 Git diff 형식
        changes?: {
          javascript?: {
            file_id: string;
            diff: string;
          };
          css?: {
            file_id: string;
            diff: string;
          };
        };
      };
  };
  message: string;
}

export interface CreateThreadRequest {
  siteId?: string;
}

export interface CreateThreadResponse {
  status: 'success' | 'error';
  data: {
    threadId: string;
    id?: string;
    user_id?: string;
    title?: string;
    site_code?: string;
    created_at?: string;
    updated_at?: string;
  };
  message: string;
}

export interface GetThreadsResponse {
  status: 'success' | 'error';
  data: {
    threads: Array<{
      id: string;
      user_id: string;
      title: string;
      site_code?: string;
      created_at: string;
      updated_at: string;
    }>;
  };
  message: string;
}

export interface UpdateThreadTitleRequest {
  title: string;
}

export interface DeleteThreadResponse {
  status: 'success' | 'error';
  message: string;
}

export interface GetThreadMessagesResponse {
  status: 'success' | 'error';
  data: {
    messages: Array<{
      id: string;
      thread_id: string;
      user_id: string;
      message: string;
      message_type: 'user' | 'assistant';
      created_at: string;
      metadata?: Record<string, any>;
      status: string;
      image_data?: any;
      cost_usd: number;
      ai_model?: string;
    }>;
  };
  message: string;
}

class AIService {
  private baseUrl: string;

  constructor() {
    // 환경변수에서 API URL 가져오기
    this.baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  private async getAuthToken(): Promise<string | null> {
    try {
      // Supabase에서 현재 세션 가져오기
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.access_token) {
        return session.access_token;
      }

      // Chrome storage의 모든 키 확인
      const storageKeys = await new Promise<{ [key: string]: any }>((resolve) => {
        chrome.storage.local.get(null, (result) => {
          resolve(result);
        });
      });

      // 각 키의 내용을 자세히 확인
      const potentialKeys = Object.keys(storageKeys).filter(key => 
        key.includes('supabase') || 
        key.includes('auth') || 
        key.includes('session') ||
        key.includes('sb-') ||
        key.startsWith('supabase.auth.token')
      );

      for (const key of potentialKeys) {
        const value = storageKeys[key];
        
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            
            if (parsed?.access_token) {
              return parsed.access_token;
            }
          } catch (e) {
            // JSON이 아닌 경우 - 토큰 자체일 수도 있음
            if (value.length > 50 && value.includes('.')) { // JWT 토큰 형태
              return value;
            }
          }
        } else if (typeof value === 'object' && value?.access_token) {
          return value.access_token;
        }
      }

      return null;
    } catch (error) {
      console.error('❌ 인증 토큰 가져오기 실패:', error);
      return null;
    }
  }

  private async makeRequest<T>(
    endpoint: string, 
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
    body?: any
  ): Promise<T> {
    const localeStrings = translations[getCurrentLocale()];
    const token = await this.getAuthToken();
    if (!token) {
      throw new Error(localeStrings.userTab.errors.loginRequired);
    }

    const config: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    };

    if (body && method !== 'GET') {
      config.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.baseUrl}/api/v1${endpoint}`, config);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Network error' }));
      const message = (errorData && (errorData.message || errorData.detail)) || `HTTP error! status: ${response.status}`;
      if (response.status === 403) {
        const fallback = localeStrings.chatTab.errors.subscriptionRequired;
        throw new Error(message || fallback);
      }
      throw new Error(message);
    }

    return await response.json();
  }

  // AI 채팅 메시지 전송 (부분 수정 전용)
  async sendPartialEditRequest(
    userMessage: string,
    currentCode: { javascript?: string; css?: string },
    focusArea?: {
      type: 'function' | 'selector' | 'line';
      identifier: string;
    },
    threadId?: string,
    siteCode?: string
  ): Promise<SendChatMessageResponse> {
    let enhancedPrompt = userMessage;
    
    // 현재 코드 컨텍스트 추가 (라인 번호 포함)
    if (currentCode.javascript || currentCode.css) {
      enhancedPrompt += '\n\n--- 현재 코드 (라인 번호 포함) ---\n';
      
      if (currentCode.javascript) {
        const numberedJS = this.addLineNumbers(currentCode.javascript);
        enhancedPrompt += `JavaScript:\n\`\`\`javascript\n${numberedJS}\n\`\`\`\n\n`;
      }
      
      if (currentCode.css) {
        const numberedCSS = this.addLineNumbers(currentCode.css);
        enhancedPrompt += `CSS:\n\`\`\`css\n${numberedCSS}\n\`\`\`\n\n`;
      }
    }
    
    // 포커스 영역 지정
    if (focusArea) {
      enhancedPrompt += `\n특별히 "${focusArea.identifier}" ${focusArea.type}에 집중해서 수정해주세요.\n`;
    }
    
    // Git diff 우선 요청
    enhancedPrompt += '\n**중요**: Git diff 형식으로 응답해주세요. 토큰을 절약하고 정확한 수정을 위해 diff 형식을 우선 사용해주세요.';
    
    return await this.sendChatMessage(
      enhancedPrompt,
      threadId,
      {
        requestType: 'git_diff_preferred',
        currentCode,
        focusArea,
        pageUrl: window.location.href
      },
      siteCode,
      false
    );
  }

  /**
   * 코드에 라인 번호 추가 (Git diff를 위해)
   */
  private addLineNumbers(code: string): string {
    return code
      .split('\n')
      .map((line, index) => `${(index + 1).toString().padStart(3, ' ')}: ${line}`)
      .join('\n');
  }

  // AI 채팅 메시지 전송 (기존)
  async sendChatMessage(
    message: string, 
    threadId?: string, 
    metadata?: Record<string, any>,
    siteCode?: string,
    autoDeploy: boolean = false,
    imageData?: string[]
  ): Promise<SendChatMessageResponse> {
    const requestData: SendChatMessageRequest = {
      message,
      message_type: 'user',
      metadata,
      site_code: siteCode,
      auto_deploy: autoDeploy,
      image_data: imageData,
    };

    if (threadId) {
      requestData.thread_id = threadId;
    }

    return await this.makeRequest<SendChatMessageResponse>('/messages', 'POST', requestData);
  }

  // 새 스레드 생성
  async createThread(siteId?: string): Promise<CreateThreadResponse> {
    const requestData: CreateThreadRequest = {};
    if (siteId) {
      requestData.siteId = siteId;
    }

    return await this.makeRequest<CreateThreadResponse>('/threads', 'POST', requestData);
  }

  // 스레드 목록 조회
  async getThreads(): Promise<GetThreadsResponse> {
    return await this.makeRequest<GetThreadsResponse>('/threads');
  }

  // 스레드 제목 수정
  async updateThreadTitle(threadId: string, title: string): Promise<{ status: string; message: string }> {
    const requestData: UpdateThreadTitleRequest = { title };
    return await this.makeRequest(`/threads/${threadId}/title`, 'PUT', requestData);
  }

  // 스레드 삭제
  async deleteThread(threadId: string): Promise<DeleteThreadResponse> {
    return await this.makeRequest<DeleteThreadResponse>(`/threads/${threadId}`, 'DELETE');
  }

  // 스레드 메시지 조회
  async getThreadMessages(threadId: string): Promise<GetThreadMessagesResponse> {
    return await this.makeRequest<GetThreadMessagesResponse>(`/messages/${threadId}`);
  }

  // 지원되는 AI 모델 목록 조회
  async getSupportedModels(): Promise<{
    status: 'success' | 'error';
    data?: { supported_models: string[]; pricing_info?: Record<string, any> };
    message?: string;
  }> {
    // 서버 라우터: membership_router.get_model_pricing => /api/v1/membership/pricing/models
    // 공개 엔드포인트이므로 인증 없이 호출합니다.
    const url = `${this.baseUrl}/api/v1/membership/pricing/models`;
    const resp = await fetch(url, { method: 'GET' });
    if (!resp.ok) {
      // 실패 시에도 상위에서 폴백을 사용하므로 간단한 에러 객체 반환
      return { status: 'error', message: `HTTP ${resp.status}` } as any;
    }
    return await resp.json();
  }

  // 현재 도메인의 사이트 코드 가져오기 (배포용)
  async getCurrentSiteCode(): Promise<string | null> {
    try {
      
      // Chrome extension 환경 체크
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        
        // background script를 통해 도메인 가져오기
        const response = await new Promise<{ success: boolean; domain?: string; error?: string }>((resolve) => {
          chrome.runtime.sendMessage(
            { type: 'GET_CURRENT_DOMAIN' },
            (response) => {
              if (chrome.runtime.lastError) {
                console.error('Chrome runtime error:', chrome.runtime.lastError);
                resolve({ success: false, error: chrome.runtime.lastError.message });
              } else {
                resolve(response || { success: false, error: 'No response' });
              }
            }
          );
        });

        if (response.success && response.domain) {
          return response.domain;
        } else {
          console.warn('⚠️ [getCurrentSiteCode] Background script에서 도메인 가져오기 실패:', response.error);
        }
      }

      // Chrome extension이 아니거나 실패한 경우 fallback 사용
      const fallbackDomain = this.getFallbackDomain();
      return fallbackDomain;
    } catch (error) {
      console.error('💥 [getCurrentSiteCode] 사이트 코드 가져오기 실패:', error);
      return this.getFallbackDomain();
    }
  }

  // 대체 도메인 가져오기 (웹 환경용)
  private getFallbackDomain(): string | null {
    try {
      if (typeof window !== 'undefined' && window.location) {
        const domain = window.location.hostname;
        return domain;
      }
      return null;
    } catch (error) {
      console.error('Fallback 도메인 가져오기 실패:', error);
      return null;
    }
  }
}

export const aiService = new AIService();
export default aiService;
