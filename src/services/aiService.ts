import { supabase } from './supabase';

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
  data: Array<{
    id: string;
    user_id: string;
    title: string;
    site_code?: string;
    created_at: string;
    updated_at: string;
  }>;
  message: string;
}

export interface UpdateThreadTitleRequest {
  title: string;
}

export interface DeleteThreadResponse {
  status: 'success' | 'error';
  message: string;
}

class AIService {
  private baseUrl: string;

  constructor() {
    // 환경변수에서 API URL 가져오기
    this.baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
  }

  private async getAuthToken(): Promise<string | null> {
    try {
      // Supabase에서 현재 세션 가져오기
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.access_token) {
        console.log('✅ Supabase session에서 토큰 발견');
        return session.access_token;
      }

      // Chrome storage의 모든 키 확인
      const storageKeys = await new Promise<{ [key: string]: any }>((resolve) => {
        chrome.storage.local.get(null, (result) => {
          resolve(result);
        });
      });

      console.log('🔍 Chrome storage의 모든 키:', Object.keys(storageKeys));

      // 각 키의 내용을 자세히 확인
      const potentialKeys = Object.keys(storageKeys).filter(key => 
        key.includes('supabase') || 
        key.includes('auth') || 
        key.includes('session') ||
        key.includes('sb-') ||
        key.startsWith('supabase.auth.token')
      );

      console.log('🔍 인증 관련 키들:', potentialKeys);

      for (const key of potentialKeys) {
        const value = storageKeys[key];
        console.log(`📝 ${key}:`, typeof value, value);
        
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            console.log(`📋 ${key} 파싱된 내용:`, parsed);
            
            if (parsed?.access_token) {
              console.log('✅ 토큰 발견:', parsed.access_token.substring(0, 20) + '...');
              return parsed.access_token;
            }
          } catch (e) {
            // JSON이 아닌 경우 - 토큰 자체일 수도 있음
            if (value.length > 50 && value.includes('.')) { // JWT 토큰 형태
              console.log('✅ JWT 토큰으로 추정:', value.substring(0, 20) + '...');
              return value;
            }
          }
        } else if (typeof value === 'object' && value?.access_token) {
          console.log('✅ 객체에서 토큰 발견');
          return value.access_token;
        }
      }

      console.log('❌ 인증 토큰을 찾을 수 없음');
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
    const token = await this.getAuthToken();
    if (!token) {
      throw new Error('인증이 필요합니다. 로그인해주세요.');
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
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  // AI 채팅 메시지 전송
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

  // 현재 도메인의 사이트 코드 가져오기 (배포용)
  async getCurrentSiteCode(): Promise<string | null> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url) return null;

      const url = new URL(tab.url);
      const domain = url.hostname;

      // 서버에서 현재 도메인에 해당하는 사이트 코드 조회
      // 이 부분은 실제 사이트 목록 API와 연동해야 함
      return domain; // 임시로 도메인을 반환
    } catch (error) {
      console.error('현재 사이트 코드 가져오기 실패:', error);
      return null;
    }
  }
}

export const aiService = new AIService();
export default aiService;