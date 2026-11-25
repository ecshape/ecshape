import i18n from '@/i18n/config';
import patch from '@/i18n/patches/agent-actions.json';

/** Strings of Agent EC's page tasks (do_on_page: steps, confirmation, stop) until they are merged into the locale files. */
for (const [lng, resources] of Object.entries(patch as Record<string, Record<string, unknown>>)) {
  i18n.addResourceBundle(lng, 'translation', resources, true, false);
}

export default i18n;
