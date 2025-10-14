import { ChatMessage, useAppContext } from '../contexts/AppContext';
import styles from '../styles/ChatTab.module.css';
import { Loader, X } from 'lucide-react';
import CodeChangeBlock from './CodeChangeBlock';
import { calculateDiffSummary, parseCodeBlocks, formatTime } from '../utils/chat';
import { useTranslations } from '../hooks/useTranslations';

export default function MessageComponent({ message }: { message: ChatMessage }) {
  const { state } = useAppContext();
  const t = useTranslations();
  const parsedJson = (() => {
    if (message.type !== 'assistant') return null;
    const raw = message.content?.trim();
    if (!raw || raw[0] !== '{') return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  })();

  const contentText = (() => {
    if (parsedJson && typeof parsedJson.message === 'string') {
      return parsedJson.message;
    }
    return message.content;
  })();

  const { text } = parseCodeBlocks(contentText || '');

  const effectiveChanges = message.changes ?? (parsedJson?.changes ?? undefined);

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
                <span>{t.chatTab.messages.failed}</span>
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
                  title={t.chatTab.messages.openImage}
            >
                  <img src={src} alt={t.chatTab.attachments.alt(index + 1)} className={styles.messageImage} />
            </a>
          ))}
        </div>
      </div>
    )}

        {text && text.trim() ? (
          <div className={`${styles.messageBubble} ${styles[message.type]}`}>{text}</div>
        ) : null}

        {effectiveChanges && (
          <div className={styles.aiCodeSection}>
            {effectiveChanges.javascript && (
              <CodeChangeBlock
                language="JavaScript"
                code={effectiveChanges.javascript.diff}
                changeSummary={(() => {
                  const summary = calculateDiffSummary(effectiveChanges.javascript!.diff);
                  return `+${summary.added} −${summary.removed}`;
                })()}
                isSuccessful={isMessageApplied() && isChangeSuccessful()}
                fileId={effectiveChanges.javascript.file_id}
              />
            )}

            {effectiveChanges.css && (
              <CodeChangeBlock
                language="CSS"
                code={effectiveChanges.css.diff}
                changeSummary={(() => {
                  const summary = calculateDiffSummary(effectiveChanges.css!.diff);
                  return `+${summary.added} −${summary.removed}`;
                })()}
                isSuccessful={isMessageApplied() && isChangeSuccessful()}
                fileId={effectiveChanges.css.file_id}
              />
            )}
          </div>
        )}

        <div className={`${styles.messageTime} ${styles[message.type]}`}>
          {formatTime(message.timestamp)}
      {message.type === 'assistant' && (message.ai_model || typeof message.cost_usd === 'number') && (
            <span style={{ marginLeft: 8, opacity: 0.8 }}>
              {message.ai_model ? ` · ${message.ai_model}` : ''}
        {typeof message.cost_usd === 'number' ? ` · ${Number(message.cost_usd).toFixed(4)} ${t.common.creditsUnit}` : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
