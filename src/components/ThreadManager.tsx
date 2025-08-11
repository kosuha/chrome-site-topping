import React, { useState, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import aiService from '../services/aiService';
import { Plus, MessageSquare, Trash2, Edit2, Check, X } from 'lucide-react';
import styles from '../styles/ThreadManager.module.css';

interface ThreadManagerProps {
  onThreadSelect?: (threadId: string) => void;
  onNewThread?: () => void;
}

export default function ThreadManager({ onThreadSelect, onNewThread }: ThreadManagerProps) {
  const { state, actions } = useAppContext();
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 서버에서 스레드 목록 로드
  useEffect(() => {
    const loadThreads = async () => {
      try {
        setIsLoading(true);
        const response = await aiService.getThreads();
        
        if (response.status === 'success') {
          // 서버 데이터를 로컬 상태 형식으로 변환
          const serverThreads = response.data.map(thread => ({
            id: thread.id,
            title: thread.title || '새 대화',
            messages: [], // 메시지는 별도로 로드
            createdAt: new Date(thread.created_at || Date.now()),
            updatedAt: new Date(thread.updated_at || Date.now()),
          }));
          
          // 로컬 상태 업데이트
          actions.loadThreadsFromServer(serverThreads);
        }
      } catch (error) {
        console.error('스레드 목록 로드 실패:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadThreads();
  }, []);

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return '방금 전';
    if (minutes < 60) return `${minutes}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    if (days < 7) return `${days}일 전`;
    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  };

  const handleNewThread = async () => {
    try {
      setIsLoading(true);
      const response = await aiService.createThread();
      
      if (response.status === 'success') {
        // 서버에서 생성된 스레드를 로컬 상태에 추가
        const threadId = response.data.threadId || response.data.id;
        if (!threadId) {
          throw new Error('서버에서 스레드 ID를 반환하지 않았습니다');
        }
        
        const newThread = {
          id: threadId,
          title: response.data.title || '새 대화',
          messages: [],
          createdAt: new Date(response.data.created_at || Date.now()),
          updatedAt: new Date(response.data.updated_at || Date.now()),
        };
        
        actions.addServerThread(newThread);
        actions.setCurrentThread(newThread.id);
        onNewThread?.();
      }
    } catch (error) {
      console.error('새 스레드 생성 실패:', error);
      // 에러 시 로컬에서만 생성
      actions.createNewThread();
      onNewThread?.();
    } finally {
      setIsLoading(false);
    }
  };

  const handleThreadClick = (threadId: string) => {
    actions.setCurrentThread(threadId);
    onThreadSelect?.(threadId);
  };

  const handleEditStart = (threadId: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingThreadId(threadId);
    setEditTitle(currentTitle);
  };

  const handleEditSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editingThreadId || !editTitle.trim()) return;
    
    try {
      const response = await aiService.updateThreadTitle(editingThreadId, editTitle.trim());
      
      if (response.status === 'success') {
        actions.updateThreadTitle(editingThreadId, editTitle.trim());
      } else {
        console.error('스레드 제목 업데이트 실패:', response.message);
      }
    } catch (error) {
      console.error('스레드 제목 업데이트 실패:', error);
      // 에러 시에도 로컬 상태 업데이트
      actions.updateThreadTitle(editingThreadId, editTitle.trim());
    } finally {
      setEditingThreadId(null);
      setEditTitle('');
    }
  };

  const handleEditCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingThreadId(null);
    setEditTitle('');
  };

  const handleDelete = async (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('이 대화를 삭제하시겠습니까?')) return;
    
    try {
      const response = await aiService.deleteThread(threadId);
      
      if (response.status === 'success') {
        actions.deleteThread(threadId);
      } else {
        console.error('스레드 삭제 실패:', response.message);
      }
    } catch (error) {
      console.error('스레드 삭제 실패:', error);
      // 에러 시에도 로컬 상태에서 삭제
      actions.deleteThread(threadId);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleEditSave(e as any);
    } else if (e.key === 'Escape') {
      handleEditCancel(e as any);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button 
          className={styles.newThreadButton}
          onClick={handleNewThread}
        >
          <Plus size={16} />
          새 채팅
        </button>
      </div>

      <div className={styles.threadList}>
        {isLoading ? (
          <div className={styles.loadingState}>
            <div className={styles.loader}></div>
            <p>대화 목록을 불러오는 중...</p>
          </div>
        ) : state.chatThreads.length === 0 ? (
          <div className={styles.emptyState}>
            <MessageSquare size={32} className={styles.emptyIcon} />
            <p className={styles.emptyText}>아직 대화가 없습니다</p>
            <p className={styles.emptySubtext}>새 채팅을 시작해보세요</p>
          </div>
        ) : (
          state.chatThreads.map((thread) => (
            <div
              key={thread.id}
              className={`${styles.threadItem} ${
                state.currentThreadId === thread.id ? styles.active : ''
              }`}
              onClick={() => handleThreadClick(thread.id)}
            >
              <div className={styles.threadContent}>
                <div className={styles.threadMain}>
                  {editingThreadId === thread.id ? (
                    <div className={styles.editContainer} onClick={e => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className={styles.editInput}
                        autoFocus
                        maxLength={50}
                      />
                      <div className={styles.editActions}>
                        <button
                          className={`${styles.editButton} ${styles.save}`}
                          onClick={handleEditSave}
                        >
                          <Check size={12} />
                        </button>
                        <button
                          className={`${styles.editButton} ${styles.cancel}`}
                          onClick={handleEditCancel}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className={styles.threadTitle}>
                        {thread.title}
                      </div>
                      <div className={styles.threadMeta}>
                        <span className={styles.messageCount}>
                          {thread.messages.length}개 메시지
                        </span>
                        <span className={styles.threadDate}>
                          {formatDate(thread.updatedAt)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
                
                {editingThreadId !== thread.id && (
                  <div className={styles.threadActions}>
                    <button
                      className={styles.actionButton}
                      onClick={(e) => handleEditStart(thread.id, thread.title, e)}
                      title="제목 수정"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      className={styles.actionButton}
                      onClick={(e) => handleDelete(thread.id, e)}
                      title="대화 삭제"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}