import { useAuth } from '../contexts/AuthContext'
import { useState, useEffect } from 'react'
import { SiteIntegrationService, Site } from '../services/siteIntegration'
import styles from '../styles/UserTab.module.css'

export default function UserTab() {
  const { user, loading, error, signInWithProvider, signOut } = useAuth()
  const [currentDomain, setCurrentDomain] = useState<string>('')
  const [integrationScript, setIntegrationScript] = useState<string>('')
  const [connectedSites, setConnectedSites] = useState<Site[]>([])
  const [selectedSiteId, setSelectedSiteId] = useState<string>('')
  const [siteError, setSiteError] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  
  const siteService = SiteIntegrationService.getInstance()

  useEffect(() => {
    // 현재 사이트의 도메인 가져기
    setCurrentDomain(window.location.hostname)
    
    // 사용자가 로그인한 경우 연동된 사이트 목록 로드
    if (user) {
      loadConnectedSites()
    }
  }, [user])

  const loadConnectedSites = async () => {
    setSiteError('')
    try {
      const response = await siteService.getUserSites()
      // API 응답 구조 확인: sites 배열이 직접 반환됨
      const sitesArray = Array.isArray(response) ? response : ((response as any)?.sites || []);
      console.log('연동된 사이트 목록:', sitesArray);

      
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
        console.log('현재 도메인과 일치하는 사이트 자동 선택:', currentSite.site_name, currentSite.domain)
        setSelectedSiteId(currentSite.id)
        await loadSiteScript(currentSite)
      } else if (sitesWithStatus.length > 0) {
        // 현재 도메인과 일치하는 사이트가 없으면 첫 번째 사이트 선택
        console.log('현재 도메인과 일치하는 사이트가 없어 첫 번째 사이트 선택:', sitesWithStatus[0].site_name)
        setSelectedSiteId(sitesWithStatus[0].id)
        await loadSiteScript(sitesWithStatus[0])
      } else {
        console.log('연동된 사이트가 없습니다')
      }
    } catch (err) {
      setSiteError(err instanceof Error ? err.message : '사이트 목록을 불러오는 중 오류가 발생했습니다.')
    }
  }

  const loadSiteScript = async (site: Site) => {
    // 사용자에게는 항상 HTML script 태그를 보여줌
    setIntegrationScript(siteService.generateIntegrationScript(site.domain, site.site_code))
  }

  const handleSiteSelect = async (siteId: string) => {
    setSelectedSiteId(siteId)
    const selectedSite = connectedSites?.find(site => site.id === siteId)
    if (selectedSite) {
      // 사용자에게는 항상 HTML script 태그를 보여줌
      setIntegrationScript(siteService.generateIntegrationScript(selectedSite.domain, selectedSite.site_code))
    }
  }

  // 복사 버튼 UX 개선: 알림 대신 배지 표시
  const handleCopyScript = () => {
    if (!integrationScript) return
    navigator.clipboard.writeText(integrationScript)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(err => {
        console.error('클립보드 복사 실패:', err)
      })
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

  if (loading) {
    return <div className={styles.loading}>Loading...</div>
  }

  if (user) {
    return (
      <div className={styles.container}>
        <div className={styles.userInfo}>
          <h3>Welcome, {user.email}!</h3>
          <p>You are signed in</p>
          {user.user_metadata?.avatar_url && (
            <img 
              src={user.user_metadata.avatar_url} 
              alt="Profile" 
              className={styles.avatar}
            />
          )}
        </div>
        
        <div className={styles.integrationSection}>
          <h4>사이트 연동 관리</h4>
          
          {siteError && <div className={styles.error}>{siteError}</div>}
          
          <div className={styles.domainInfo}>
            <label>현재 도메인:</label>
            <span className={styles.domain}>{currentDomain}</span>
            {getCurrentSiteStatus() ? (() => {
              const status = getCurrentSiteStatus()!
              const statusClass = status.connection_status || 'disconnected'
              const statusText = status.connection_status === 'connected' ? '✓ 연동됨' :
                               status.connection_status === 'checking' ? '⟳ 확인중' : 
                               '○ 연동 필요'
              return (
                <>
                  <span className={`${styles.status} ${styles[statusClass]}`}>
                    {statusText}
                  </span>
                  <button 
                    className={styles.refreshButton}
                    onClick={refreshCurrentSiteStatus}
                    disabled={isChecking}
                    title="연동 상태 다시 확인"
                  >
                    ⟳ 다시 확인
                  </button>
                  {status.error_message && (
                    <span className={styles.statusHint}>{status.error_message}</span>
                  )}
                </>
              )
            })() : (
              <span className={`${styles.status} ${styles.disconnected}`}>
                📝 사이트 등록 필요
              </span>
            )}
          </div>
          
          <div className={styles.siteManagement}>
            {connectedSites && connectedSites.length > 0 && (
              <div className={styles.siteSelector}>
                <label>연동된 사이트 선택:</label>
                <select 
                  className={styles.siteDropdown}
                  value={selectedSiteId}
                  onChange={(e) => handleSiteSelect(e.target.value)}
                >
                  <option value="">사이트를 선택하세요</option>
                  {connectedSites.map((site) => {
                    const isCurrentSite = site.domain === currentDomain
                    const statusIcon = site.connection_status === 'connected' ? ' ✓ 연결됨' : 
                                     site.connection_status === 'checking' ? ' ⟳ 확인중' : ' ○ 연결안됨'
                    const currentLabel = isCurrentSite ? ' [현재 사이트]' : ''
                    
                    return (
                      <option key={site.id} value={site.id}>
                        {site.site_name} ({site.domain}){statusIcon}{currentLabel}
                      </option>
                    )
                  })}
                </select>
              </div>
            )}
          </div>
          
          {selectedSiteId && (
            <div className={styles.scriptSection}>
              <div className={styles.scriptHeader}>
                <label>연동 스크립트</label>
                <span className={styles.siteInfo}>
                  ({connectedSites?.find(s => s.id === selectedSiteId)?.site_name})
                </span>
              </div>
              
              <div className={styles.scriptContainer}>
                <textarea
                  className={styles.scriptTextarea}
                  value={integrationScript}
                  readOnly
                  placeholder="연동 스크립트가 여기에 표시됩니다..."
                  rows={4}
                />
                
                <div className={styles.scriptActions}>
                  <button 
                    className={styles.copyButton}
                    onClick={handleCopyScript}
                    disabled={!integrationScript}
                  >
                    📋 복사
                  </button>
                  {copied && <span className={styles.copiedBadge}>복사됨</span>}
                </div>
              </div>
              
              <div className={styles.scriptInstructions}>
                <p>설치 방법</p>
                <ul className={styles.hintList}>
                  <li>위 스크립트를 복사하여 웹사이트의 &lt;head&gt; 태그 안(가능하면 가장 아래)에 붙여넣으세요.</li>
                  <li>캐시가 있는 경우, 새로고침(Shift + Reload) 후 적용 여부를 확인하세요.</li>
                  <li>연동이 완료되면 상태가 자동으로 ✓ 연동됨 으로 표시됩니다.</li>
                </ul>
              </div>
            </div>
          )}
        </div>
        
        <button 
          onClick={signOut}
          className={styles.signOutButton}
        >
          Sign Out
        </button>
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