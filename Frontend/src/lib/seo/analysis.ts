/**
 * Rank Math-style SEO analysis: a score out of 100 and tests grouped like the plugin
 * (Basic SEO, Additional, Title readability, Content readability). Pure, so it runs live in the editor.
 * Labels and hints are i18n keys: studio.seo.rm.tests.<id> / studio.seo.rm.hints.<id>.
 */

export type SeoTestGroup = 'basic' | 'additional' | 'title' | 'content';
export const SEO_GROUPS: SeoTestGroup[] = ['basic', 'additional', 'title', 'content'];

export type SeoTest = {
  id: string;
  group: SeoTestGroup;
  ok: boolean;
  /** Partial pass (orange in Rank Math). */
  warn?: boolean;
  weight: number;
  hint: Record<string, string | number>;
};

export type SeoAnalysis = {
  score: number;
  tests: SeoTest[];
  stats: { words: number; density: number; keywordCount: number; internalLinks: number; externalLinks: number; images: number; h2: number };
};

export type AnalysisInput = {
  keyword: string;
  seoTitle: string;
  title: string;
  description: string;
  slug: string;
  html: string;
  coverAlt?: string;
  otherKeywords?: string[];
  siteHost?: string;
};

const POWER_WORDS = [
  // en
  'free', 'essential', 'ultimate', 'complete', 'secret', 'easy', 'fast', 'proven', 'simple', 'effective', 'best', 'guide', 'steps', 'mistakes', 'tips', 'new', 'key',
  // fr
  'gratuit', 'essentiel', 'ultime', 'complet', 'secret', 'facile', 'rapide', 'prouve', 'simple', 'efficace', 'meilleur', 'guide', 'etapes', 'erreurs', 'astuces', 'cle',
  // he
  'מדריך', 'שלבים', 'טעויות', 'טיפים', 'סודות', 'פשוט', 'מהיר', 'יעיל', 'הטוב', 'המלא', 'חינם', 'מוכח', 'חדש', 'מושלם',
];
const SENTIMENT_WORDS = [
  'succeed', 'success', 'win', 'best', 'ideal', 'perfect', 'easy', 'mistake', 'mistakes', 'avoid', 'risk', 'fail', 'danger', 'worst', 'amazing', 'safe',
  'reussir', 'succes', 'gagner', 'ideal', 'parfait', 'erreur', 'eviter', 'risque', 'echec', 'danger', 'pire', 'incroyable',
  'להצליח', 'הצלחה', 'לנצח', 'מושלם', 'אידיאלי', 'טעות', 'טעויות', 'להימנע', 'סיכון', 'כישלון', 'סכנה', 'מדהים', 'בטוח',
];

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f\u0591-\u05C7]/g, '')
    .replace(/[’'"״׳]/g, ' ')
    .replace(/[.,:;!?()[\]{}«»“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function plainText(html: string) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|h[1-6]|li|blockquote|div)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&[a-z]+;/g, ' ');
}

function countOccurrences(haystack: string, needle: string) {
  if (!needle) return 0;
  let count = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    count += 1;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return count;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function analyzeSeo(input: AnalysisInput): SeoAnalysis {
  const kw = norm(input.keyword);
  const seoTitle = input.seoTitle || input.title;
  const nTitle = norm(seoTitle);
  const nDesc = norm(input.description);
  const plain = plainText(input.html);
  const nPlain = norm(plain);
  const words = nPlain.split(' ').filter(Boolean);
  const wordCount = words.length;
  const kwCount = kw ? countOccurrences(` ${nPlain} `, ` ${kw} `) : 0;
  const kwWords = kw ? kw.split(' ').length : 1;
  const density = wordCount ? round1(((kwCount * kwWords) / wordCount) * 100) : 0;
  const headings = Array.from(input.html.matchAll(/<h([2-4])[^>]*>([\s\S]*?)<\/h\1>/gi)).map((m) => norm(plainText(m[2])));
  const h2 = (input.html.match(/<h2[\s>]/gi) || []).length;
  const imgs = Array.from(input.html.matchAll(/<img\b[^>]*>/gi)).map((m) => m[0]);
  const alts = imgs.map((tag) => norm((tag.match(/alt\s*=\s*"([^"]*)"/i) || [])[1] || ''));
  if (input.coverAlt) alts.push(norm(input.coverAlt));
  const links = Array.from(input.html.matchAll(/<a\b[^>]*href\s*=\s*"([^"]+)"/gi)).map((m) => m[1]);
  const host = (input.siteHost || 'ecshape.org').replace(/^www\./, '');
  const isInternal = (href: string) => href.startsWith('/') || href.startsWith('#') || href.includes(host);
  const internalLinks = links.filter(isInternal).length;
  const externalLinks = links.length - internalLinks;
  const firstChunk = words.slice(0, Math.max(30, Math.round(wordCount * 0.1))).join(' ');
  const paragraphs = plain.split(/\n+/).map((p) => p.trim()).filter((p) => p.split(/\s+/).length > 3);
  const longParagraphs = paragraphs.filter((p) => p.split(/\s+/).length > 120).length;
  const sentences = plain.split(/[.!?…]+\s/).map((s) => s.trim()).filter((s) => s.split(/\s+/).length > 2);
  const avgSentence = sentences.length ? sentences.reduce((n, s) => n + s.split(/\s+/).length, 0) / sentences.length : 0;
  const slug = decodeURIComponent(input.slug || '').toLowerCase();
  const slugKw = kw.replace(/ /g, '-');
  const titleWords = nTitle.split(' ');
  const others = (input.otherKeywords || []).map(norm);
  const power = POWER_WORDS.map(norm);
  const sentiment = SENTIMENT_WORDS.map(norm);
  const kwAt = nTitle.indexOf(kw);

  const tests: SeoTest[] = [
    { id: 'kwTitle', group: 'basic', weight: 9, ok: Boolean(kw) && nTitle.includes(kw), hint: {} },
    { id: 'kwDesc', group: 'basic', weight: 7, ok: Boolean(kw) && nDesc.includes(kw), hint: {} },
    { id: 'kwUrl', group: 'basic', weight: 7, ok: Boolean(kw) && slug.includes(slugKw), hint: { slug: slug || '—' } },
    { id: 'kwStart', group: 'basic', weight: 6, ok: Boolean(kw) && ` ${firstChunk} `.includes(` ${kw} `), hint: {} },
    { id: 'kwContent', group: 'basic', weight: 7, ok: kwCount > 0, hint: { count: kwCount } },
    { id: 'length', group: 'basic', weight: 9, ok: wordCount >= 1500, warn: wordCount >= 600 && wordCount < 1500, hint: { count: wordCount } },
    { id: 'kwHeading', group: 'additional', weight: 5, ok: Boolean(kw) && headings.some((h) => h.includes(kw)), hint: { count: headings.length } },
    { id: 'kwAlt', group: 'additional', weight: 4, ok: Boolean(kw) && alts.some((a) => a.includes(kw)), hint: { count: alts.length } },
    {
      id: 'density',
      group: 'additional',
      weight: 5,
      ok: density >= 1 && density <= 1.5,
      warn: (density >= 0.5 && density < 1) || (density > 1.5 && density <= 2.5),
      hint: { density, count: kwCount },
    },
    { id: 'urlLength', group: 'additional', weight: 3, ok: slug.length > 0 && slug.length <= 75, hint: { count: slug.length } },
    { id: 'external', group: 'additional', weight: 3, ok: externalLinks > 0, hint: { count: externalLinks } },
    { id: 'internal', group: 'additional', weight: 5, ok: internalLinks > 0, hint: { count: internalLinks } },
    { id: 'kwUnique', group: 'additional', weight: 5, ok: Boolean(kw) && !others.includes(kw), hint: { taken: kw && others.includes(kw) ? 1 : 0 } },
    { id: 'kwTitleStart', group: 'title', weight: 4, ok: Boolean(kw) && kwAt >= 0 && kwAt <= Math.max(10, nTitle.length / 2), hint: {} },
    { id: 'titleNumber', group: 'title', weight: 3, ok: /\d/.test(seoTitle), hint: {} },
    { id: 'titlePower', group: 'title', weight: 3, ok: titleWords.some((w) => power.includes(w)), hint: {} },
    { id: 'titleSentiment', group: 'title', weight: 2, ok: titleWords.some((w) => sentiment.includes(w)), hint: {} },
    { id: 'toc', group: 'content', weight: 4, ok: h2 >= 2, hint: { count: h2 } },
    { id: 'paragraphs', group: 'content', weight: 3, ok: paragraphs.length > 0 && longParagraphs === 0, hint: { count: longParagraphs } },
    { id: 'media', group: 'content', weight: 3, ok: imgs.length > 0 || Boolean(input.coverAlt), hint: { count: imgs.length } },
    { id: 'sentences', group: 'content', weight: 3, ok: sentences.length > 0 && avgSentence < 20, hint: { count: Math.round(avgSentence) } },
  ];

  const total = tests.reduce((n, t) => n + t.weight, 0);
  const got = tests.reduce((n, t) => n + (t.ok ? t.weight : t.warn ? t.weight / 2 : 0), 0);
  return {
    score: Math.round((got / total) * 100),
    tests,
    stats: { words: wordCount, density, keywordCount: kwCount, internalLinks, externalLinks, images: imgs.length, h2 },
  };
}

/** Rank Math colours: red < 50, orange < 80, green ≥ 80. */
export function scoreTone(score: number): 'bad' | 'ok' | 'good' {
  return score >= 80 ? 'good' : score >= 50 ? 'ok' : 'bad';
}
