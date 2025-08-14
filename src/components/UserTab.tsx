import { useAuth } from '../contexts/AuthContext'
import { useState, useEffect, useRef } from 'react'
import { SiteIntegrationService, Site } from '../services/siteIntegration'
import styles from '../styles/UserTab.module.css'
import { Copy, Check, Plus, Loader2, AlertCircle, Globe, ChevronDown, Trash2 } from 'lucide-react'

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
  const [showSiteDropdown, setShowSiteDropdown] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null)
  const [editingDomain, setEditingDomain] = useState('')
  const [isUpdatingDomain, setIsUpdatingDomain] = useState(false)
  const [copiedScript, setCopiedScript] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showSiteDropdown && dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowSiteDropdown(false)
      }
    }

    if (showSiteDropdown) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [showSiteDropdown])
  
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
      // 사용자에게는 항상 HTML script 태그를 보여줌
      setIntegrationScript(siteService.generateIntegrationScript(selectedSite.domain, selectedSite.site_code))
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

  const handleDeleteSite = async (siteId: string) => {
    if (isDeletingSite || !siteId) return;

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
      setShowDeleteConfirm(null);
      
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
        return <span className={styles.statusIcon}>✓</span>
      case 'checking':
        return <span className={styles.statusIcon}>⟳</span>
      default:
        return <span className={styles.statusIcon}>○</span>
    }
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
        return styles.statusConnected
      case 'checking':
        return styles.statusChecking
      default:
        return styles.statusDisconnected
    }
  }

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
            <button onClick={signOut} className={styles.signOutButton}>
              로그아웃
            </button>
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
                    ⟳
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
                {/* Site Selection Dropdown */}
                <div className={styles.siteSelection}>
                  <div className={styles.dropdownContainer} ref={dropdownRef}>
                    <button
                      onClick={() => setShowSiteDropdown(!showSiteDropdown)}
                      className={styles.dropdownTrigger}
                    >
                      <div className={styles.dropdownContent}>
                        {(() => {
                          const selected = connectedSites.find(site => site.id === selectedSiteId);
                          if (selected) {
                            return (
                              <>
                                {getStatusIcon(selected.connection_status || 'disconnected')}
                                <span className={styles.siteName}>
                                  {selected.domain}
                                </span>
                                <span className={getStatusColor(selected.connection_status || 'disconnected')}>
                                  {getStatusText(selected.connection_status || 'disconnected')}
                                </span>
                              </>
                            );
                          }
                          return <span className={styles.placeholderText}>사이트를 선택하세요</span>;
                        })()}
                      </div>
                      <ChevronDown className={`${styles.chevronIcon} ${showSiteDropdown ? styles.rotated : ''}`} />
                    </button>
                    
                    {showSiteDropdown && (
                      <div className={styles.dropdownMenu}>
                        {connectedSites.map((site) => (
                          <div key={site.id} className={styles.dropdownItem}>
                            <button
                              onClick={() => {
                                setSelectedSiteId(site.id);
                                setShowSiteDropdown(false);
                                handleSiteSelect(site.id);
                              }}
                              className={`${styles.dropdownItemButton} ${
                                selectedSiteId === site.id ? styles.selectedItem : ''
                              }`}
                            >
                              <div className={styles.dropdownItemContent}>
                                {getStatusIcon(site.connection_status || 'disconnected')}
                                <div className={styles.siteDetails}>
                                  <p className={styles.dropdownSiteName}>
                                    {site.domain}
                                  </p>
                                  <div className={styles.statusContainer}>
                                    <span className={getStatusColor(site.connection_status || 'disconnected')}>
                                      {getStatusText(site.connection_status || 'disconnected')}
                                    </span>
                                  </div>
                                  {site.error_message && (
                                    <p className={styles.errorText}>
                                      {site.error_message}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
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
                              onClick={() => setShowDeleteConfirm(selected.id)}
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

        {/* 삭제 확인 모달 */}
        {showDeleteConfirm && (() => {
          const siteToDelete = connectedSites.find(site => site.id === showDeleteConfirm);
          return siteToDelete ? (
            <div className={styles.modal}>
              <div className={styles.modalContent}>
                <h3>사이트 삭제</h3>
                <p>정말로 "<strong>{siteToDelete.domain}</strong>" 사이트를 삭제하시겠습니까?</p>
                <div className={styles.warning}>
                  <p>⚠️ 이 작업은 되돌릴 수 없습니다</p>
                </div>
                <div className={styles.modalActions}>
                  <button 
                    className={styles.cancelButton}
                    onClick={() => setShowDeleteConfirm(null)}
                  >
                    취소
                  </button>
                  <button 
                    className={styles.confirmDeleteButton}
                    onClick={() => handleDeleteSite(showDeleteConfirm)}
                    disabled={isDeletingSite === showDeleteConfirm}
                  >
                    {isDeletingSite === showDeleteConfirm ? '삭제중...' : '삭제'}
                  </button>
                </div>
              </div>
            </div>
          ) : null;
        })()}
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