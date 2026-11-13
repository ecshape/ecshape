import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { APP_LANGUAGES, setLanguage } from '@/i18n/setLanguage';
import { cn } from '@/lib/utils';

/** Language picker for the portal: Hebrew, English, French. */
const LanguageSelector: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { i18n, t } = useTranslation();
  const current = APP_LANGUAGES.find((l) => i18n.language?.startsWith(l.code)) || APP_LANGUAGES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-10 items-center gap-1.5 rounded-full border border-border/70 px-3 text-xs font-bold transition-colors hover:bg-foreground/[.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            compact && 'px-2.5'
          )}
          aria-label={t('common.selectLanguage')}
        >
          <Globe className="h-4 w-4" />
          <span>{current.short}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {APP_LANGUAGES.map((lang) => {
          const active = lang.code === current.code;
          return (
            <DropdownMenuItem
              key={lang.code}
              onClick={() => setLanguage(lang.code)}
              className={cn('justify-between gap-3', active && 'bg-primary/10 font-semibold text-primary')}
            >
              <span>{lang.name}</span>
              {active ? <Check className="h-4 w-4" /> : <span className="text-xs text-muted-foreground">{lang.short}</span>}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LanguageSelector;
