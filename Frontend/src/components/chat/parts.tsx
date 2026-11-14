import React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { avatarSrc } from '@/lib/avatar';
import { cn } from '@/lib/utils';
import { initials } from './format';

const TONES = [
  'from-[#f0661f] to-[#c2410c]',
  'from-[#f2b552] to-[#d9822b]',
  'from-[#e8875b] to-[#b4532a]',
  'from-[#d1a074] to-[#8c5a33]',
  'from-[#f59e6b] to-[#e0552a]',
];
const tone = (name: string) => {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
};

export const ChatAvatar: React.FC<{ name: string; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string; src?: string | null }> = ({ name, size = 'md', className, src }) => (
  <span
    aria-hidden
    className={cn(
      'relative grid shrink-0 select-none place-items-center rounded-full bg-gradient-to-br font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.25)]',
      tone(name || '?'),
      size === 'sm' && 'h-8 w-8 text-[11px]',
      size === 'md' && 'h-11 w-11 text-sm',
      size === 'lg' && 'h-12 w-12 text-base',
      size === 'xl' && 'h-20 w-20 text-2xl',
      className,
    )}
  >
    {initials(name)}
    {/* Profile photo on top of the initials (they stay as the fallback if the file fails to load) */}
    {avatarSrc(src) && (
      <img src={avatarSrc(src)} alt="" className="absolute inset-0 h-full w-full rounded-full object-cover" loading="lazy" decoding="async" draggable={false} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
    )}
  </span>
);

export const EmptyState: React.FC<{ icon: React.ElementType; title: string; hint?: string; action?: React.ReactNode; className?: string }> = ({ icon: Icon, title, hint, action, className }) => (
  <div className={cn('ec-chat-fade flex flex-col items-center justify-center px-8 py-12 text-center', className)}>
    <span className="mb-5 grid h-16 w-16 place-items-center rounded-[1.4rem] bg-primary/10 text-primary ring-1 ring-primary/15">
      <Icon className="h-7 w-7" aria-hidden />
    </span>
    <p className="text-base font-semibold text-foreground">{title}</p>
    {hint && <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">{hint}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export const IconButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }>(
  ({ label, className, children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-[background-color,color,transform] duration-200 hover:bg-muted hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
);
IconButton.displayName = 'IconButton';

/**
 * Bottom sheet on phones, side drawer on large screens. Built on the Radix dialog so
 * focus trapping, Escape and scroll locking come for free.
 */
export const ChatSheet: React.FC<{
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  side?: 'bottom' | 'end';
  children: React.ReactNode;
}> = ({ open, onOpenChange, title, description, side = 'bottom', children }) => {
  const { t, i18n } = useTranslation();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/55 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          dir={i18n.dir()}
          className={cn(
            'fixed z-[81] flex flex-col bg-card text-card-foreground shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:duration-300 data-[state=closed]:duration-200',
            side === 'bottom'
              ? 'inset-x-0 bottom-0 max-h-[85dvh] rounded-t-[1.75rem] pb-[env(safe-area-inset-bottom)] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom'
              : 'inset-y-0 end-0 w-[min(400px,92vw)] border-s border-border data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          )}
        >
          {side === 'bottom' && <span aria-hidden className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-foreground/15" />}
          <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-0.5 text-sm text-muted-foreground">{description}</DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close asChild>
              <IconButton label={t('chat.ui.close')} className="-me-2 -mt-1 bg-muted/60">
                <X className="h-5 w-5" />
              </IconButton>
            </DialogPrimitive.Close>
          </div>
          <div className="ec-chat-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
