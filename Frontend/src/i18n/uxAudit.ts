import i18n from '@/i18n/config';
import patch from '@/i18n/patches/uxaudit.json';

/** Strings added by the UX walkthrough (src/i18n/patches/uxaudit.json). Deep merge without overwrite. */
for (const [lng, resources] of Object.entries(patch as Record<string, Record<string, unknown>>)) {
  i18n.addResourceBundle(lng, 'translation', resources, true, false);
}

export default i18n;
