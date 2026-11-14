import { useEffect, useRef, useState } from 'react';
import { Dumbbell } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Animated exercise demo: loops the start and end positions with a smooth crossfade
 * (free-exercise-db frames). Falls back to a single image, then to a designed placeholder.
 * Plays only while visible, and holds still with prefers-reduced-motion.
 */
export function ExerciseDemo({ frames, alt, className, playing }: { frames: string[]; alt: string; className?: string; playing?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return setVisible(true);
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '120px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const usable = frames.filter(Boolean);
  const animate = usable.length > 1 && loaded >= usable.length && (playing ?? visible);

  return (
    <div ref={ref} className={cn('ec-exdemo relative overflow-hidden', className)}>
      {failed || usable.length === 0 ? (
        <div className="ec-exdemo-empty grid h-full w-full place-items-center bg-muted/40 text-muted-foreground">
          <Dumbbell className="h-8 w-8" />
        </div>
      ) : (
        usable.slice(0, 2).map((src, i) => (
          <img
            key={src}
            src={visible || i === 0 ? src : undefined}
            alt={i === 0 ? alt : ''}
            aria-hidden={i > 0}
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded((n) => n + 1)}
            onError={() => i === 0 && setFailed(true)}
            className={cn('absolute inset-0 h-full w-full object-cover', i === 1 && 'ec-exdemo-b', animate && 'is-playing')}
          />
        ))
      )}
      {usable.length > 1 && !failed && <span className={cn('ec-exdemo-live', animate && 'is-on')} aria-hidden />}
    </div>
  );
}

export default ExerciseDemo;
