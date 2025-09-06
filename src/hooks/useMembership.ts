import { useEffect, useState } from 'react';
import membershipService, { MembershipStatus } from '../services/membershipService';
import { supabase } from '../services/supabase';

export function useMembership() {
  const [status, setStatus] = useState<MembershipStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setLoading(true);
      setError(null);
      const s = await membershipService.getStatus();
      setStatus(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 로그인 상태가 변하면 다시 로드
    const sub = supabase.auth.onAuthStateChange((_event, _session) => {
      refresh();
    });
    void refresh();
    return () => { sub.data.subscription.unsubscribe(); };
  }, []);

  const isSubscribed = !!status && status.level > 0 && !status.is_expired;

  return { status, isSubscribed, loading, error, refresh };
}

export default useMembership;
