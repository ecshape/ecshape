import { EcMark } from './EcMark';
import { cn } from '@/lib/utils';
import './ec-loader.css';

/**
 * The one loading indicator of the platform (QA #31): the minimalist E|C ring, rotating.
 * - default: brand gradient (page / section loaders)
 * - `mono`: paints in currentColor (inside buttons, on the brand gradient, white on dark)
 * Size it with width / height classes (`h-4 w-4`); inside a Button it takes the button's icon size.
 */
export function EcSpinner({ className, mono = false, label }: { className?: string; mono?: boolean; label?: string }) {
  return (
    <span className={cn('ec-loader', className)} role="status" aria-live="polite" aria-label={label}>
      <EcMark variant="ring" mono={mono} className="ec-loader-mark" title={label || 'Loading'} />
    </span>
  );
}

/** Centred loader for a page or a panel while its data loads. */
export function EcPageLoader({ className, label }: { className?: string; label?: string }) {
  return (
    <div className={cn('flex min-h-[40vh] w-full items-center justify-center', className)}>
      <EcSpinner className="h-11 w-11" label={label} />
    </div>
  );
}

export default EcSpinner;
