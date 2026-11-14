import i18n from '@/i18n/config';
import patch from '@/i18n/patches/client.json';

// The patch is merged into the locale files later; until then register it at runtime
// (deep merge, never overwriting keys that already exist in the locales).
const bundles = patch as Record<string, Record<string, unknown>>;
for (const lng of Object.keys(bundles)) {
  i18n.addResourceBundle(lng, 'translation', bundles[lng], true, false);
}

export default i18n;
