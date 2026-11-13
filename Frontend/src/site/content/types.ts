/** Editable content of the public site. Every string here can be overridden per language from Studio → Mon site. */
export interface SiteContent {
  meta: { title: string; description: string };
  nav: { about: string; results: string; programs: string; app: string; reviews: string; faq: string; login: string; cta: string };
  hero: { eyebrow: string; title1: string; title2: string; sub: string; ctaPrimary: string; ctaSecondary: string; scroll: string; caption: string; captionAccent: string;
    stats: { value: number; suffix: string; label: string }[] };
  marquee: { row1: string[]; row2: string[] };
  manifesto: { eyebrow: string; text: string; highlight: string; role: string };
  story: { eyebrow: string; title1: string; title2: string; p1: string; p1Strong: string; p2: string; p2Strong: string; photoRole: string;
    values: { title: string; text: string }[]; statValue: number; statSuffix: string; statTitle: string; statText: string };
  results: { eyebrow: string; title1: string; title2: string; lead: string; ctaCard: string; ctaButton: string;
    cards: { image: string; tag: string; title: string; sub: string; big?: string; tall?: boolean }[] };
  shift: { eyebrow: string; title1: string; title2: string; cards: { from: string; title: string; text?: string; pills?: string[] }[] };
  programs: { eyebrow: string; title1: string; title2: string; lead: string; popular: string; more: string; start: string;
    items: { id: string; name: string; text: string; features: string[]; featured?: boolean }[] };
  app: { eyebrow: string; title1: string; title2: string; lead: string; already: string; items: { title: string; text: string }[] };
  process: { eyebrow: string; title1: string; title2: string; steps: { title: string; text: string }[] };
  voices: { eyebrow: string; title1: string; title2: string; quotes: { text: string; name: string; role: string }[] };
  faq: { eyebrow: string; title1: string; title2: string; other: string; items: { q: string; a: string }[] };
  cta: { eyebrow: string; title1: string; title2: string; lead: string; form: string; whatsapp: string;
    trust: { value: string; label: string }[] };
  ig: { text: string; button: string };
  footer: { rights: string; back: string; cookies: string; instagram: string; whatsapp: string; contact: string };
  form: { title: string; sub: string; name: string; phone: string; email: string; goal: string; program: string; message: string;
    messagePh: string; submit: string; sending: string; success: string; successSub: string; error: string; required: string; privacy: string;
    goals: { value: string; label: string }[]; programs: { value: string; label: string }[]; close: string };
  cookie: { text: string; accept: string; decline: string };
  contact: { whatsapp: string; whatsappText: string; instagram: string };
}

export type SiteLang = 'he' | 'en' | 'fr';
