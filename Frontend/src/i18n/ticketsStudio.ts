import i18n from '@/i18n/config';
import patch from '@/i18n/patches/tickets-studio.json';

/**
 * Registers the strings of the studio QA tickets (src/i18n/patches/tickets-studio.json: avatars, inline Agent EC
 * drafts, QA filters, site links) until they are merged into the locale files. Deep merge without overwrite.
 */
for (const [lng, resources] of Object.entries(patch as Record<string, Record<string, unknown>>)) {
  i18n.addResourceBundle(lng, 'translation', resources, true, false);
}

export default i18n;
