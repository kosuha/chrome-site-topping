import { useAuth } from '../contexts/AuthContext'
import { useAppContext } from '../contexts/AppContext'
import { useState, useEffect } from 'react'
import { SiteIntegrationService, Site } from '../services/siteIntegration'
import styles from '../styles/UserTab.module.css'
import { Copy, Check, Plus, Loader2, AlertCircle, Globe, Trash2, RotateCw, Coins, Crown } from 'lucide-react'
import useMembership from '../hooks/useMembership'

export default function UserTab() {
  const { user, loading, error, signInWithProvider, signOut } = useAuth()
  const { actions } = useAppContext()
  const { status: membership, isSubscribed, loading: membershipLoading, error: membershipError, refresh: refreshMembership } = useMembership()
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
    // Chrome Extension에서 현재 활성 탭의 실제 도메인 가져오기
    const getCurrentDomain = async () => {
      try {
        console.log('현재 탭 정보 가져오는 중...');
        
        // Chrome tabs API를 통해 현재 활성 탭의 정보 가져오기
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (activeTab?.url) {
          const url = new URL(activeTab.url);
          const hostname = url.hostname;
          
          console.log('활성 탭 URL:', activeTab.url);
          console.log('감지된 hostname:', hostname);
          
          // 유효한 도메인인지 확인
          if (hostname && 
              hostname !== 'localhost' && 
              !hostname.startsWith('chrome-extension://') && 
              !hostname.startsWith('moz-extension://') &&
              !hostname.includes('extension') &&
              hostname.length > 0) {
            
            console.log('유효한 도메인으로 설정:', hostname);
            setCurrentDomain(hostname);
            setNewSiteDomain(hostname);
          } else {
            console.log('유효하지 않은 도메인:', hostname, '- 기본값 사용');
            setCurrentDomain('example.com');
            setNewSiteDomain('example.com');
          }
        } else {
          console.log('활성 탭 URL 없음 - 기본값 사용');
          setCurrentDomain('example.com');
          setNewSiteDomain('example.com');
        }
      } catch (error) {
        console.error('현재 탭 정보 가져오기 실패:', error);
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
      // API 응답 구조 확인: sites 배열이 직접 반환됨
      const sitesArray = Array.isArray(response) ? response : ((response as any)?.sites || []);
      
      // 연결 상태를 실제 스크립트 설치 여부로 확인
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
            error_message: '연동 상태 확인 실패',
            last_checked_at: new Date().toISOString()
          }
        }
      }))
      
      setConnectedSites(sitesWithStatus)
      
      // 현재 도메인과 일치하는 사이트를 우선 선택
      const currentSite = sitesWithStatus.find((site: any) => site.domain === currentDomain)
      if (currentSite) {
        setSelectedSiteId(currentSite.id)
        await loadSiteScript(currentSite)
        if (currentSite.site_code) {
          console.log('🎯 [UserTab] 자동 선택된 사이트:', currentSite.site_code)
          actions.setSelectedSiteCode(currentSite.site_code)
        }
      } else if (sitesWithStatus.length > 0) {
        // 현재 도메인과 일치하는 사이트가 없으면 첫 번째 사이트 선택
        setSelectedSiteId(sitesWithStatus[0].id)
        await loadSiteScript(sitesWithStatus[0])
        if (sitesWithStatus[0].site_code) {
          console.log('🎯 [UserTab] 첫 번째 사이트 자동 선택:', sitesWithStatus[0].site_code)
          actions.setSelectedSiteCode(sitesWithStatus[0].site_code)
        }
      }
    } catch (err) {
      setSiteError(err instanceof Error ? err.message : '사이트 목록을 불러오는 중 오류가 발생했습니다.')
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
      setWalletError(e instanceof Error ? e.message : '크레딧 정보를 불러오지 못했습니다')
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
        console.log('🎯 [UserTab] 사이트 선택됨:', selectedSite.site_code)
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
        console.error('클립보드 복사 실패:', err)
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
        setSiteError('유효한 도메인을 입력해주세요.');
        return;
      }

      // 중복 도메인 체크
      if (connectedSites.some(site => site.domain === sanitizedDomain)) {
        setSiteError('이미 등록된 도메인입니다.');
        return;
      }

      await siteService.addSite({ domain: sanitizedDomain });
      
      // 사이트 목록 새로고침
      await loadConnectedSites();
      
      // 폼 초기화
      setNewSiteDomain('');
      
    } catch (error) {
      console.error('사이트 추가 실패:', error);
      setSiteError(error instanceof Error ? error.message : '사이트 추가에 실패했습니다.');
    } finally {
      setIsAddingSite(false);
    }
  };

  const handleDeleteSite = async (siteId: string, siteDomain: string) => {
    if (isDeletingSite || !siteId) return;

    const confirmed = window.confirm(`정말로 "${siteDomain}" 사이트를 삭제하시겠습니까?\n\n경고: 이 작업은 되돌릴 수 없습니다.`);
    
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
      console.error('사이트 삭제 실패:', error);
      setSiteError(error instanceof Error ? error.message : '사이트 삭제에 실패했습니다.');
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
        setSiteError('유효한 도메인을 입력해주세요.')
        return
      }

      // 중복 도메인 체크
      if (connectedSites.some(site => site.domain === sanitizedDomain && site.id !== siteId)) {
        setSiteError('이미 등록된 도메인입니다.')
        return
      }

      await siteService.updateSite(siteId, { site_name: sanitizedDomain as string })
      await loadConnectedSites()
      
      setEditingSiteId(null)
      setEditingDomain('')
    } catch (error) {
      console.error('도메인 수정 실패:', error)
      setSiteError(error instanceof Error ? error.message : '도메인 수정에 실패했습니다.')
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
        return '연결됨'
      case 'checking':
        return '확인중'
      default:
        return '연결안됨'
    }
  }

  const handleDeleteAccount = async () => {
    if (isDeletingAccount) return;

    const confirmed = window.confirm(
      '정말로 계정을 삭제하시겠습니까?\n\n경고: 이 작업은 되돌릴 수 없습니다.\n- 모든 사이트 연동 정보가 삭제됩니다\n- 모든 채팅 기록이 삭제됩니다\n- 모든 스크립트 데이터가 삭제됩니다'
    );
    
    if (!confirmed) return;

    const doubleConfirmed = window.confirm(
      '마지막 확인입니다.\n\n계정을 완전히 삭제하시겠습니까?\n\n삭제된 데이터는 복구할 수 없습니다.'
    );

    if (!doubleConfirmed) return;

    try {
      setIsDeletingAccount(true);
      setSiteError('');

      // Supabase 세션에서 토큰 가져오기
      const { supabase } = await import('../services/supabase')
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.access_token) {
        throw new Error('인증 토큰을 찾을 수 없습니다. 다시 로그인해주세요.');
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
        throw new Error(errorData.detail || '계정 삭제에 실패했습니다');
      }

      // 성공 시 로그아웃 처리
      alert('계정이 성공적으로 삭제되었습니다.');
      await signOut();
      
    } catch (error) {
      console.error('계정 삭제 실패:', error);
      setSiteError(error instanceof Error ? error.message : '계정 삭제에 실패했습니다.');
    } finally {
      setIsDeletingAccount(false);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading...</div>
  }

  if (user) {
    // const selectedSite = connectedSites.find(site => site.id === selectedSiteId); // Removed - not used in new layout

    return (
      <div className={styles.container}>
        {/* 사용자 정보 섹션 */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>계정 정보</h3>
          </div>
          <div className={styles.userInfo}>
            <div className={styles.userEmail}>{user.email}</div>
            <div className={styles.accountActions}>
              <button onClick={signOut} className={styles.signOutButton}>
                로그아웃
              </button>
              <button 
                onClick={handleDeleteAccount}
                disabled={isDeletingAccount}
                className={styles.deleteAccountButton}
              >
                {isDeletingAccount ? (
                  <>
                    <Loader2 className={styles.spinnerIcon} />
                    삭제 중...
                  </>
                ) : (
                  '회원탈퇴'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 멤버십 상태 섹션 */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>멤버십</h3>
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
                    {membershipLoading ? '상태 불러오는 중...' : (isSubscribed ? '구독 활성화' : '무료 플랜')}
                  </div>
                  <div style={{ fontSize: 12, color: '#666' }}>
                    {membershipLoading ? '' : (() => {
                      if (!membership) return '로그인 상태에서 확인됩니다.';
                      if (membership.is_expired) return '만료됨';
                      if (membership.expires_at) {
                        const dd = membership.days_remaining ?? null;
                        const d = new Date(membership.expires_at);
                        return `만료일: ${isNaN(d.getTime()) ? membership.expires_at : d.toLocaleDateString()}${dd !== null ? ` (D-${dd})` : ''}`;
                      }
                      return '제한 없음';
                    })()}
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
                      alert('구독/업그레이드는 웹 서비스에서 진행해주세요. (환경변수 VITE_SUBSCRIBE_URL 설정 시 이 버튼으로 이동합니다)');
                    }
                  }}
                  className={styles.signOutButton}
                  title={isSubscribed ? '업그레이드/연장' : '구독하기'}
                >
                  {isSubscribed ? '업그레이드/연장' : '구독하기'}
                </button>
                <button
                  onClick={() => void refreshMembership()}
                  className={styles.refreshWalletButton}
                  disabled={membershipLoading}
                  title="멤버십 상태 새로고침"
                >
                  {membershipLoading ? <Loader2 className={styles.spinnerIcon} /> : <RotateCw size={14} />}
                  새로고침
                </button>
              </div>
            </div>
            {!isSubscribed && (
              <div style={{ marginTop: 10, fontSize: 12, color: '#666' }}>
                구독 시 AI 채팅, 배포, 버전 관리 기능을 사용할 수 있습니다.
              </div>
            )}
          </div>
        </div>

        {/* 현재 도메인 정보 */}
        {/* 크레딧 정보 */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>크레딧</h3>
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
                <div className={styles.walletLabel}><Coins size={16} /> 잔액</div>
                <div className={styles.walletValue}>{walletLoading ? '...' : walletBalance.toFixed(2)}<span className={styles.walletUnit}> 크레딧</span></div>
              </div>
              <div className={styles.walletCard}>
                <div className={styles.walletLabel}>누적 사용</div>
                <div className={styles.walletValue}>{walletLoading ? '...' : walletTotalSpent.toFixed(2)}<span className={styles.walletUnit}> 크레딧</span></div>
              </div>
              <div className={styles.walletActions}>
                <button
                  onClick={() => {
                    const url = import.meta.env.VITE_CREDIT_TOPUP_URL as string | undefined
                    if (url) {
                      window.open(url, '_blank')
                    } else {
                      alert('크레딧 구매는 웹 서비스에서 진행해주세요. (환경변수 VITE_CREDIT_TOPUP_URL 설정 시 이 버튼으로 이동합니다)')
                    }
                  }}
                  className={styles.walletTopupButton}
                  title="크레딧 구매"
                >
                  크레딧 구매
                </button>
                <button
                  onClick={fetchWalletAndTransactions}
                  className={styles.refreshWalletButton}
                  disabled={walletLoading}
                  title="크레딧 정보 새로고침"
                >
                  {walletLoading ? <Loader2 className={styles.spinnerIcon} /> : <RotateCw size={14} />}
                  새로고침
                </button>
              </div>
            </div>

            <div className={styles.walletTxSection}>
              <div className={styles.walletTxHeader}>최근 거래</div>
              {recentTxs.length === 0 ? (
                <div className={styles.walletTxEmpty}>표시할 거래가 없습니다</div>
              ) : (
                <table className={styles.walletTxTable}>
                  <thead>
                    <tr>
                      <th>일시</th>
                      <th>유형</th>
                      <th>금액</th>
                      <th>모델</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTxs.map(tx => (
                      <tr key={tx.id}>
                        <td>{new Date(tx.created_at).toLocaleString()}</td>
                        <td className={tx.type === 'debit' ? styles.txDebit : styles.txCredit}>{tx.type === 'debit' ? '차감' : '충전'}</td>
                        <td>{tx.type === 'debit' ? '-' : '+'}{Math.abs(tx.amount_usd).toFixed(3)} 크레딧</td>
                        <td>{tx.model_name || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* 현재 도메인 정보 */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>현재 도메인</h3>
          </div>
          <div className={styles.domainInfo}>
            <span className={styles.domainText}>{currentDomain}</span>
            {getCurrentSiteStatus() ? (() => {
              const status = getCurrentSiteStatus()!
              const statusClass = status.connection_status || 'disconnected'
              const statusText = status.connection_status === 'connected' ? '연동됨' :
                               status.connection_status === 'checking' ? '확인중' : 
                               '연동 필요'
              return (
                <div className={styles.statusRow}>
                  <span className={`${styles.statusBadge} ${styles[statusClass]}`}>
                    {statusText}
                  </span>
                  <button 
                    className={styles.refreshButton}
                    onClick={refreshCurrentSiteStatus}
                    disabled={isChecking}
                    title="연동 상태 다시 확인"
                  >
                    <RotateCw size={14} />
                  </button>
                </div>
              )
            })() : (
              <span className={`${styles.statusBadge} ${styles.disconnected}`}>
                등록 필요
              </span>
            )}
          </div>
        </div>

        {/* 웹사이트 추가 섹션 */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>웹사이트 추가</h3>
          </div>
          <div className={styles.card}>
            <form onSubmit={(e) => { e.preventDefault(); handleAddSite(); }} className={styles.formContainer}>
              <div className={styles.inputContainer}>
                <label htmlFor="domain-input" className={styles.inputLabel}>도메인</label>
                <input
                  id="domain-input"
                  type="text"
                  placeholder="도메인 입력 (예: example.com)"
                  value={newSiteDomain}
                  onChange={(e) => setNewSiteDomain(e.target.value)}
                  disabled={isAddingSite}
                  className={styles.domainInput}
                />
                <p className={styles.hint}>
                  도메인만 입력하세요 (http://, www. 제외)
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
                    추가 중...
                  </>
                ) : (
                  <>
                    <Plus className={styles.plusIcon} />
                    웹사이트 추가
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* 사이트 연동 설정 */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>연결된 웹사이트</h3>
          </div>
          
          <div className={styles.card}>
            {connectedSites.length === 0 ? (
              <div className={styles.emptyState}>
                <Globe className={styles.emptyIcon} />
                <p className={styles.emptyTitle}>연결된 사이트가 없습니다</p>
                <p className={styles.emptyDesc}>위에서 웹사이트를 추가해보세요</p>
              </div>
            ) : (
              <div className={styles.sitesContainer}>
                {/* Site Selection */}
                <div className={styles.siteSelection}>
                  <label htmlFor="site-select" className={styles.selectLabel}>
                    사이트 선택
                  </label>
                  <select
                    id="site-select"
                    value={selectedSiteId}
                    onChange={(e) => handleSiteSelect(e.target.value)}
                    className={styles.siteSelect}
                  >
                    <option value="">사이트를 선택하세요</option>
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
                      <h3 className={styles.siteInfoTitle}>사이트 정보</h3>
                      <div className={styles.siteInfoGrid}>
                        <div className={styles.infoRow}>
                          <label className={styles.infoLabel}>도메인</label>
                          {editingSiteId === selected.id ? (
                            <div className={styles.editContainer}>
                              <input
                                value={editingDomain}
                                onChange={(e) => setEditingDomain(e.target.value)}
                                className={styles.editInput}
                                placeholder="도메인을 입력하세요"
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
                          <label className={styles.infoLabel}>연동 스크립트</label>
                          <div className={styles.scriptRow}>
                            <input
                              value={generateScript(selected.site_code || '')}
                              readOnly
                              className={styles.scriptInput}
                            />
                            <button
                              onClick={() => handleCopyScript(selected.site_code)}
                              title="스크립트 복사"
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
                            <p className={styles.scriptHint}>
                              이 스크립트를 웹사이트의 <code>&lt;/body&gt;</code> 태그 바로 앞에 추가하세요.
                            </p>
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
                                  삭제
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => handleStartEditDomain(selected)}
                              className={styles.editActionButton}
                            >
                              도메인 수정
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
      <h3>Sign In</h3>
      {error && <div className={styles.error}>{error}</div>}
      
      <div className={styles.providers}>
        <button 
          onClick={() => signInWithProvider('google')}
          className={`${styles.provider} ${styles.google}`}
        >
          Continue with Google
        </button>
        
        <button 
          onClick={() => signInWithProvider('kakao')}
          className={`${styles.provider} ${styles.kakao}`}
        >
          Continue with Kakao
        </button>
      </div>
    </div>
  )
}