import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Lock, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet } from '@/features/trainer/ui';
import { IconOf, MACRO_ICON } from './FoodIcons';
import { FoodPhoto, MacroSplitBar, MacroStats, NovaBadge, NutriScoreBadge, PhotoCredit, PropertyChip } from './FoodParts';
import { displayName, fmt, itemTags, type MealBankItem } from './foodbankModel';

/** Every property of a food-bank item in one sheet (#16): photo, names, calories, macros, tags, source, edit/delete. */
export const FoodDetailSheet: React.FC<{
  item: MealBankItem | null;
  canEdit: boolean;
  onClose: () => void;
  onEdit: (item: MealBankItem) => void;
  onDelete: (item: MealBankItem) => void;
}> = ({ item, canEdit, onClose, onEdit, onDelete }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.slice(0, 2) || 'he';
  const [last, setLast] = useState<MealBankItem | null>(item);
  useEffect(() => { if (item) setLast(item); }, [item]);
  const it = item ?? last;
  if (!it) return null;

  const { primary, secondary } = displayName(it, lang);
  const per = (it.measurement_type ?? 'per_100g') === 'per_portion' ? it.serving_size || t('foodBankPro.perPortion') : t('foodBankPro.per100g');
  const tags = itemTags(it);
  const source = it.source === 'openfoodfacts' ? 'Open Food Facts' : it.source ? t('foodBankPro.library.staples') : t('tt.food.manual');

  return (
    <Sheet
      open={!!item}
      onOpenChange={(o) => !o && onClose()}
      title={primary}
      description={[secondary, it.brand].filter(Boolean).join(' · ') || undefined}
      footer={canEdit ? (
        <div className="flex gap-2">
          <button type="button" className="tp-btn tp-btn--primary tp-btn--sm tp-press flex-1" onClick={() => onEdit(it)}>
            <Pencil className="h-4 w-4" />{t('tt.common.edit')}
          </button>
          <button type="button" className="tp-icon-btn tp-press text-[hsl(var(--tr-bad))]" onClick={() => onDelete(it)} aria-label={t('tt.common.delete')} title={t('tt.common.delete')}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ) : undefined}
    >
      <div className="space-y-4 pb-2">
        <FoodPhoto src={it.image_url} alt={primary} macro={it.macro_type} contain={it.source === 'openfoodfacts'} className="!aspect-[16/9] rounded-2xl" iconSize={56}>
          <div className="fb-photo__shade" />
          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
            <span className={cn('fb-macro-badge inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm', `fb-accent-${it.macro_type}`)}>
              <IconOf icon={MACRO_ICON[it.macro_type]} size={14} />
              {t(`foodBankPro.macro.${it.macro_type}`)}
            </span>
            <span className="fb-glass inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs">
              {it.is_public ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
              {it.is_public ? t('foodBankPro.public') : t('foodBankPro.private')}
            </span>
          </div>
          <div className="absolute inset-x-0 bottom-0 p-3"><PhotoCredit credit={it.image_url ? it.image_credit : null} className="block" /></div>
        </FoodPhoto>

        <div className="grid grid-cols-[auto_1fr] items-center gap-4 rounded-2xl bg-foreground/[.04] p-4">
          <div>
            <p className="tp-num text-4xl leading-none">{it.calories ?? '–'}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('foodBankPro.kcal')} · {per}</p>
          </div>
          <div className="space-y-2">
            <MacroSplitBar protein={it.protein} carbs={it.carbs} fat={it.fat} />
            <MacroStats protein={it.protein} carbs={it.carbs} fat={it.fat} compact />
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div className="tr-stat !p-3"><dt className="tp-label">{t('foodBankPro.form.fiber')}</dt><dd className="mt-1 font-semibold tabular-nums">{it.fiber != null ? `${fmt(it.fiber)} ${t('foodBankPro.g')}` : '–'}</dd></div>
          <div className="tr-stat !p-3"><dt className="tp-label">{t('foodBank.servingSize')}</dt><dd className="mt-1 font-semibold">{per}</dd></div>
          <div className="tr-stat !p-3"><dt className="tp-label">{t('tt.food.source')}</dt><dd className="mt-1 font-semibold">{source}</dd></div>
          <div className="tr-stat !p-3">
            <dt className="tp-label">{t('tt.food.quality')}</dt>
            <dd className="mt-1 flex items-center gap-1.5">
              {it.nutriscore || it.nova_group ? <><NutriScoreBadge grade={it.nutriscore} /><NovaBadge group={it.nova_group} /></> : <span className="font-semibold">–</span>}
            </dd>
          </div>
        </dl>

        {tags.length > 0 && (
          <section>
            <h3 className="tp-label mb-2">{t('foodBankPro.properties')}</h3>
            <div className="flex flex-wrap gap-1.5">{tags.map((tag) => <PropertyChip key={tag} tag={tag} />)}</div>
          </section>
        )}
      </div>
    </Sheet>
  );
};

export default FoodDetailSheet;
