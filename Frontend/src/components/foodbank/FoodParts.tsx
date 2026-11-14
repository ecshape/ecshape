import { mediaUrl } from '@/lib/mediaUrl';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Lock, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { API_BASE_URL } from '@/config/api';
import { CATEGORY_ICON, IconOf, MACRO_ICON, PROPERTY_ICON } from './FoodIcons';
import {
  fmt,
  macroSplit,
  type FoodCategory,
  type ImageCredit,
  type MacroType,
  type MealBankItem,
  type PropertyTag,
  displayName,
  itemTags,
} from './foodbankModel';

/* ------------------------------------------------------------------ */
/* Photo with fade-in, graceful fallback to a designed icon tile       */
/* ------------------------------------------------------------------ */

export function FoodPhoto({
  src,
  alt,
  macro,
  contain,
  className,
  iconSize = 44,
  category,
  children,
}: {
  src?: string | null;
  alt: string;
  macro: MacroType;
  category?: FoodCategory | null;
  contain?: boolean;
  className?: string;
  iconSize?: number;
  children?: React.ReactNode;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  // Photos uploaded to this API are stored as a path (/files/media/food_photos/...).
  const url = mediaUrl(src);
  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [url]);
  const showImg = !!url && !failed;
  return (
    <div className={cn('fb-photo', `fb-accent-${macro}`, contain && 'fb-photo--contain', className)}>
      {(!showImg || !loaded) && (
        <div className="fb-photo__fallback" aria-hidden="true">
          <IconOf icon={(category && CATEGORY_ICON[category]) || MACRO_ICON[macro]} size={iconSize} strokeWidth={1.5} />
        </div>
      )}
      {showImg && (
        <img
          src={url!}
          alt={alt}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          data-loaded={loaded ? 'true' : 'false'}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className="relative"
        />
      )}
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Chips and badges                                                    */
/* ------------------------------------------------------------------ */

export function PropertyChip({
  tag,
  active,
  onClick,
  size = 'sm',
  count,
}: {
  tag: PropertyTag;
  active?: boolean;
  onClick?: () => void;
  size?: 'xs' | 'sm';
  count?: number;
}) {
  const { t } = useTranslation();
  const label = t(`foodBankPro.props.${tag}`);
  const cls = cn(
    'fb-chip inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/40 text-muted-foreground whitespace-nowrap',
    size === 'xs' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1.5 text-xs font-medium',
    onClick && 'hover:text-foreground hover:border-primary/40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  );
  const content = (
    <>
      <span className="fb-chip__icon inline-flex">
        <IconOf icon={PROPERTY_ICON[tag]} size={size === 'xs' ? 12 : 14} />
      </span>
      <span>{label}</span>
      {typeof count === 'number' && <span className="tabular-nums opacity-60">{count}</span>}
    </>
  );
  if (!onClick) {
    return (
      <span className={cls} title={label}>
        {content}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      aria-pressed={active ? 'true' : 'false'}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={label}
    >
      {content}
    </button>
  );
}

export function NutriScoreBadge({ grade, compact }: { grade?: string | null; compact?: boolean }) {
  const { t } = useTranslation();
  if (!grade) return null;
  const g = grade.toLowerCase();
  if (!'abcde'.includes(g)) return null;
  return (
    <span
      className={cn('fb-ns inline-flex items-center gap-1 rounded-md font-semibold', `fb-ns-${g}`, compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]')}
      title={t('foodBankPro.nutriscore', { grade: g.toUpperCase() })}
    >
      {!compact && <span className="opacity-80 font-medium">Nutri</span>}
      {g.toUpperCase()}
    </span>
  );
}

export function NovaBadge({ group, compact }: { group?: number | null; compact?: boolean }) {
  const { t } = useTranslation();
  if (!group || group < 1 || group > 4) return null;
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-md font-semibold', `fb-nova-${group}`, compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]')}
      title={`${t('foodBankPro.nova', { group })}: ${t(`foodBankPro.novaDesc.${group}`)}`}
    >
      NOVA {group}
    </span>
  );
}

export function MacroSplitBar({
  protein,
  carbs,
  fat,
  index = 0,
}: {
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  index?: number;
}) {
  const split = macroSplit(protein, carbs, fat);
  if (!split) return <div className="fb-split" aria-hidden="true" />;
  return (
    <div className="fb-split" aria-hidden="true" style={{ ['--i' as string]: index }}>
      {split.protein > 0 && <span className="fb-dot-protein" style={{ flexGrow: split.protein, flexBasis: 0 }} />}
      {split.carb > 0 && <span className="fb-dot-carb" style={{ flexGrow: split.carb, flexBasis: 0 }} />}
      {split.fat > 0 && <span className="fb-dot-fat" style={{ flexGrow: split.fat, flexBasis: 0 }} />}
    </div>
  );
}

export function MacroStats({
  protein,
  carbs,
  fat,
  compact,
}: {
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const rows: Array<[MacroType, number | null | undefined]> = [
    ['protein', protein],
    ['carb', carbs],
    ['fat', fat],
  ];
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {rows.map(([macro, value]) => (
        <div key={macro} className={cn('rounded-lg bg-muted/60 text-center', compact ? 'px-1 py-1' : 'px-1.5 py-1.5')}>
          <div className={cn('flex items-center justify-center gap-1 text-muted-foreground', compact ? 'text-[10px]' : 'text-[11px]')}>
            <span className={cn('inline-block h-1.5 w-1.5 rounded-full', `fb-dot-${macro}`)} />
            {t(`foodBankPro.macro.${macro}`)}
          </div>
          <div className={cn('font-semibold tabular-nums text-foreground', compact ? 'text-xs' : 'text-sm')}>
            {fmt(value)}
            {value !== null && value !== undefined && (
              <span className="ms-0.5 text-[10px] font-normal text-muted-foreground">{t('foodBankPro.g')}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PhotoCredit({ credit, className }: { credit?: ImageCredit | null; className?: string }) {
  const { t } = useTranslation();
  if (!credit) return null;
  const safeUrl = credit.url && /^https:\/\//i.test(credit.url) ? credit.url : undefined;
  const label =
    credit.provider === 'Open Food Facts'
      ? `${credit.provider} (${credit.license ?? 'CC BY-SA'})`
      : t('foodBankPro.photoCredit', { author: credit.author ?? credit.provider, license: credit.license ?? '' });
  return (
    <a
      href={safeUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('truncate text-[10px] leading-tight text-white/80 hover:text-white underline-offset-2 hover:underline', className)}
      onClick={(e) => e.stopPropagation()}
      title={label}
    >
      {label}
    </a>
  );
}

/* ------------------------------------------------------------------ */
/* Food card                                                           */
/* ------------------------------------------------------------------ */

export function FoodCard({
  item,
  index,
  canEdit,
  activeTags,
  onToggleTag,
  onEdit,
  onDelete,
  onOpen,
}: {
  item: MealBankItem;
  index: number;
  canEdit: boolean;
  activeTags: PropertyTag[];
  onToggleTag: (tag: PropertyTag) => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Opens the detail sheet; the whole card becomes clickable (stretched link on the title). */
  onOpen?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.slice(0, 2) || 'he';
  const { primary, secondary } = displayName(item, lang);
  const tags = itemTags(item);
  const perLabel =
    (item.measurement_type ?? 'per_100g') === 'per_portion'
      ? item.serving_size || t('foodBankPro.perPortion')
      : t('foodBankPro.per100g');
  const isOff = item.source === 'openfoodfacts';

  return (
    <article
      className="fb-card group relative flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card"
      style={{ ['--i' as string]: index }}
    >
      <FoodPhoto src={item.image_url} alt={primary} macro={item.macro_type} contain={isOff}>
        <div className="fb-photo__shade" />
        {/* top row: macro badge + actions */}
        <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-2.5">
          <span className={cn('fb-macro-badge inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-sm', `fb-accent-${item.macro_type}`)}>
            <IconOf icon={MACRO_ICON[item.macro_type]} size={13} />
            {t(`foodBankPro.macro.${item.macro_type}`)}
          </span>
          {canEdit && (
            <div className="fb-actions flex gap-1.5">
              <button
                type="button"
                onClick={onEdit}
                className="fb-glass grid h-9 w-9 place-items-center rounded-full transition-transform hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t('foodBankPro.edit')}
                title={t('foodBankPro.edit')}
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="fb-glass grid h-9 w-9 place-items-center rounded-full text-red-300 transition-transform hover:scale-110 hover:text-red-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t('foodBankPro.delete')}
                title={t('foodBankPro.delete')}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
        {/* bottom row: kcal + credit */}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2.5">
          <div className="min-w-0 flex-1">
            <PhotoCredit credit={item.image_url ? item.image_credit : null} className="relative z-10 block" />
          </div>
          <div className="fb-glass shrink-0 rounded-xl px-2.5 py-1 text-end leading-none">
            <span className="text-base font-bold tabular-nums">{item.calories ?? '—'}</span>
            <span className="ms-1 text-[10px] opacity-80">{t('foodBankPro.kcal')}</span>
          </div>
        </div>
      </FoodPhoto>

      <div className="flex flex-1 flex-col gap-3 p-3.5">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground" dir="auto">
              {onOpen ? (
                <button type="button" onClick={onOpen} className="fb-stretch text-start focus-visible:outline-none">
                  {primary}
                </button>
              ) : (
                primary
              )}
            </h3>
            <span
              className="mt-0.5 shrink-0 text-muted-foreground"
              title={item.is_public ? t('foodBankPro.public') : t('foodBankPro.private')}
            >
              {item.is_public ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
              <span className="sr-only">{item.is_public ? t('foodBankPro.public') : t('foodBankPro.private')}</span>
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground" dir="auto">
            {[secondary, item.brand && !primary.includes(item.brand) ? item.brand : null].filter(Boolean).join(' · ') || ' '}
          </p>
        </div>

        <div className="space-y-2">
          <MacroSplitBar protein={item.protein} carbs={item.carbs} fat={item.fat} index={index} />
          <MacroStats protein={item.protein} carbs={item.carbs} fat={item.fat} />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{perLabel}</span>
            <span className="flex items-center gap-1">
              <NutriScoreBadge grade={item.nutriscore} compact />
              <NovaBadge group={item.nova_group} compact />
            </span>
          </div>
        </div>

        {tags.length > 0 && (
          <div className="relative z-10 mt-auto flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <PropertyChip key={tag} tag={tag} size="xs" active={activeTags.includes(tag)} onClick={() => onToggleTag(tag)} />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

export function FoodCardSkeleton({ index = 0 }: { index?: number }) {
  return (
    <div className="fb-card overflow-hidden rounded-2xl border border-border/60 bg-card" style={{ ['--i' as string]: index }} aria-hidden="true">
      <div className="fb-skel aspect-[16/10]" />
      <div className="space-y-3 p-3.5">
        <div className="fb-skel h-4 w-3/4 rounded" />
        <div className="fb-skel h-3 w-1/2 rounded" />
        <div className="fb-skel h-1.5 w-full rounded-full" />
        <div className="grid grid-cols-3 gap-1.5">
          <div className="fb-skel h-10 rounded-lg" />
          <div className="fb-skel h-10 rounded-lg" />
          <div className="fb-skel h-10 rounded-lg" />
        </div>
        <div className="flex gap-1.5">
          <div className="fb-skel h-5 w-20 rounded-full" />
          <div className="fb-skel h-5 w-16 rounded-full" />
        </div>
      </div>
    </div>
  );
}
