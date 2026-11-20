import React, { useCallback, useState } from 'react';
import { prefersReducedMotion } from '@/lib/motion';
import '@/styles/automations.css';

/**
 * A one-shot spark burst over its child (QA #122 / #123: a rule that fires, a task that gets done).
 * `const [burst, fire] = useBurst()` then `<Burst k={burst}>…</Burst>` and call `fire()`.
 */
export function useBurst(): [number, () => void] {
  const [k, setK] = useState(0);
  const fire = useCallback(() => { if (!prefersReducedMotion()) setK((x) => x + 1); }, []);
  return [k, fire];
}

export const Burst: React.FC<{ k: number; className?: string; children: React.ReactNode }> = ({ k, className, children }) => (
  <span className={`au-burst inline-grid ${className ?? ''}`}>
    {children}
    {k > 0 && Array.from({ length: 8 }, (_, i) => (
      <span key={`${k}-${i}`} className="au-spark" style={{ '--a': `${i * 45}deg` } as React.CSSProperties} aria-hidden />
    ))}
  </span>
);
