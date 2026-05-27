import React from 'react';
import { Check, X, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface YesNoSkipButtonsProps {
  value: boolean | null | undefined;
  onChange: (value: boolean | null) => void;
  label?: string;
  disabled?: boolean;
}

export const YesNoSkipButtons: React.FC<YesNoSkipButtonsProps> = ({
  value,
  onChange,
  label,
  disabled = false
}) => {
  const handleClick = (newValue: boolean | null) => {
    if (!disabled) {
      onChange(newValue);
    }
  };

  return (
    <div className="space-y-2">
      {label && (
        <label className="text-sm font-medium text-foreground">{label}</label>
      )}
      <div className="flex items-center gap-2">
        {/* Yes Button */}
        <button
          type="button"
          onClick={() => handleClick(true)}
          disabled={disabled}
          className={cn(
            "w-12 h-12 rounded-lg border-2 transition-all flex items-center justify-center",
            value === true
              ? "bg-gradient-to-r from-orange-500 to-orange-600 text-background border-orange-500"
              : "bg-secondary border-border text-muted-foreground hover:bg-secondary/80",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          aria-label="Yes"
        >
          <Check className="w-5 h-5" />
        </button>

        {/* No Button */}
        <button
          type="button"
          onClick={() => handleClick(false)}
          disabled={disabled}
          className={cn(
            "w-12 h-12 rounded-lg border-2 transition-all flex items-center justify-center",
            value === false
              ? "bg-destructive text-background border-destructive"
              : "bg-secondary border-border text-muted-foreground hover:bg-secondary/80",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          aria-label="No"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Skip Button */}
        <button
          type="button"
          onClick={() => handleClick(null)}
          disabled={disabled}
          className={cn(
            "w-12 h-12 rounded-lg border-2 transition-all flex items-center justify-center",
            value === null || value === undefined
              ? "bg-muted text-muted-foreground border-muted"
              : "bg-secondary border-border text-muted-foreground hover:bg-secondary/80",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          aria-label="Skip"
        >
          <RotateCw className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

