import i18n from './config';

export type AppLanguage = 'he' | 'en' | 'fr';
export const APP_LANGUAGES: { code: AppLanguage; name: string; short: string }[] = [
  { code: 'he', name: 'עברית', short: 'עב' },
  { code: 'en', name: 'English', short: 'EN' },
  { code: 'fr', name: 'Français', short: 'FR' },
];

export const isRtl = (lng?: string) => (lng || i18n.language || 'he').startsWith('he');

/** Single place that switches the language for the site and the portal (text, dir, lang, persistence). */
export function setLanguage(code: AppLanguage) {
  try {
    localStorage.setItem('i18nextLng', code);
  } catch {
    /* storage unavailable */
  }
  document.documentElement.dir = code === 'he' ? 'rtl' : 'ltr';
  document.documentElement.lang = code;
  i18n.changeLanguage(code);
}
