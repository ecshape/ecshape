import React from 'react';
import { cn } from '@/lib/utils';

interface RatingScaleProps {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  label?: string;
  min?: number;
  max?: number;
  disabled?: boolean;
}

export const RatingScale: React.FC<RatingScaleProps> = ({
  value,
  onChange,
  label,
  min = 1,
  max = 10,
  disabled = false
}) => {
  const handleClick = (num: number) => {
    if (!disabled) {
      onChange(num === value ? null : num);
    }
  };

  const numbers = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  return (
    <div className="space-y-2">
      {label && (
        <label className="text-sm font-medium text-foreground">{label}</label>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        {numbers.map((num) => (
          <button
            key={num}
            type="button"
            onClick={() => handleClick(num)}
            disabled={disabled}
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all",
              value === num
                ? "bg-gradient-to-r from-orange-500 to-orange-600 text-background ring-2 ring-orange-400 ring-offset-2 ring-offset-background"
                : "bg-secondary border border-border text-muted-foreground hover:bg-secondary/80 hover:border-primary/50",
              disabled && "opacity-50 cursor-not-allowed"
            )}
            aria-label={`Rating ${num}`}
            aria-pressed={value === num}
          >
            {num}
          </button>
        ))}
      </div>
    </div>
  );
};

