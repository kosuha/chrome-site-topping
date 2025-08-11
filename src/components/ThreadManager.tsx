import React, { useState } from 'react';
import { useAppContext } from '../contexts/AppContext';
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

  const handleNewThread = () => {
    actions.createNewThread();
    onNewThread?.();
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

  const handleEditSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (editingThreadId && editTitle.trim()) {
      actions.updateThreadTitle(editingThreadId, editTitle.trim());
    }
    setEditingThreadId(null);
    setEditTitle('');
  };

  const handleEditCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingThreadId(null);
    setEditTitle('');
  };

  const handleDelete = (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('이 대화를 삭제하시겠습니까?')) {
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
        {state.chatThreads.length === 0 ? (
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