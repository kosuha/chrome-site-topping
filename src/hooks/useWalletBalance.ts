import { useEffect, useState } from 'react';

export function useWalletBalance() {
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchWallet = async () => {
      try {
        const { default: tokenService } = await import('../services/tokenService');
        const wallet = await tokenService.getWallet();
        if (mounted) setWalletBalance(Number(wallet.balance_usd || 0));
      } catch {
        // ignore
      }
    };
    void fetchWallet();
    const handler = () => fetchWallet();
    window.addEventListener('SITE_TOPPING_REFRESH_WALLET', handler as EventListener);
    return () => {
      mounted = false;
      window.removeEventListener('SITE_TOPPING_REFRESH_WALLET', handler as EventListener);
    };
  }, []);

  return walletBalance;
}
