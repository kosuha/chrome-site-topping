import { useState, useRef, useEffect } from 'react';
import { useAppContext, ChatMessage } from '../contexts/AppContext';
import ThreadManager from './ThreadManager';
import aiService from '../services/aiService';
import domExtractor from '../services/domExtractor';
import styles from '../styles/ChatTab.module.css';
import { ArrowUp, Loader, Paperclip, X, List, CirclePlus, Coins, Lock } from 'lucide-react';
import { DEFAULT_AI_MODEL, LOCAL_STORAGE_KEYS, type AIModelKey } from '../config/aiModels';
import MessageComponent from './MessageComponent';
import useThreadSSE from '../hooks/useThreadSSE';
import useImageAttachments from '../hooks/useImageAttachments';
import { useWalletBalance } from '../hooks/useWalletBalance';
import useMembership from '../hooks/useMembership';
import { supabase } from '../services/supabase';
import { useTranslations } from '../hooks/useTranslations';

export default function ChatTab() {
  const { state, actions, computed } = useAppContext();
  const [showThreads, setShowThreads] = useState(false);
  const [inputValue, setInputValue] = useState('');
  // AI 모델 목록(서버 동적)과 선택 상태 - 서버 응답 전에는 비워둔다
  const [availableModels, setAvailableModels] = useState<Record<AIModelKey, { label: string }>>({});
  const [aiModel, setAiModel] = useState<AIModelKey>('');
  const walletBalance = useWalletBalance();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLDivElement>(null);
  const lastPickRef = useRef<{ selector: string; ts: number }>({ selector: '', ts: 0 });
  const { isSubscribed, status: membershipStatus } = useMembership();
  const t = useTranslations();

  // 커서를 contentEditable 끝으로 이동
  const setCaretToEnd = (el: HTMLElement) => {
    try {
      const selection = window.getSelection();
      if (!selection) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false); // 끝으로
      selection.removeAllRanges();
      selection.addRange(range);
      el.focus();
    } catch {}
  };

  // SITE_TOPPING_ELEMENT_PICKED 수신 -> 활성 탭이 Chat이면 입력창에 선택자 추가
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window || !e.data) return;
      const data = e.data as any;
      if (data.type === 'SITE_TOPPING_ELEMENT_PICKED' && state.activeTab === 'chat') {
        const selector = String(data.selector || '');
        if (!selector) return;
        const now = Date.now();
        if (selector === lastPickRef.current.selector && now - lastPickRef.current.ts < 250) {
          return;
        }
        lastPickRef.current = { selector, ts: now };
        setInputValue(prev => {
          const trimmedPrev = prev.trimEnd();
          const tokens = trimmedPrev.split(/\s+/);
          const lastTokenRaw = tokens[tokens.length - 1] || '';
          const lastToken = lastTokenRaw.replace(/^'+|'+$/g, '');
          if (lastToken === selector) return prev;
          const sep = prev && !prev.endsWith(' ') ? ' ' : '';
          const next = `${prev}${sep}'${selector}'`.slice(0, 2000);
          // contentEditable 동기화
          if (textareaRef.current) textareaRef.current.textContent = next;
          return next;
        });
        // 포커스 및 커서를 끝으로 이동
        const el = textareaRef.current;
        if (el) {
          el.focus();
          requestAnimationFrame(() => setCaretToEnd(el));
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [state.activeTab]);

  // SSE 연결 훅
  useThreadSSE();

  // 모델 목록 로드 + 최근 사용 모델 복원 (서버 목록 수신 전엔 아무것도 표시하지 않음)
  useEffect(() => {
    let cancelled = false;

    // 미구독 상태에선 모델 선택을 숨김 (아무것도 렌더링하지 않음)
    if (!isSubscribed) {
      return () => { cancelled = true; };
    }

    (async () => {
      try {
        const resp = await aiService.getSupportedModels();
        const list = resp?.data?.supported_models || [];
        let nextModels = availableModels;
        if (Array.isArray(list) && list.length > 0) {
          const mapped: Record<AIModelKey, { label: string }> = {};
          for (const key of list) mapped[key] = { label: key };
          nextModels = mapped;
          if (!cancelled) setAvailableModels(mapped);
        }

        // 로컬 스토리지 복원 (nextModels 기준)
        try {
          const saved = localStorage.getItem(LOCAL_STORAGE_KEYS.LAST_AI_MODEL);
          const keys = Object.keys(nextModels || {});
          const baseline = keys.includes(DEFAULT_AI_MODEL) ? DEFAULT_AI_MODEL : (keys[0] || '');
          if (saved && keys.includes(saved)) {
            if (!cancelled) setAiModel(saved);
          } else {
            if (!cancelled) setAiModel(baseline);
          }
        } catch {}
      } catch {
        // 실패 시에도 목록은 비워둔다 (아무것도 표시하지 않음)
      }
    })();
    return () => { cancelled = true; };
  }, [isSubscribed]);

  // 이미지 첨부/드래그 앤 드롭 훅
  const {
    attachedImages,
    loadingImages,
    isDragOver,
    fileInputRef,
    setAttachedImages,
    handleImageSelect,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
  } = useImageAttachments();

  // 디버깅용 의존성 최소화 유지: 필요 시 콘솔에서 확인만

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [computed.currentMessages, state.isAiLoading]);

  const handleSendMessage = async () => {
    // 구독 필요 가드
    if (!isSubscribed) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert(t.chatTab.alerts.loginRequired);
      } else {
        alert(t.chatTab.alerts.subscriptionRequired);
      }
      return;
    }
    if ((!inputValue.trim() && attachedImages.length === 0) || state.isAiLoading || loadingImages.length > 0) return;

    let currentThreadId = state.currentThreadId;

    if (currentThreadId) {
      const currentThread = state.chatThreads.find((t) => t.id === currentThreadId);
      if (currentThread) {
        const hasActivePendingMessage = currentThread.messages.some(
          (msg) => msg.type === 'assistant' && (msg.status === 'pending' || msg.status === 'in_progress')
        );
        if (hasActivePendingMessage) {
          return;
        }
      }
    }

  if (!currentThreadId || currentThreadId.trim() === '') {
      try {
        const response = await aiService.createThread();
        if (response.status === 'success') {
          const threadId = response.data.threadId || response.data.id;
          if (!threadId) throw new Error('Server did not return a thread ID');

          const newThread = {
            id: threadId,
            title: response.data.title || t.chatTab.defaultThreadTitle,
            messages: [],
            createdAt: new Date(response.data.created_at || Date.now()),
            updatedAt: new Date(response.data.updated_at || Date.now()),
          };

          actions.addServerThread(newThread);
          actions.setCurrentThread(newThread.id);
          currentThreadId = newThread.id;
        } else {
          throw new Error('Failed to create thread');
        }
      } catch (error) {
        console.error('새 스레드 생성 실패:', error);
        return;
      }
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
      status: 'completed',
      images: attachedImages.length > 0 ? [...attachedImages] : undefined,
    };

    if (!currentThreadId) {
      console.error('❌ 스레드 ID가 없습니다');
      actions.setAiLoading(false);
      return;
    }

  actions.addMessageToThread(currentThreadId, userMessage);
  // 최근 사용 모델 저장
  try { localStorage.setItem(LOCAL_STORAGE_KEYS.LAST_AI_MODEL, aiModel); } catch {}
    setInputValue('');
    setAttachedImages([]);
    actions.setAiLoading(true);

    if (textareaRef.current) {
      textareaRef.current.textContent = '';
    }

    const pendingAiMessage: ChatMessage = {
      id: `pending-${Date.now()}`,
      type: 'assistant',
      content: '',
      timestamp: new Date(),
      status: 'pending',
    };
    actions.addMessageToThread(currentThreadId, pendingAiMessage);

  try {
      const pageContext = domExtractor.createFullContext(
        computed.activeJavascript,
        computed.activeCss
      );

      const siteCode = state.selectedSiteCode;

  await aiService.sendChatMessage(
        userMessage.content,
        currentThreadId,
        {
          pageContext: pageContext,
          userCode: {
            javascript: computed.activeJavascript,
            css: computed.activeCss,
          },
          pageUrl: window.location.href,
          domInfo: domExtractor.extractPageDOM(),
          images: attachedImages.length > 0 ? attachedImages : undefined,
          // 사용자가 선택한 AI 모델을 서버로 전달
          ai_model_preferred: aiModel || undefined,
        },
        siteCode || undefined,
        false,
        attachedImages.length > 0 ? attachedImages : undefined
      );

    } catch (error) {
      console.error('AI 응답 오류:', error);

      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: (() => {
          const msg = error instanceof Error ? error.message : String(error)
          if (msg.includes('402') || msg.includes('크레딧') || msg.includes('충전')) {
            return t.chatTab.errors.insufficientCredits;
          }
          if (msg.includes('구독') || msg.includes('subscription') || msg.includes('403')) {
            return t.chatTab.errors.subscriptionRequired;
          }
          const fallback = msg || t.common.unknownError;
          return t.chatTab.errors.generic(fallback);
        })(),
        timestamp: new Date(),
        status: 'failed',
      };

      if (currentThreadId) {
        actions.addMessageToThread(currentThreadId, errorMessage);
      }
      actions.setAiLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !(e.nativeEvent as any).isComposing) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    const text = e.currentTarget.textContent || '';
    setInputValue(text.slice(0, 2000));
  };

  const handleThreadSelect = () => {
    setShowThreads(false);
  };

  const handleNewThread = () => {
    setShowThreads(false);
  };

  if (showThreads) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <button className={styles.backButton} onClick={() => setShowThreads(false)}>
            {t.chatTab.backButton}
          </button>
          <h3 className={styles.title}>{t.chatTab.threadListTitle}</h3>
        </div>
        <ThreadManager onThreadSelect={handleThreadSelect} onNewThread={handleNewThread} />
      </div>
    );
  }

  return (
    <div className={styles.container}>
  <div className={styles.header}>
        <h3 className={styles.title}>{t.chatTab.title}</h3>
        <div className={styles.headerActions}>
          <button className={styles.threadButton} onClick={() => setShowThreads(true)} title={t.chatTab.threadListButtonTitle}>
            <List size={16} />
          </button>
          <button
            className={styles.newChatButton}
            onClick={() => {
              actions.setCurrentThread(null);
            }}
            title={t.chatTab.newChatButtonTitle}
          >
            <CirclePlus size={16} />
          </button>
        </div>
      </div>

      <div className={styles.chatContainer}>
        <div className={styles.messagesAreaContainer}>
          <div className={styles.messagesArea}>
            {computed.currentMessages.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyStateIcon}>💬</div>
                <div className={styles.emptyStateText}>{t.chatTab.emptyState.title}</div>
                <div className={styles.emptyStateSubtext}>{t.chatTab.emptyState.description}</div>
              </div>
            ) : (
              <>
                {computed.currentMessages.map((message) => (
                  <MessageComponent key={message.id} message={message} />
                ))}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className={styles.inputArea}>
          <div
            className={`${styles.inputMainContainer} ${isDragOver ? styles.dragOver : ''}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <div className={styles.inputContent}>
              {!isSubscribed && (
                <div className={styles.noticeBox}>
                  <Lock size={14} />
                  <span>
                    {membershipStatus ? t.chatTab.notices.withAccount : t.chatTab.notices.withoutAccount}
                  </span>
                </div>
              )}
              {isDragOver && (
                <div className={styles.dragOverlay}>
                  <div className={styles.dragOverlayContent}>
                    <div className={styles.dragOverlayText}>{t.chatTab.dragOverlay.title}</div>
                    <div className={styles.dragOverlaySubtext}>{t.chatTab.dragOverlay.subtitle}</div>
                  </div>
                </div>
              )}

              {(attachedImages.length > 0 || loadingImages.length > 0) && (
                <div className={styles.imagesPreview}>
                  <div className={styles.imagesGrid}>
                    {attachedImages.map((imageData, index) => (
                      <div key={`image-${index}`} className={styles.imagePreviewItem}>
                        <img src={imageData} alt={t.chatTab.attachments.alt(index + 1)} className={styles.imagePreview} />
                        <button
                          type="button"
                          onClick={() => {
                            setAttachedImages((prev) => prev.filter((_, i) => i !== index));
                          }}
                          className={styles.imageRemoveButton}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}

                    {loadingImages.map((_, index) => (
                      <div key={`loading-${index}`} className={styles.imagePreviewItem}>
                        <div className={styles.imageLoadingSkeleton}>
                          <Loader size={12} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className={styles.textInputContainer}>
                <div className={styles.textInputWrapper}>
                  <div
                    ref={textareaRef}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={handleInput}
                    onKeyDown={handleKeyDown}
                    className={styles.textInputEditable}
                    data-placeholder={t.chatTab.placeholder}
                    aria-disabled={!isSubscribed}
                    style={{ pointerEvents: isSubscribed ? 'auto' : 'none', opacity: isSubscribed ? 1 : 0.5 }}
                  />
                </div>
              </div>

              <div className={styles.bottomControls}>
                <div className={styles.controlsLeft}>
                  <div className={styles.attachButtonContainer}>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageSelect}
                      className={styles.hiddenFileInput}
                    />
                    <button
                      type="button"
                      onClick={() => isSubscribed && fileInputRef.current?.click()}
                      className={`${styles.attachButton} ${attachedImages.length > 0 ? styles.attachButtonActive : ''}`}
                      disabled={!isSubscribed}
                    >
                      <Paperclip size={16} />
                    </button>
                  </div>
                  {/* 모델 선택 드롭다운: 서버 목록 수신 전엔 렌더하지 않음 */}
                  {isSubscribed && Object.keys(availableModels).length > 0 && (
                    <div className={styles.modelSelectContainer} title={t.chatTab.modelSelectTitle}>
                      <select
                        className={styles.modelSelect}
                        value={aiModel}
                        onChange={(e) => {
                          const next = e.target.value as AIModelKey;
                          setAiModel(next);
                          try { localStorage.setItem(LOCAL_STORAGE_KEYS.LAST_AI_MODEL, next); } catch {}
                        }}
                        disabled={!isSubscribed || state.isAiLoading}
                      >
                        {Object.entries(availableModels).map(([key, { label }]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className={styles.controlsRight}>
                  {walletBalance !== null && (
                    <div className={styles.walletBadge} title={t.chatTab.walletTooltip(walletBalance.toFixed(3), t.common.creditsUnit)}>
                      <Coins size={16} />
                      <span>{walletBalance.toFixed(2)}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleSendMessage}
                    disabled={!isSubscribed || (!inputValue.trim() && attachedImages.length === 0) || state.isAiLoading || loadingImages.length > 0}
                    className={styles.sendButton}
                  >
                    <ArrowUp size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
