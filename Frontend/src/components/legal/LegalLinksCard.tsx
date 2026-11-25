import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { legalNavFor } from '@/legal/i18n';
import { LEGAL_DOCS } from '@/legal/content';

/** Legal audit 2026-11: the coach portal links the legal pages too (accessibility statement reachable everywhere). */
const LegalLinksCard: React.FC = () => {
  const { i18n } = useTranslation();
  const nav = legalNavFor(i18n.language || 'he');
  return (
    <section className="ec-settings-card mt-8 rounded-[1.75rem] p-5 sm:p-7" data-ec-enter>
      <h2 className="font-display text-3xl leading-none">{nav.footerLabel}</h2>
      <nav aria-label={nav.footerLabel} className="mt-4 flex flex-wrap gap-2">
        {LEGAL_DOCS.map((d) => (
          <Link key={d} to={`/legal/${d}`} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ring-1 ring-border/70 hover:bg-foreground/[.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {nav[d]}
          </Link>
        ))}
      </nav>
    </section>
  );
};

export default LegalLinksCard;
