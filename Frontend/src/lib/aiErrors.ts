import type { TFunction } from 'i18next';

/**
 * AI providers answer in English ("Your credit balance is too low…"). QA #96: the common cases are shown in the app
 * language; anything unknown keeps the provider's own words after a translated lead-in.
 */
const RULES: [RegExp, string][] = [
  [/credit balance is too low|insufficient[_ ]quota|exceeded your current quota|billing|payment required|\b402\b/i, 'credit'],
  [/invalid[_ ]?(x-)?api[_ ]?key|incorrect api key|authentication|unauthori[sz]ed|\b401\b|api key not valid/i, 'badKey'],
  [/permission|forbidden|\b403\b/i, 'forbidden'],
  [/rate limit|too many requests|\b429\b/i, 'rateLimit'],
  [/overloaded|\b529\b|\b503\b|unavailable/i, 'overloaded'],
  [/model.*(not found|does not exist|not available)|unknown model|\b404\b/i, 'model'],
  [/timed? ?out|timeout/i, 'timeout'],
];

export function localizeAiError(raw: string | null | undefined, t: TFunction): string {
  const text = (raw || '').trim();
  if (!text) return t('qa4.aiErr.generic');
  for (const [re, key] of RULES) if (re.test(text)) return t(`qa4.aiErr.${key}`);
  return t('qa4.aiErr.withDetail', { detail: text });
}
