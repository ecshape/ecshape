import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translation files
import he from './locales/he.json';
import en from './locales/en.json';
import fr from './locales/fr.json';
import ru from './locales/ru.json';
import ar from './locales/ar.json';

// Get stored language preference or default to Hebrew
const getInitialLanguage = (): string => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('i18nextLng');
    if (stored && ['he', 'en', 'fr'].includes(stored)) {
      return stored;
    }
  }
  return 'he'; // Default to Hebrew if no preference stored
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      he: { translation: he },
      en: { translation: en },
      fr: { translation: fr },
      ru: { translation: ru },
      ar: { translation: ar },
    },
    supportedLngs: ['he', 'en', 'fr'], // ru / ar resources exist (QA #85) but are not offered for now
    // Default to Hebrew, fallback to English if needed
    // Missing French strings fall back to English, never to Hebrew
    fallbackLng: { fr: ['en'], ru: ['en'], ar: ['en'], en: ['he'], default: ['he'] },
    lng: getInitialLanguage(), // Use stored preference or default to Hebrew
    debug: false,
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    // Texts added after start (Russian / Arabic from the server, QA #85) re-render the screens that use them.
    react: { bindI18n: 'languageChanged loaded', bindI18nStore: 'added' },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
      // Ensure localStorage is checked first
      checkWhitelist: true,
    },
  });

export default i18n;

