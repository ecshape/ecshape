import i18n from '@/i18n/config';
import patch from '@/i18n/patches/trainer.json';
import ticketsPatch from '@/i18n/patches/tickets-trainer.json';

/**
 * Registers the trainer strings (src/i18n/patches/trainer.json and tickets-trainer.json) until they are merged into
 * the locale files. Deep merge without overwrite: once merged, this is a no-op and can be deleted.
 */
for (const p of [patch, ticketsPatch] as Record<string, Record<string, unknown>>[]) {
  for (const [lng, resources] of Object.entries(p)) {
    i18n.addResourceBundle(lng, 'translation', resources, true, false);
  }
}

export default i18n;
