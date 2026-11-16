import { extraBundle, mergeTranslated } from '@/i18n/extraLangs';
import { LEGAL, LEGAL_NAV, type LegalDoc, type LegalLang, type LegalPage } from './content';

/** Any interface language: he / en / fr as written above; Russian / Arabic translated on the server (QA #85). */
const base = (lang: string): LegalLang => (lang === 'he' || lang === 'fr' ? lang : 'en');
const NAV_EXTRA = {
  ru: { privacy: 'Политика конфиденциальности', terms: 'Условия использования', accessibility: 'Заявление о доступности', credits: 'Авторы и лицензии', back: 'Назад на сайт', updatedLabel: 'Обновлено', footerLabel: 'Правовая информация' },
  ar: { privacy: 'سياسة الخصوصية', terms: 'شروط الاستخدام', accessibility: 'بيان إمكانية الوصول', credits: 'الحقوق والتراخيص', back: 'العودة إلى الموقع', updatedLabel: 'آخر تحديث', footerLabel: 'معلومات قانونية' },
};
export function legalNavFor(lang: string) {
  const l = lang.slice(0, 2);
  if (l === 'ru' || l === 'ar') return NAV_EXTRA[l];
  return LEGAL_NAV[base(l)];
}
export function legalPageFor(lang: string, doc: LegalDoc): LegalPage {
  const l = lang.slice(0, 2);
  const b = l === 'ru' || l === 'ar' ? extraBundle(l) : null;
  return b ? mergeTranslated(LEGAL.en[doc], (b.legal as Record<string, unknown>)?.[doc]) : LEGAL[base(l)][doc];
}
