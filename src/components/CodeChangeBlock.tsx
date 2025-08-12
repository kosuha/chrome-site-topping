import { useState } from 'react';
import styles from '../styles/ChatTab.module.css';
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react';

interface Props {
  language: string;
  code: string;
  changeSummary?: string;
  isSuccessful?: boolean;
}

export default function CodeChangeBlock({ language, code, changeSummary, isSuccessful = true }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);

  const parseDiffLines = (diffText: string) => {
    const lines = diffText.split('\n');
    return lines
      .map((line, index) => {
        if (line.startsWith('@@')) return { type: 'header', content: line, key: `header-${index}` };
        if (line.startsWith('+')) return { type: 'addition', content: line, key: `add-${index}` };
        if (line.startsWith('-')) return { type: 'deletion', content: line, key: `del-${index}` };
        if (line.startsWith(' ') || line === '') return { type: 'context', content: line, key: `ctx-${index}` };
        return { type: 'normal', content: line, key: `norm-${index}` };
      })
      .filter((line) => line.content !== '');
  };

  const diffLines = parseDiffLines(code);

  return (
    <div className={styles.codeChangeBlock}>
      <div className={styles.codeChangeHeader} onClick={() => setIsExpanded(!isExpanded)}>
        <div className={styles.codeChangeIcon}>
          {isSuccessful ? (
            <Check size={12} strokeWidth={4} className={styles.successIcon} />
          ) : (
            <X size={12} strokeWidth={4} className={styles.errorIcon} />
          )}
        </div>
        <div className={styles.codeChangeContent}>
          <span className={styles.codeChangeTitle}>{language}</span>
          <span className={styles.codeChangeSummary}>
            <span className={styles.addition}>+{changeSummary?.split('−')[0]?.replace('+', '') || '0'}</span>{' '}
            <span className={styles.deletion}>−{changeSummary?.split('−')[1] || '0'}</span>
          </span>
        </div>
        <div className={styles.codeChangeExpand}>{isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</div>
      </div>

      {isExpanded && (
        <div className={styles.codeChangeDetails}>
          <div className={styles.codeChangeDetailsContent}>
            <div className={styles.diffContent}>
              {diffLines.map((line) => (
                <div key={line.key} className={`${styles.diffLine} ${styles[`diffLine${line.type.charAt(0).toUpperCase() + line.type.slice(1)}`]}`}>
                  {line.content}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
