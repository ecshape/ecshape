import i18n from './config';

export type AppLanguage = 'he' | 'en' | 'fr' | 'ru' | 'ar';
export const APP_LANGUAGES: { code: AppLanguage; name: string; short: string }[] = [
  { code: 'he', name: 'עברית', short: 'עב' },
  { code: 'en', name: 'English', short: 'EN' },
  { code: 'fr', name: 'Français', short: 'FR' },
  // Russian / Arabic are ready (QA #85) but hidden for now: add them back here and in site/render.ts LANGS + VISITOR_LANGS.
];

export const isRtl = (lng?: string) => /^(he|ar)/.test(lng || i18n.language || 'he');

/** Single place that switches the language for the site and the portal (text, dir, lang, persistence). */
export function setLanguage(code: AppLanguage) {
  try {
    localStorage.setItem('i18nextLng', code);
  } catch {
    /* storage unavailable */
  }
  document.documentElement.dir = isRtl(code) ? 'rtl' : 'ltr';
  document.documentElement.lang = code;
  i18n.changeLanguage(code);
}
