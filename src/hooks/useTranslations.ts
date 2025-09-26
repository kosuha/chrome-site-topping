import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../i18n/translations';

export function useTranslations() {
  const { language } = useLanguage();
  return translations[language];
}

export type UseTranslationsReturn = ReturnType<typeof useTranslations>;
