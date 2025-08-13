import { ChatMessage, useAppContext } from '../contexts/AppContext';
import styles from '../styles/ChatTab.module.css';
import { Loader, X } from 'lucide-react';
import CodeChangeBlock from './CodeChangeBlock';
import { calculateDiffSummary, parseCodeBlocks, formatTime } from '../utils/chat';

export default function MessageComponent({ message }: { message: ChatMessage }) {
  const { state } = useAppContext();
  const { text } = parseCodeBlocks(message.content);

  const isMessageApplied = () => {
    if (!message.id) return false;
    const messageHistoryIndex = state.codeHistoryStack.findIndex((item) => item.messageId === message.id);
    if (messageHistoryIndex === -1 || messageHistoryIndex > state.currentHistoryIndex) return false;
    return true;
  };

  const isChangeSuccessful = () => {
    if (!message.id) return true;
    const historyItem = state.codeHistoryStack.find((item) => item.messageId === message.id);
    return historyItem?.isSuccessful ?? true;
  };

  if (message.type === 'assistant') {
    if (message.status === 'pending' || message.status === 'in_progress') {
      return (
        <div className={`${styles.message} ${styles[message.type]}`}>
          <div className={`${styles.messageContent} ${styles[message.type]}`}>
            <div className={`${styles.messageBubble} ${styles[message.type]} ${styles.inProgressMessage}`}>
              <div className={styles.inProgressIndicator}>
                <Loader size={14} className={styles.inProgressSpinner} />
              </div>
              {text && text.trim() && <div className={styles.partialContent}>{text}</div>}
            </div>
            <div className={`${styles.messageTime} ${styles[message.type]}`}>{formatTime(message.timestamp)}</div>
          </div>
        </div>
      );
    }

    if (message.status === 'failed') {
      return (
        <div className={`${styles.message} ${styles[message.type]}`}>
          <div className={`${styles.messageContent} ${styles[message.type]}`}>
            <div className={`${styles.messageBubble} ${styles[message.type]} ${styles.failedMessage}`}>
              <div className={styles.failedIndicator}>
                <X size={14} className={styles.failedIcon} />
                <span>응답 생성에 실패했습니다</span>
              </div>
              {text && text.trim() && <div className={styles.errorContent}>{text}</div>}
            </div>
            <div className={`${styles.messageTime} ${styles[message.type]}`}>{formatTime(message.timestamp)}</div>
          </div>
        </div>
      );
    }
  }

  return (
    <div className={`${styles.message} ${styles[message.type]}`}>
      <div className={`${styles.messageContent} ${styles[message.type]}`}>
        {message.images && message.images.length > 0 && (
          <div className={styles.messageImages}>
            <div className={styles.messageImagesGrid}>
              {message.images.map((src, index) => (
                <a
                  key={`msg-img-${message.id}-${index}`}
                  href={src}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.messageImageItem}
                  title="이미지 크게 보기"
                >
                  <img src={src} alt={`첨부 이미지 ${index + 1}`} className={styles.messageImage} />
                </a>
              ))}
            </div>
          </div>
        )}

        {text && text.trim() ? (
          <div className={`${styles.messageBubble} ${styles[message.type]}`}>{text}</div>
        ) : null}

        {message.changes && (
          <div className={styles.aiCodeSection}>
            {message.changes.javascript && (
              <CodeChangeBlock
                language="JavaScript"
                code={message.changes.javascript.diff}
                changeSummary={(() => {
                  const summary = calculateDiffSummary(message.changes.javascript!.diff);
                  return `+${summary.added} −${summary.removed}`;
                })()}
                isSuccessful={isMessageApplied() && isChangeSuccessful()}
              />
            )}

            {message.changes.css && (
              <CodeChangeBlock
                language="CSS"
                code={message.changes.css.diff}
                changeSummary={(() => {
                  const summary = calculateDiffSummary(message.changes.css!.diff);
                  return `+${summary.added} −${summary.removed}`;
                })()}
                isSuccessful={isMessageApplied() && isChangeSuccessful()}
              />
            )}
          </div>
        )}

        <div className={`${styles.messageTime} ${styles[message.type]}`}>{formatTime(message.timestamp)}</div>
      </div>
    </div>
  );
}
