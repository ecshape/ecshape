import { useId } from 'react';
import { cn } from '@/lib/utils';
import { EC_FIGURE, EC_RING } from './brandPaths';

type Variant = 'ring' | 'trainer';

/**
 * ECshape marks, redrawn from the original logo:
 *  - ring:    the E|C initials only
 *  - trainer: the initials with the trainer standing in front
 * `mono` paints the ring in currentColor (for use on the brand gradient).
 * The complete logo (with the wordmark) is /brand/ec-logo.svg.
 */
export function EcMark({ variant = 'ring', mono = false, className, title = 'ECshape' }: { variant?: Variant; mono?: boolean; className?: string; title?: string }) {
  const id = useId().replace(/:/g, '');
  const stroke = mono ? 'currentColor' : `url(#ecg-${id})`;
  const [tx, ty] = EC_RING.topEnd;
  const [bx, by] = EC_RING.bottomStart;
  return (
    <svg viewBox={variant === 'trainer' ? '0 0 100 104' : '0 0 100 100'} className={cn('ec-mark', className)} role="img" aria-label={title}>
      {!mono && (
        <defs>
          <linearGradient id={`ecg-${id}`} x1="10" y1="8" x2="92" y2="94" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#F59532" />
            <stop offset=".55" stopColor="#EE7A2A" />
            <stop offset="1" stopColor="#D8361E" />
          </linearGradient>
        </defs>
      )}
      <g fill="none" stroke={stroke} strokeWidth="12" className="ec-mark-ring">
        <path className="ec-mark-e" d="M50 8 A42 42 0 0 0 50 92" pathLength={1} />
        <path className="ec-mark-bar" d="M8 51 H50" pathLength={1} />
        <path className="ec-mark-stem" d="M50 8 V92" pathLength={1} />
        <path className="ec-mark-c1" d={`M50 8 A42 42 0 0 1 ${tx} ${ty}`} pathLength={1} />
        <path className="ec-mark-c2" d={`M${bx} ${by} A42 42 0 0 1 50 92`} pathLength={1} />
      </g>
      {variant === 'trainer' && (
        <g className="ec-mark-figure">
          {EC_FIGURE.map(([fill, d], i) => (
            <path key={i} fill={fill} d={d} />
          ))}
        </g>
      )}
    </svg>
  );
}

export default EcMark;
