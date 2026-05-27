import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from 'react-i18next';

const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggleTheme}
      className="relative"
      aria-label={theme === 'dark' ? t('common.switchToLight', 'עבור למצב בהיר') : t('common.switchToDark', 'עבור למצב כהה')}
    >
      {theme === 'dark' ? (
        <Sun className="h-5 w-5" />
      ) : (
        <Moon className="h-5 w-5" />
      )}
      <span className="sr-only">
        {theme === 'dark' ? t('common.switchToLight', 'עבור למצב בהיר') : t('common.switchToDark', 'עבור למצב כהה')}
      </span>
    </Button>
  );
};

export default ThemeToggle;
