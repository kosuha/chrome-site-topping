import { Hammer } from 'lucide-react';
import styles from '../styles/FloatingButton.module.css';
import type { FloatingButtonProps } from '../types';

export default function FloatingButton({ onClick, isVisible }: FloatingButtonProps) {
  if (!isVisible) return null;

  return (
    <button 
      className={styles.floatingButton}
      onClick={onClick}
      title="Site Topping 열기"
    >
      <div className={styles.icon}>
        <Hammer size={20} />
      </div>
    </button>
  );
}