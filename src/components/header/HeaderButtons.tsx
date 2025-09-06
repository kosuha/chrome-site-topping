import { Loader2 } from 'lucide-react';
import styles from '../../styles/SidePanel.module.css';
import { ReactNode } from 'react';

interface IconButtonProps {
  active?: boolean;
  loading?: boolean;
  disabled?: boolean;
  title?: string;
  onClick?: () => void | Promise<void>;
  className?: string;
  children: ReactNode;
}

export function IconButton({ active, loading, disabled, title, onClick, className, children }: IconButtonProps) {
  return (
    <button
      className={`${styles.tabBtn} ${active ? styles.active : ''} ${loading ? styles.loading : ''} ${className || ''}`}
      onClick={() => void onClick?.()}
      title={title}
      disabled={disabled || loading}
    >
      {loading ? <Loader2 size={24} className={styles.spinner} /> : children}
    </button>
  );
}

export function Divider() {
  return <div className={styles.divider}></div>;
}
