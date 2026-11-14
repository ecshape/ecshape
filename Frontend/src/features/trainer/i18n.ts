import i18n from '@/i18n/config';
import patch from '@/i18n/patches/trainer.json';

/**
 * Registers the trainer strings (src/i18n/patches/trainer.json) until they are merged into the locale files.
 * Deep merge without overwrite: once merged, this is a no-op and can be deleted.
 */
for (const [lng, resources] of Object.entries(patch as Record<string, Record<string, unknown>>)) {
  i18n.addResourceBundle(lng, 'translation', resources, true, false);
}

export default i18n;
