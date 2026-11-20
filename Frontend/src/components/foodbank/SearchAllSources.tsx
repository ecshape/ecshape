import React from 'react';
import { useTranslation } from 'react-i18next';
import { Library } from 'lucide-react';
import '@/i18n/foodTable';

/** "Not finding it? Search '…' in all food sources" under the coach's results: opens the food library on that search. */
export const SearchAllSources: React.FC<{ query: string; onClick: () => void }> = ({ query, onClick }) => {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className="tp-press flex w-full items-center gap-3 rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-start hover:bg-primary/10"
    >
      <Library className="h-5 w-5 flex-none text-primary" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted-foreground">{t('foodTable.notFound')}</span>
        <span className="block truncate font-semibold" dir="auto">{query ? t('foodTable.searchAll', { q: query }) : t('foodTable.browseAll')}</span>
        <span className="block text-xs text-muted-foreground">{t('foodTable.allHint')}</span>
      </span>
    </button>
  );
};

export default SearchAllSources;
