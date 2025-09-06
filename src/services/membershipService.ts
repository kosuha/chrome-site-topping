import { supabase } from './supabase';

export type MembershipStatus = {
  level: number;
  is_expired?: boolean;
  expires_at?: string | null;
  days_remaining?: number | null;
};

class MembershipService {
  private baseUrl: string;
  constructor() {
    this.baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
  }

  private async getAuthToken(): Promise<string | null> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      return session?.access_token || null;
    } catch {
      return null;
    }
  }

  async getStatus(): Promise<MembershipStatus | null> {
    const token = await this.getAuthToken();
    if (!token) return null; // 비로그인 상태

    const res = await fetch(`${this.baseUrl}/api/v1/membership/status`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    // 서버 표준 응답: { status: 'success'|'error', data: {...} }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      return null;
    }

    const payload = data.data || data;
    // payload 예: { level, is_expired, expires_at, days_remaining }
    if (typeof payload?.level === 'number') return payload as MembershipStatus;
    // 과거 포맷 호환 (membership_level)
    if (typeof payload?.membership_level === 'number') {
      return {
        level: payload.membership_level,
        is_expired: Boolean(payload.is_expired),
        expires_at: payload.expires_at ?? null,
        days_remaining: payload.days_remaining ?? null,
      } as MembershipStatus;
    }
    return null;
  }
}

const membershipService = new MembershipService();
export default membershipService;
