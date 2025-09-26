import { useAuth } from '../contexts/AuthContext'
import { useAppContext } from '../contexts/AppContext'
import { useState, useEffect } from 'react'
import { SiteIntegrationService, Site } from '../services/siteIntegration'
import styles from '../styles/UserTab.module.css'
import { Copy, Check, Plus, Loader2, AlertCircle, Globe, Trash2, RotateCw, Coins, Crown } from 'lucide-react'
import useMembership from '../hooks/useMembership'
import { useTranslations } from '../hooks/useTranslations'

export default function UserTab() {
  const { user, loading, error, signInWithProvider, signOut } = useAuth()
  const { actions } = useAppContext()
  const { status: membership, isSubscribed, loading: membershipLoading, error: membershipError, refresh: refreshMembership } = useMembership()
  const t = useTranslations()
  const [currentDomain, setCurrentDomain] = useState<string>('')
  const [integrationScript, setIntegrationScript] = useState<string>('')
  const [connectedSites, setConnectedSites] = useState<Site[]>([])
  const [selectedSiteId, setSelectedSiteId] = useState<string>('')
  const [siteError, setSiteError] = useState<string>('')
  // const [copied, setCopied] = useState(false) // Removed - not used in new layout
  const [isChecking, setIsChecking] = useState(false)
  const [newSiteDomain, setNewSiteDomain] = useState('')
  const [isAddingSite, setIsAddingSite] = useState(false)
  const [isDeletingSite, setIsDeletingSite] = useState<string | null>(null)
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null)
  const [editingDomain, setEditingDomain] = useState('')
  const [isUpdatingDomain, setIsUpdatingDomain] = useState(false)
  const [copiedScript, setCopiedScript] = useState(false)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  // Wallet state
  const [walletLoading, setWalletLoading] = useState(false)
  const [walletError, setWalletError] = useState<string>('')
  const [walletBalance, setWalletBalance] = useState<number>(0)
  const [walletTotalSpent, setWalletTotalSpent] = useState<number>(0)
  const [recentTxs, setRecentTxs] = useState<Array<{
    id: string;
    type: 'debit' | 'credit';
    amount_usd: number;
    model_name?: string;
    created_at: string;
  }>>([])

  
  const siteService = SiteIntegrationService.getInstance()

  useEffect(() => {
    // Retrieve the active tab hostname from the browser
    const getCurrentDomain = async () => {
      try {
        console.log('[UserTab] Fetching active tab information...');
        
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (activeTab?.url) {
          const url = new URL(activeTab.url);
          const hostname = url.hostname;
          
          console.log('[UserTab] Active tab URL:', activeTab.url);
          console.log('[UserTab] Detected hostname:', hostname);
          
          if (hostname && 
              hostname !== 'localhost' && 
              !hostname.startsWith('chrome-extension://') && 
              !hostname.startsWith('moz-extension://') &&
              !hostname.includes('extension') &&
              hostname.length > 0) {
            
            console.log('[UserTab] Using hostname as domain:', hostname);
            setCurrentDomain(hostname);
            setNewSiteDomain(hostname);
          } else {
            console.log('[UserTab] Invalid hostname detected:', hostname, '- using default');
            setCurrentDomain('example.com');
            setNewSiteDomain('example.com');
          }
        } else {
          console.log('[UserTab] No active tab URL - using default');
          setCurrentDomain('example.com');
          setNewSiteDomain('example.com');
        }
      } catch (error) {
        console.error('[UserTab] Failed to fetch active tab info:', error);
        setCurrentDomain('example.com');
        setNewSiteDomain('example.com');
      }
    };

    getCurrentDomain();
    
    // 사용자가 로그인한 경우 연동된 사이트 목록 로드
    if (user) {
      loadConnectedSites();
  // 지갑/거래 로드
  fetchWalletAndTransactions();
    }
  }, [user])

  // 현재 도메인과 일치하는 사이트를 자동 선택하는 useEffect
  useEffect(() => {
    if (connectedSites.length > 0 && currentDomain) {
      const currentSite = connectedSites.find(site => site.domain === currentDomain)
      if (currentSite && selectedSiteId !== currentSite.id) {
        setSelectedSiteId(currentSite.id)
        loadSiteScript(currentSite)
      }
    }
  }, [connectedSites, currentDomain, selectedSiteId])

  const loadConnectedSites = async () => {
    setSiteError('')
    try {
      const response = await siteService.getUserSites()
      const sitesArray = Array.isArray(response) ? response : ((response as any)?.sites || []);
      
      const sitesWithStatus = await Promise.all(sitesArray.map(async (site: any) => {
        try {
          const connectionResult = await siteService.checkSiteConnection(site.id)
          return {
            ...site,
            connection_status: connectionResult.connected ? 'connected' as const : 'disconnected' as const,
            error_message: connectionResult.error || null,
            last_checked_at: new Date().toISOString()
          }
        } catch (error) {
          return {
            ...site,
            connection_status: 'disconnected' as const,
            error_message: t.userTab.errors.connectionCheck,
            last_checked_at: new Date().toISOString()
          }
        }
      }))
      
      setConnectedSites(sitesWithStatus)
      
      const currentSite = sitesWithStatus.find((site: any) => site.domain === currentDomain)
      if (currentSite) {
        setSelectedSiteId(currentSite.id)
        await loadSiteScript(currentSite)
        if (currentSite.site_code) {
          console.log('🎯 [UserTab] Auto-selected site:', currentSite.site_code)
          actions.setSelectedSiteCode(currentSite.site_code)
        }
      } else if (sitesWithStatus.length > 0) {
        setSelectedSiteId(sitesWithStatus[0].id)
        await loadSiteScript(sitesWithStatus[0])
        if (sitesWithStatus[0].site_code) {
          console.log('🎯 [UserTab] Auto-selected first site:', sitesWithStatus[0].site_code)
          actions.setSelectedSiteCode(sitesWithStatus[0].site_code)
        }
      }
    } catch (err) {
      setSiteError(err instanceof Error ? err.message : t.userTab.errors.loadSites)
    }
  }

  // Wallet fetcher
  const fetchWalletAndTransactions = async () => {
    if (!user) return;
    setWalletError('')
    setWalletLoading(true)
    try {
      const { default: tokenService } = await import('../services/tokenService')
      const [wallet, txs] = await Promise.all([
        tokenService.getWallet(),
        tokenService.getTransactions(5)
      ])
      setWalletBalance(Number(wallet.balance_usd || 0))
      setWalletTotalSpent(Number(wallet.total_spent_usd || 0))
      setRecentTxs((txs || []).map(tx => ({
        id: tx.id,
        type: tx.type,
        amount_usd: Number(tx.amount_usd || 0),
        model_name: tx.model_name,
        created_at: tx.created_at,
      })))
    } catch (e) {
      setWalletError(e instanceof Error ? e.message : t.userTab.credits.errors.loadFailed)
    } finally {
      setWalletLoading(false)
    }
  }

  // SSE 차감 후 새로고침 이벤트
  useEffect(() => {
    const handler = () => fetchWalletAndTransactions();
    window.addEventListener('SITE_TOPPING_REFRESH_WALLET', handler as EventListener)
    return () => window.removeEventListener('SITE_TOPPING_REFRESH_WALLET', handler as EventListener)
  }, [])

  const loadSiteScript = async (site: Site) => {
    // 사용자에게는 항상 HTML script 태그를 보여줌
    setIntegrationScript(siteService.generateIntegrationScript(site.domain, site.site_code))
  }

  const handleSiteSelect = async (siteId: string) => {
    setSelectedSiteId(siteId)
    const selectedSite = connectedSites?.find(site => site.id === siteId)
    if (selectedSite) {
      await loadSiteScript(selectedSite)
      
      // 선택된 사이트 코드 설정 (AppContext useEffect에서 자동으로 히스토리 로드됨)
      if (selectedSite.site_code) {
        console.log('🎯 [UserTab] Site selected:', selectedSite.site_code)
        actions.setSelectedSiteCode(selectedSite.site_code)
      }
    }
  }

  // 복사 버튼 UX 개선: 알림 대신 배지 표시
  const handleCopyScript = (siteCode?: string) => {
    const scriptToCopy = siteCode ? generateScript(siteCode) : integrationScript
    if (!scriptToCopy) return
    navigator.clipboard.writeText(scriptToCopy)
      .then(() => {
        setCopiedScript(true)
        setTimeout(() => setCopiedScript(false), 1500)
      })
      .catch(err => {
        console.error('[UserTab] Clipboard copy failed:', err)
      })
  }

  const generateScript = (siteCode: string) => {
    return siteService.generateIntegrationScript(currentDomain, siteCode)
  }

  // 현재 사이트 연동 상태 재확인 버튼
  const refreshCurrentSiteStatus = async () => {
    const currentSite = connectedSites.find(s => s.domain === currentDomain)
    if (!currentSite) return
    try {
      setIsChecking(true)
      const result = await siteService.checkSiteConnection(currentSite.id)
      setConnectedSites(prev => prev.map(s => s.id === currentSite.id
        ? { ...s, connection_status: result.connected ? 'connected' : 'disconnected', error_message: result.error || null, last_checked_at: new Date().toISOString() }
        : s
      ))
    } catch (e) {
      // noop
    } finally {
      setIsChecking(false)
    }
  }

  const getCurrentSiteStatus = () => {
    if (!connectedSites || !Array.isArray(connectedSites)) {
      return null
    }
    const currentSite = connectedSites.find(site => site.domain === currentDomain)
    return currentSite || null
  }

  const handleAddSite = async () => {
    if (!newSiteDomain.trim() || isAddingSite) return;

    try {
      setIsAddingSite(true);
      setSiteError('');

      const sanitizedDomain = newSiteDomain.trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/.*$/, '');

      if (!sanitizedDomain) {
        setSiteError(t.userTab.errors.invalidDomain);
        return;
      }

      if (connectedSites.some(site => site.domain === sanitizedDomain)) {
        setSiteError(t.userTab.errors.duplicateDomain);
        return;
      }

      await siteService.addSite({ domain: sanitizedDomain });
      
      // 사이트 목록 새로고침
      await loadConnectedSites();
      
      // 폼 초기화
      setNewSiteDomain('');
      
    } catch (error) {
      console.error('[UserTab] Failed to add site:', error);
      setSiteError(error instanceof Error ? error.message : t.userTab.errors.addSite);
    } finally {
      setIsAddingSite(false);
    }
  };

  const handleDeleteSite = async (siteId: string, siteDomain: string) => {
    if (isDeletingSite || !siteId) return;

    const confirmed = window.confirm(t.userTab.sites.deleteConfirm(siteDomain));
    
    if (!confirmed) return;

    try {
      setIsDeletingSite(siteId);
      setSiteError('');

      await siteService.deleteSite(siteId);
      
      // 선택된 사이트가 삭제된 경우 선택 초기화
      if (selectedSiteId === siteId) {
        setSelectedSiteId('');
        setIntegrationScript('');
      }
      
      // 사이트 목록 새로고침
      await loadConnectedSites();
      
    } catch (error) {
      console.error('[UserTab] Failed to delete site:', error);
      setSiteError(error instanceof Error ? error.message : t.userTab.errors.deleteSite);
    } finally {
      setIsDeletingSite(null);
    }
  };

  const handleStartEditDomain = (site: Site) => {
    setEditingSiteId(site.id)
    setEditingDomain(site.domain)
  }

  const handleSaveEditDomain = async (siteId: string) => {
    if (!editingDomain.trim() || isUpdatingDomain) return

    try {
      setIsUpdatingDomain(true)
      setSiteError('')

      const sanitizedDomain = editingDomain.trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/.*$/, '')

      if (!sanitizedDomain) {
        setSiteError(t.userTab.errors.invalidDomain)
        return
      }

      if (connectedSites.some(site => site.domain === sanitizedDomain && site.id !== siteId)) {
        setSiteError(t.userTab.errors.duplicateDomain)
        return
      }

      await siteService.updateSite(siteId, { site_name: sanitizedDomain as string })
      await loadConnectedSites()
      
      setEditingSiteId(null)
      setEditingDomain('')
    } catch (error) {
      console.error('[UserTab] Failed to update domain:', error)
      setSiteError(error instanceof Error ? error.message : t.userTab.errors.updateDomain)
    } finally {
      setIsUpdatingDomain(false)
    }
  }

  const handleCancelEditDomain = () => {
    setEditingSiteId(null)
    setEditingDomain('')
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'connected':
        return t.userTab.sites.status.connected
      case 'checking':
        return t.userTab.sites.status.checking
      default:
        return t.userTab.sites.status.disconnected
    }
  }

  const handleDeleteAccount = async () => {
    if (isDeletingAccount) return;

    const confirmed = window.confirm(t.userTab.account.deleteConfirmPrimary);
    
    if (!confirmed) return;

    const doubleConfirmed = window.confirm(t.userTab.account.deleteConfirmSecondary);

    if (!doubleConfirmed) return;

    try {
      setIsDeletingAccount(true);
      setSiteError('');

      // Supabase 세션에서 토큰 가져오기
      const { supabase } = await import('../services/supabase')
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.access_token) {
        throw new Error(t.userTab.account.errors.missingSession);
      }

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/v1/auth/account`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || t.userTab.errors.deleteAccount);
      }

      alert(t.userTab.account.deleteSuccess);
      await signOut();
      
    } catch (error) {
      console.error('[UserTab] Failed to delete account:', error);
      setSiteError(error instanceof Error ? error.message : t.userTab.errors.deleteAccount);
    } finally {
      setIsDeletingAccount(false);
    }
  };

  if (loading) {
    return <div className={styles.loading}>{t.common.loading}</div>
  }

  const membershipStatusLabel = membershipLoading
    ? t.userTab.membership.statusLoading
    : (isSubscribed ? t.userTab.membership.statusActive : t.userTab.membership.statusFree);

  const membershipDetail = membershipLoading
    ? ''
    : (!membership
        ? t.userTab.membership.statusUnknown
        : membership.is_expired
          ? t.userTab.membership.statusExpired
          : membership.expires_at
            ? (() => {
                const parsedDate = new Date(membership.expires_at);
                const label = isNaN(parsedDate.getTime())
                  ? membership.expires_at
                  : parsedDate.toLocaleDateString();
                return t.userTab.membership.expiresAt(label, membership.days_remaining ?? null);
              })()
            : t.userTab.membership.statusUnlimited);

  const subscriptionButtonLabel = isSubscribed
    ? t.userTab.membership.upgrade
    : t.userTab.membership.subscribe;

  if (user) {
    // const selectedSite = connectedSites.find(site => site.id === selectedSiteId); // Removed - not used in new layout

    return (
      <div className={styles.container}>
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>{t.userTab.sections.account}</h3>
          </div>
          <div className={styles.userInfo}>
            <div className={styles.userEmail}>{user.email}</div>
            <div className={styles.accountActions}>
              <button onClick={signOut} className={styles.signOutButton}>
                {t.userTab.account.signOut}
              </button>
              <button 
                onClick={handleDeleteAccount}
                disabled={isDeletingAccount}
                className={styles.deleteAccountButton}
              >
                {isDeletingAccount ? (
                  <>
                    <Loader2 className={styles.spinnerIcon} />
                    {t.userTab.account.deleting}
                  </>
                ) : (
                  t.userTab.account.delete
                )}
              </button>
            </div>
          </div>
        </div>
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>{t.userTab.sections.membership}</h3>
          </div>
          <div className={styles.card}>
            {membershipError && (
              <div className={styles.errorAlert}>
                <AlertCircle className={styles.alertIcon} />
                <span className={styles.errorText}>{membershipError}</span>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Crown size={18} style={{ color: isSubscribed ? '#fbbf24' : '#9ca3af' }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {membershipStatusLabel}
                  </div>
                  <div style={{ fontSize: 12, color: '#666' }}>
                    {membershipDetail}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => {
                    const url = import.meta.env.VITE_SUBSCRIBE_URL as string | undefined;
                    if (url) {
                      window.open(url, '_blank');
                    } else {
                      alert(t.userTab.membership.subscribeInfo);
                    }
                  }}
                  className={styles.signOutButton}
                  title={subscriptionButtonLabel}
                >
                  {subscriptionButtonLabel}
                </button>
                <button
                  onClick={() => void refreshMembership()}
                  className={styles.refreshWalletButton}
                  disabled={membershipLoading}
                  title={t.userTab.membership.refreshTooltip}
                >
                  {membershipLoading ? <Loader2 className={styles.spinnerIcon} /> : <RotateCw size={14} />}
                  {t.common.refresh}
                </button>
              </div>
            </div>
            {!isSubscribed && (
              <div style={{ marginTop: 10, fontSize: 12, color: '#666' }}>
                {t.userTab.membership.benefits}
              </div>
            )}
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>{t.userTab.sections.credits}</h3>
          </div>
          <div className={styles.card}>
            {walletError && (
              <div className={styles.errorAlert}>
                <AlertCircle className={styles.alertIcon} />
                <span className={styles.errorText}>{walletError}</span>
              </div>
            )}
            <div className={styles.walletGrid}>
              <div className={styles.walletCard}>
                <div className={styles.walletLabel}><Coins size={16} /> {t.userTab.credits.balanceLabel}</div>
                <div className={styles.walletValue}>{walletLoading ? '...' : walletBalance.toFixed(2)}<span className={styles.walletUnit}> {t.common.creditsUnit}</span></div>
              </div>
              <div className={styles.walletCard}>
                <div className={styles.walletLabel}>{t.userTab.credits.spentLabel}</div>
                <div className={styles.walletValue}>{walletLoading ? '...' : walletTotalSpent.toFixed(2)}<span className={styles.walletUnit}> {t.common.creditsUnit}</span></div>
              </div>
              <div className={styles.walletActions}>
                <button
                  onClick={() => {
                    const url = import.meta.env.VITE_CREDIT_TOPUP_URL as string | undefined
                    if (url) {
                      window.open(url, '_blank')
                    } else {
                      alert(t.userTab.credits.purchaseInfo)
                    }
                  }}
                  className={styles.walletTopupButton}
                  title={t.userTab.credits.purchaseTitle}
                >
                  {t.userTab.credits.purchase}
                </button>
                <button
                  onClick={fetchWalletAndTransactions}
                  className={styles.refreshWalletButton}
                  disabled={walletLoading}
                  title={t.userTab.credits.refreshTooltip}
                >
                  {walletLoading ? <Loader2 className={styles.spinnerIcon} /> : <RotateCw size={14} />}
                  {t.common.refresh}
                </button>
              </div>
            </div>

            <div className={styles.walletTxSection}>
              <div className={styles.walletTxHeader}>{t.userTab.credits.recentTransactions}</div>
              {recentTxs.length === 0 ? (
                <div className={styles.walletTxEmpty}>{t.userTab.credits.noTransactions}</div>
              ) : (
                <table className={styles.walletTxTable}>
                  <thead>
                    <tr>
                      <th>{t.userTab.credits.headers.date}</th>
                      <th>{t.userTab.credits.headers.type}</th>
                      <th>{t.userTab.credits.headers.amount}</th>
                      <th>{t.userTab.credits.headers.model}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTxs.map(tx => (
                      <tr key={tx.id}>
                        <td>{new Date(tx.created_at).toLocaleString()}</td>
                        <td className={tx.type === 'debit' ? styles.txDebit : styles.txCredit}>{tx.type === 'debit' ? t.userTab.credits.type.debit : t.userTab.credits.type.credit}</td>
                        <td>{tx.type === 'debit' ? '-' : '+'}{Math.abs(tx.amount_usd).toFixed(3)} {t.common.creditsUnit}</td>
                        <td>{tx.model_name || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>{t.userTab.sections.currentDomain}</h3>
          </div>
          <div className={styles.domainInfo}>
            <span className={styles.domainText}>{currentDomain}</span>
            {getCurrentSiteStatus() ? (() => {
              const status = getCurrentSiteStatus()!
              const statusClass = status.connection_status || 'disconnected'
              const statusText = getStatusText(status.connection_status || 'disconnected')
              return (
                <div className={styles.statusRow}>
                  <span className={`${styles.statusBadge} ${styles[statusClass]}`}>
                    {statusText}
                  </span>
                  <button 
                    className={styles.refreshButton}
                    onClick={refreshCurrentSiteStatus}
                    disabled={isChecking}
                    title={t.userTab.currentDomain.refreshTooltip}
                  >
                    <RotateCw size={14} />
                  </button>
                </div>
              )
            })() : (
              <span className={`${styles.statusBadge} ${styles.disconnected}`}>
                {t.userTab.currentDomain.missing}
              </span>
            )}
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>{t.userTab.sections.addSite}</h3>
          </div>
          <div className={styles.card}>
            <form onSubmit={(e) => { e.preventDefault(); handleAddSite(); }} className={styles.formContainer}>
              <div className={styles.inputContainer}>
                <label htmlFor="domain-input" className={styles.inputLabel}>{t.userTab.addSite.label}</label>
                <input
                  id="domain-input"
                  type="text"
                  placeholder={t.userTab.addSite.placeholder}
                  value={newSiteDomain}
                  onChange={(e) => setNewSiteDomain(e.target.value)}
                  disabled={isAddingSite}
                  className={styles.domainInput}
                />
                <p className={styles.hint}>
                  {t.userTab.addSite.hint}
                </p>
              </div>

              {siteError && (
                <div className={styles.errorAlert}>
                  <AlertCircle className={styles.alertIcon} />
                  <span className={styles.errorText}>{siteError}</span>
                </div>
              )}

              <button
                type="submit"
                className={styles.submitButton}
                disabled={isAddingSite || !newSiteDomain.trim()}
              >
                {isAddingSite ? (
                  <>
                    <Loader2 className={styles.spinnerIcon} />
                    {t.userTab.addSite.submitting}
                  </>
                ) : (
                  <>
                    <Plus className={styles.plusIcon} />
                    {t.userTab.addSite.submit}
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>{t.userTab.sections.sites}</h3>
          </div>
          
          <div className={styles.card}>
            {connectedSites.length === 0 ? (
              <div className={styles.emptyState}>
                <Globe className={styles.emptyIcon} />
                <p className={styles.emptyTitle}>{t.userTab.sites.emptyTitle}</p>
                <p className={styles.emptyDesc}>{t.userTab.sites.emptyDescription}</p>
              </div>
            ) : (
              <div className={styles.sitesContainer}>
                {/* Site Selection */}
                <div className={styles.siteSelection}>
                  <label htmlFor="site-select" className={styles.selectLabel}>
                    {t.userTab.sites.selectLabel}
                  </label>
                  <select
                    id="site-select"
                    value={selectedSiteId}
                    onChange={(e) => handleSiteSelect(e.target.value)}
                    className={styles.siteSelect}
                  >
                    <option value="">{t.userTab.sites.selectPlaceholder}</option>
                    {connectedSites.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.domain === currentDomain ? '📍 ' : ''}{site.domain} - {getStatusText(site.connection_status || 'disconnected')}
                      </option>
                    ))}
                  </select>
                </div>
                
                {/* Selected Site Information */}
                {selectedSiteId && (() => {
                  const selected = connectedSites.find(site => site.id === selectedSiteId);
                  return selected ? (
                    <div className={styles.selectedSiteContainer}>
                      <h3 className={styles.siteInfoTitle}>{t.userTab.sites.infoTitle}</h3>
                      <div className={styles.siteInfoGrid}>
                        <div className={styles.infoRow}>
                          <label className={styles.infoLabel}>{t.userTab.sites.domainLabel}</label>
                          {editingSiteId === selected.id ? (
                            <div className={styles.editContainer}>
                              <input
                                value={editingDomain}
                                onChange={(e) => setEditingDomain(e.target.value)}
                                className={styles.editInput}
                                placeholder={t.userTab.sites.domainPlaceholder}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleSaveEditDomain(selected.id);
                                  } else if (e.key === 'Escape') {
                                    handleCancelEditDomain();
                                  }
                                }}
                                autoFocus
                              />
                              <button
                                onClick={() => handleSaveEditDomain(selected.id)}
                                disabled={isUpdatingDomain}
                                className={styles.saveButton}
                              >
                                {isUpdatingDomain ? (
                                  <Loader2 className={styles.spinnerIcon} />
                                ) : (
                                  <Check className={styles.checkIcon} />
                                )}
                              </button>
                              <button
                                onClick={handleCancelEditDomain}
                                className={styles.cancelButton}
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <p className={styles.infoValue}>{selected.domain}</p>
                          )}
                        </div>
                        <div className={styles.infoRow}>
                          <label className={styles.infoLabel}>{t.userTab.sites.scriptLabel}</label>
                          <div className={styles.scriptRow}>
                            <input
                              value={generateScript(selected.site_code || '')}
                              readOnly
                              className={styles.scriptInput}
                            />
                            <button
                              onClick={() => handleCopyScript(selected.site_code)}
                              title={t.userTab.sites.copyScriptTooltip}
                              className={styles.copyScriptButton}
                            >
                              {copiedScript ? (
                                <Check className={styles.successIcon} />
                              ) : (
                                <Copy className={styles.copyIcon} />
                              )}
                            </button>
                          </div>
                          <div>
                            <p className={styles.scriptHint}>{t.userTab.sites.scriptHint}</p>
                          </div>
                        </div>
                        
                        <div className={styles.actionRow}>
                          <div className={styles.actionButtons}>
                            <button
                              onClick={() => handleDeleteSite(selected.id, selected.domain)}
                              disabled={isDeletingSite === selected.id}
                              className={styles.deleteActionButton}
                            >
                              {isDeletingSite === selected.id ? (
                                <Loader2 className={styles.spinnerIcon} />
                              ) : (
                                <>
                                  <Trash2 className={styles.trashIcon} />
                                  {t.userTab.sites.delete}
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => handleStartEditDomain(selected)}
                              className={styles.editActionButton}
                            >
                              {t.userTab.sites.editDomain}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
            )}
          </div>
        </div>

      </div>
    )
  }

  return (
    <div className={styles.container}>
      <h3>{t.userTab.signIn.title}</h3>
      {error && <div className={styles.error}>{error}</div>}
      
      <div className={styles.providers}>
        <button 
          onClick={() => signInWithProvider('google')}
          className={`${styles.provider} ${styles.google}`}
        >
          {t.userTab.signIn.google}
        </button>
        
        <button 
          onClick={() => signInWithProvider('kakao')}
          className={`${styles.provider} ${styles.kakao}`}
        >
          {t.userTab.signIn.kakao}
        </button>
      </div>
    </div>
  )
}
