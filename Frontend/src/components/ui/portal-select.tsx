import React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export type PortalSelectOption = { value: string; label: React.ReactNode; hint?: React.ReactNode };

/**
 * The portal's list picker (QA #36): same menu as the language choice — rounded panel, highlighted current
 * item with a check — instead of the browser's native <select>. Keyboard and screen readers via Radix.
 */
export function PortalSelect({
  value, onChange, options, label, icon: Icon, placeholder, className, align = 'start', id,
}: {
  value: string;
  onChange: (v: string) => void;
  options: PortalSelectOption[];
  /** Accessible name (the visible text is the current choice). */
  label: string;
  icon?: React.ElementType;
  placeholder?: React.ReactNode;
  /** Trigger classes; defaults to the pill look of the bank filters. */
  className?: string;
  align?: 'start' | 'center' | 'end';
  id?: string;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          id={id}
          type="button"
          aria-label={label}
          title={label}
          className={cn(
            'ec-select group inline-flex min-h-[2.75rem] min-w-0 items-center gap-2 rounded-full bg-foreground/[.05] px-3.5 text-start text-sm font-semibold shadow-[inset_0_0_0_1px_hsl(var(--foreground)/.06)] transition-colors hover:bg-foreground/[.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:shadow-[inset_0_0_0_2px_hsl(var(--primary))]',
            className,
          )}
        >
          {Icon && <Icon className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />}
          <span className={cn('min-w-0 flex-1 truncate', !current && 'text-muted-foreground')} dir="auto">{current?.label ?? placeholder}</span>
          <ChevronDown className="h-4 w-4 flex-none text-muted-foreground transition-transform group-data-[state=open]:rotate-180" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="max-h-[min(22rem,var(--radix-dropdown-menu-content-available-height))] min-w-[max(11rem,var(--radix-dropdown-menu-trigger-width))] overflow-y-auto">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <DropdownMenuItem
              key={o.value}
              onSelect={() => onChange(o.value)}
              className={cn('justify-between gap-3', active && 'bg-primary/10 font-semibold text-primary')}
              aria-checked={active}
              role="menuitemradio"
            >
              <span className="min-w-0 truncate" dir="auto">{o.label}</span>
              {active ? <Check className="h-4 w-4 flex-none" /> : o.hint ? <span className="flex-none text-xs text-muted-foreground">{o.hint}</span> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default PortalSelect;
