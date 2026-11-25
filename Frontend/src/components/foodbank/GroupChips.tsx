/**
 * Food-group chips of the ECShape table (poultry, dairy, bread…): one scrolling row, only the groups present, with counts.
 * Used by the coach's food bank, the meal planner's food picker and the trainee's swap / bank sheets.
 */
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { FOOD_GROUPS } from '@/i18n/foodTable';

/** 'all', a group key, or 'mine' (foods the coach added himself, outside the table). */
export type GroupFilter = string;

interface Groupable {
  food_group?: string | null;
  source?: string | null;
}

export const matchesGroup = (item: Groupable, filter: GroupFilter) =>
  filter === 'all' || (filter === 'mine' ? item.source !== 'ecshape' : item.food_group === filter);

export function GroupChips<T extends Groupable>({
  items,
  value,
  onChange,
  showMine = false,
  className,
}: {
  items: T[];
  value: GroupFilter;
  onChange: (v: GroupFilter) => void;
  showMine?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const { counts, mine } = useMemo(() => {
    const c = new Map<string, number>();
    let m = 0;
    for (const i of items) {
      if (i.food_group) c.set(i.food_group, (c.get(i.food_group) ?? 0) + 1);
      if (i.source !== 'ecshape') m += 1;
    }
    return { counts: c, mine: m };
  }, [items]);
  const groups = FOOD_GROUPS.filter((g) => counts.get(g));
  if (!groups.length) return null;

  const chip = (key: string, label: string, count: number) => (
    <button
      key={key}
      type="button"
      aria-pressed={value === key}
      onClick={() => onChange(value === key && key !== 'all' ? 'all' : key)}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        value === key
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border/70 bg-background/40 text-muted-foreground hover:border-primary/40 hover:text-foreground',
      )}
    >
      <span>{label}</span>
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );

  return (
    <div
      role="toolbar"
      aria-label={t('foodTable.groups')}
      className={cn('-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]', className)}
    >
      {chip('all', t('foodTable.all'), items.length)}
      {groups.map((g) => chip(g, t(`foodTable.group.${g}`), counts.get(g) ?? 0))}
      {showMine && mine > 0 && chip('mine', t('foodTable.mine'), mine)}
    </div>
  );
}

export default GroupChips;
