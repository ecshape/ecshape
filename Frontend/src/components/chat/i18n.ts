import i18n from '@/i18n/config';
import patch from '@/i18n/patches/chat.json';

/**
 * Registers the chat strings from `i18n/patches/chat.json` until they are merged
 * into the locale files. Deep-merges without overwriting keys that already exist,
 * so once the merge happens this becomes a no-op.
 */
let registered = false;
export const registerChatStrings = () => {
  if (registered) return;
  registered = true;
  (Object.keys(patch) as Array<keyof typeof patch>).forEach((lng) => {
    i18n.addResourceBundle(lng, 'translation', patch[lng], true, false);
  });
};

registerChatStrings();
