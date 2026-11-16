// Utility function for conditional className merging
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
} 
/** Right-to-left languages of the app (Hebrew, Arabic — QA #85). */
export const isRtlLang = (lang?: string | null) => !!lang && /^(he|ar)/.test(lang);
