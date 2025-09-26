import { locales } from '../i18n/translations';
import { useLanguage } from '../contexts/LanguageContext';
import { useTranslations } from '../hooks/useTranslations';
import styles from '../styles/SidePanel.module.css';

interface LanguageToggleProps {
  className?: string;
}

export default function LanguageToggle({ className = '' }: LanguageToggleProps) {
  const { language, setLanguage } = useLanguage();
  const t = useTranslations();

  const labels: Record<typeof locales[number], string> = {
    en: t.languageToggle.english,
    ko: t.languageToggle.korean,
  };

  return (
    <div
      className={`${styles.languageToggle} ${className}`.trim()}
      title={t.languageToggle.label}
    >
      {locales.map((locale) => (
        <button
          key={locale}
          type="button"
          onClick={() => setLanguage(locale)}
          className={`${styles.languageToggleButton} ${language === locale ? styles.languageToggleButtonActive : ''}`}
        >
          {labels[locale]}
        </button>
      ))}
    </div>
  );
}
