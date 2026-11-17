import type { SiteLang } from '@/site/content';

/** Blog article model (COM / SEO) — the same fields Rank Math exposes in WordPress. */

export type ArticleStatus = 'draft' | 'published' | 'scheduled';
export type ArticleSchemaType = 'BlogPosting' | 'Article' | 'NewsArticle' | 'none';
export type ArticleFaq = { q: string; a: string };

export type ArticleSeo = {
  focusKeyword: string;
  secondaryKeywords: string[];
  title: string;
  description: string;
  robots: 'index' | 'noindex';
  nofollow: boolean;
  noarchive: boolean;
  noimageindex: boolean;
  nosnippet: boolean;
  canonical: string;
  pillar: boolean;
  schemaType: ArticleSchemaType;
  faq: ArticleFaq[];
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
};

export type Article = {
  id: string;
  lang: SiteLang;
  slug: string;
  title: string;
  excerpt: string;
  contentHtml: string;
  coverImage: string;
  coverAlt: string;
  category: string;
  tags: string[];
  status: ArticleStatus;
  publishedAt: string | null;
  authorName: string;
  seo: ArticleSeo;
  createdAt: string;
  updatedAt: string;
};

export type ArticleDraft = Omit<Article, 'id' | 'createdAt' | 'updatedAt' | 'authorName'> & { id?: string; authorName?: string };
export type ArticleSummary = Pick<Article, 'id' | 'lang' | 'slug' | 'title' | 'excerpt' | 'coverImage' | 'coverAlt' | 'category' | 'publishedAt' | 'authorName'>;

export const ARTICLE_BASE_PATH = '/blog';
export const ARTICLE_CATEGORIES = ['training', 'nutrition', 'mindset', 'results', 'lifestyle', 'news'] as const;

export const EMPTY_ARTICLE_SEO: ArticleSeo = {
  focusKeyword: '',
  secondaryKeywords: [],
  title: '',
  description: '',
  robots: 'index',
  nofollow: false,
  noarchive: false,
  noimageindex: false,
  nosnippet: false,
  canonical: '',
  pillar: false,
  schemaType: 'BlogPosting',
  faq: [],
  ogTitle: '',
  ogDescription: '',
  ogImage: '',
};

export function emptyDraft(lang: SiteLang): ArticleDraft {
  return {
    lang,
    slug: '',
    title: '',
    excerpt: '',
    contentHtml: '',
    coverImage: '',
    coverAlt: '',
    category: '',
    tags: [],
    status: 'draft',
    publishedAt: null,
    seo: { ...EMPTY_ARTICLE_SEO },
  };
}

export const articlePath = (slug: string, lang?: string) => `${ARTICLE_BASE_PATH}/${slug}${lang ? `?lang=${lang}` : ''}`;

/** Latin slugs for en/fr; Hebrew letters are kept for Hebrew articles (Google reads them fine). */
export function slugify(input: string) {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f\u0591-\u05C7]/g, '')
    .toLowerCase()
    .replace(/['’"״׳]/g, '')
    .replace(/[^a-z0-9\u05D0-\u05EA]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

export function readingMinutes(html: string) {
  const words = html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

/** A scheduled article whose date has passed counts as published. */
export function isLive(article: Pick<Article, 'status' | 'publishedAt'>, now = Date.now()) {
  if (article.status === 'published') return true;
  return article.status === 'scheduled' && Boolean(article.publishedAt) && new Date(article.publishedAt as string).getTime() <= now;
}

const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'mark', 'span', 'small', 'sup', 'sub',
  'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'hr', 'div', 'code', 'pre',
]);
const VOID_TAGS = new Set(['br', 'img', 'hr']);
const GLOBAL_ATTRS = new Set(['class', 'id', 'title', 'lang', 'dir']);
const TAG_ATTRS: Record<string, string[]> = {
  a: ['href', 'target', 'rel'],
  img: ['src', 'alt', 'width', 'height', 'loading', 'decoding'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan', 'scope'],
};

function safeUrl(value: string, forImage: boolean) {
  const v = value.trim();
  if (/^(https:\/\/|\/(?!\/)|#)/i.test(v)) return v;
  if (!forImage && /^(mailto:|tel:)/i.test(v)) return v;
  return null;
}

const escapeAttr = (value: string) =>
  value.replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function rebuildTag(tag: string, attrs: string, closing: boolean) {
  if (closing) return VOID_TAGS.has(tag) ? '' : `</${tag}>`;
  const allowed = new Set([...GLOBAL_ATTRS, ...(TAG_ATTRS[tag] || [])]);
  const out: string[] = [];
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrs))) {
    const name = m[1].toLowerCase();
    let value = m[2] ?? m[3] ?? m[4] ?? '';
    if (!allowed.has(name)) continue;
    if (name === 'href' || name === 'src') {
      const url = safeUrl(value.replace(/&#x?0*3a;?|&colon;/gi, ':'), name === 'src');
      if (!url) continue;
      value = url;
    }
    if (name === 'target' && value !== '_blank') continue;
    out.push(`${name}="${escapeAttr(value)}"`);
  }
  if (tag === 'a' && out.includes('target="_blank"') && !out.some((a) => a.startsWith('rel='))) out.push('rel="noopener noreferrer"');
  return `<${tag}${out.length ? ` ${out.join(' ')}` : ''}${VOID_TAGS.has(tag) ? ' /' : ''}>`;
}

/** Allow-list sanitizer for article HTML (editor, AI output, public rendering). */
export function sanitizeArticleHtml(html: string) {
  return String(html || '')
    .slice(0, 400_000)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\s*(script|style|iframe|object|embed|noscript|template|svg|math|form|textarea|select|button)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (_m, slash: string, rawTag: string, attrs: string) => {
      const tag = rawTag.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return '';
      return rebuildTag(tag, attrs, slash === '/');
    })
    .replace(/<(?![a-zA-Z/])/g, '&lt;');
}
