import React from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  /** Optional highlighted second line, rendered in the brand colour. */
  accent?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

/** Editorial page header shared by every portal screen: eyebrow, display title, optional actions. */
export const PageHeader: React.FC<PageHeaderProps> = ({ eyebrow, title, accent, description, actions, className }) => (
  <header className={cn('ec-stagger mb-8 flex flex-col gap-5 sm:mb-10 md:flex-row md:items-end md:justify-between', className)}>
    <div className="min-w-0">
      {eyebrow && <span className="ec-eyebrow">{eyebrow}</span>}
      <h1 className="ec-page-title mt-3">
        {title}
        {accent && <span className="block text-primary">{accent}</span>}
      </h1>
      {description && <p className="mt-3 max-w-xl text-muted-foreground">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </header>
);

interface StatTileProps {
  icon: React.ElementType;
  value: React.ReactNode;
  label: React.ReactNode;
  highlight?: boolean;
  className?: string;
}

/** Number-first stat card. The highlighted variant uses the solid brand colour. */
export const StatTile: React.FC<StatTileProps> = ({ icon: Icon, value, label, highlight, className }) => (
  <div
    className={cn(
      'group relative flex min-h-[150px] flex-col justify-between overflow-hidden rounded-[1.25rem] border p-5 transition-[transform,border-color] duration-500 ease-[cubic-bezier(.22,1,.36,1)] hover:-translate-y-1',
      highlight
        ? 'border-transparent bg-primary text-primary-foreground shadow-[0_20px_40px_-20px_hsl(var(--primary)/.8)]'
        : 'ec-card border-border/60 bg-card hover:border-primary/35',
      className
    )}
  >
    <span
      className={cn(
        'grid h-10 w-10 place-items-center rounded-xl transition-transform duration-500 group-hover:scale-110',
        highlight ? 'bg-white/20 text-white' : 'bg-primary/12 text-primary'
      )}
    >
      <Icon className="h-5 w-5" />
    </span>
    <div>
      <div className="font-num text-[2.6rem] leading-none"><span dir="ltr" className="inline-block">{value}</span></div>
      <div className={cn('mt-1.5 text-sm', highlight ? 'text-white/85' : 'text-muted-foreground')}>{label}</div>
    </div>
  </div>
);

export default PageHeader;
