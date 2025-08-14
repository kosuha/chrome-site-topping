import { useAuth } from '../contexts/AuthContext'
import { useState, useEffect } from 'react'
import { SiteIntegrationService, Site } from '../services/siteIntegration'
import styles from '../styles/UserTab.module.css'
import { Copy, Check, Plus, Loader2, AlertCircle, Globe, Trash2, RotateCw } from 'lucide-react'

export default function UserTab() {
  const { user, loading, error, signInWithProvider, signOut } = useAuth()
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

  
  const siteService = SiteIntegrationService.getInstance()

  useEffect(() => {
    // 현재 사이트의 도메인 가져기
    const hostname = window.location.hostname
    setCurrentDomain(hostname)
    
    // newSiteDomain의 초기값을 현재 도메인으로 설정
    setNewSiteDomain(hostname)
    
    // 사용자가 로그인한 경우 연동된 사이트 목록 로드
    if (user) {
      loadConnectedSites()
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
      } else if (sitesWithStatus.length > 0) {
        // 현재 도메인과 일치하는 사이트가 없으면 첫 번째 사이트 선택
        setSelectedSiteId(sitesWithStatus[0].id)
        await loadSiteScript(sitesWithStatus[0])
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
      await loadSiteScript(selectedSite)
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