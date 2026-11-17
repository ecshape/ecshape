import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Page title of every studio screen (My site, SEO, QA, Prospects, Settings), in the portal's standard format:
 * small uppercase label, Karantina display title, optional lead line, actions on the other side. No icons.
 * Same proportions as the trainer portal's PageTitle, but self-contained (no dependency on the trainee stylesheet).
 */
export const StudioHeader: React.FC<{
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  lead?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}> = ({ eyebrow, title, lead, actions, className }) => (
  <header className={cn('ec-stagger mb-6 flex flex-wrap items-end justify-between gap-4 lg:mb-8', className)}>
    <div className="min-w-0">
      {eyebrow && <div className="text-[.78rem] font-bold uppercase tracking-[.02em] text-muted-foreground ltr:text-[.7rem] ltr:tracking-[.14em]">{eyebrow}</div>}
      <h1 className="ec-page-title mt-2 break-words !text-[2.75rem] !leading-[.88] sm:!text-6xl lg:!text-[4.5rem]">{title}</h1>
      {lead && <p className="mt-3 max-w-xl text-muted-foreground">{lead}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </header>
);

export default StudioHeader;
