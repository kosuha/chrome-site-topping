import styles from './FloatingButton.module.css';

interface FloatingButtonProps {
  onClick: () => void;
  isVisible: boolean;
}

export default function FloatingButton({ onClick, isVisible }: FloatingButtonProps) {
  if (!isVisible) return null;

  return (
    <button 
      className={styles.floatingButton}
      onClick={onClick}
      title="Site Topping 열기"
    >
      <div className={styles.icon}>
        ⚡
      </div>
    </button>
  );
}