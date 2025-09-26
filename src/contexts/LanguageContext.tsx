import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Locale, defaultLocale, locales } from '../i18n/translations';

const STORAGE_KEY = 'site-topping-language';

function sanitizeLocale(value: string | null): Locale {
  if (!value) return defaultLocale;
  return locales.includes(value as Locale) ? (value as Locale) : defaultLocale;
}

let currentLocale: Locale = defaultLocale;

export function getCurrentLocale(): Locale {
  return currentLocale;
}

export type LanguageContextValue = {
  language: Locale;
  setLanguage: (locale: Locale) => void;
  toggleLanguage: () => void;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Locale>(() => {
    if (typeof window === 'undefined') return defaultLocale;
    const stored = sanitizeLocale(localStorage.getItem(STORAGE_KEY));
    currentLocale = stored;
    return stored;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = sanitizeLocale(localStorage.getItem(STORAGE_KEY));
    setLanguage(stored);
    currentLocale = stored;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
    currentLocale = language;
  }, [language]);

  const updateLanguage = useCallback((locale: Locale) => {
    setLanguage(locale);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage((prev) => (prev === 'en' ? 'ko' : 'en'));
  }, []);

  const value = useMemo(
    () => ({ language, setLanguage: updateLanguage, toggleLanguage }),
    [language, updateLanguage, toggleLanguage]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}
