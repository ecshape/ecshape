import React, { useId, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { fmtDate, fmtNum } from '@/features/trainee/format';

export interface TrendPoint { t: number; v: number }

/**
 * Area chart that draws itself on enter. Time runs left to right in every language (dir="ltr").
 * Hover / touch shows the nearest value. Pure SVG, no chart library.
 */
export const TrendChart: React.FC<{ points: TrendPoint[]; unit?: string; height?: number; className?: string; label: string; digits?: number }> = ({
  points, unit = '', height = 180, className, label, digits = 1,
}) => {
  const id = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const pad = { t: 16, b: 26, x: 8 };

  const geo = useMemo(() => {
    const sorted = [...points].sort((a, b) => a.t - b.t);
    if (sorted.length < 2) return null;
    const vs = sorted.map((p) => p.v);
    const min = Math.min(...vs);
    const max = Math.max(...vs);
    const span = max - min || 1;
    const lo = min - span * 0.15;
    const hi = max + span * 0.15;
    const t0 = sorted[0].t;
    const tSpan = sorted[sorted.length - 1].t - t0 || 1;
    const xy = sorted.map((p) => ({
      ...p,
      x: pad.x + ((p.t - t0) / tSpan) * (W - pad.x * 2),
      y: pad.t + (1 - (p.v - lo) / (hi - lo)) * (height - pad.t - pad.b),
    }));
    // Smooth path (Catmull-Rom to Bezier)
    let d = `M${xy[0].x},${xy[0].y}`;
    for (let i = 0; i < xy.length - 1; i++) {
      const p0 = xy[i - 1] ?? xy[i];
      const p1 = xy[i];
      const p2 = xy[i + 1];
      const p3 = xy[i + 2] ?? p2;
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return { xy, d, min, max };
  }, [points, height]);

  if (!geo) return null;
  const last = geo.xy[geo.xy.length - 1];
  const h = hover !== null ? geo.xy[hover] : null;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    geo.xy.forEach((p, i) => {
      if (Math.abs(p.x - x) < Math.abs(geo.xy[best].x - x)) best = i;
    });
    setHover(best);
  };

  return (
    <div className={cn('relative', className)} dir="ltr">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        preserveAspectRatio="none"
        className="block w-full touch-none"
        style={{ height }}
        role="img"
        aria-label={label}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity=".35" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`s${id}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#F59532" />
            <stop offset="100%" stopColor="#D8361E" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={pad.t + f * (height - pad.t - pad.b)} y2={pad.t + f * (height - pad.t - pad.b)} stroke="hsl(var(--foreground) / .06)" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />
        ))}
        <path className="tr-fade-in" d={`${geo.d} L${last.x},${height - pad.b} L${geo.xy[0].x},${height - pad.b} Z`} fill={`url(#g${id})`} />
        <path className="tr-draw" pathLength={1} d={geo.d} fill="none" stroke={`url(#s${id})`} strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {h && <line x1={h.x} x2={h.x} y1={pad.t} y2={height - pad.b} stroke="hsl(var(--foreground) / .25)" vectorEffect="non-scaling-stroke" />}
      </svg>
      {/* Dots and labels are HTML so they keep their shape when the SVG stretches. */}
      {[h ?? last].map((p) => (
        <span
          key="dot"
          className="pointer-events-none absolute grid h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-primary shadow-[0_0_0_4px_hsl(var(--primary)/.25)] transition-[left,top] duration-200"
          style={{ left: `${(p.x / W) * 100}%`, top: p.y }}
        />
      ))}
      {h && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 rounded-xl bg-foreground px-2.5 py-1.5 text-center text-xs font-bold text-background shadow-lg"
          style={{ left: `${Math.min(88, Math.max(12, (h.x / W) * 100))}%`, top: Math.max(0, h.y - 46) }}
        >
          {fmtNum(h.v, digits)} {unit}
          <span className="block text-[10px] font-medium opacity-70">{fmtDate(new Date(h.t))}</span>
        </div>
      )}
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>{fmtDate(new Date(geo.xy[0].t))}</span>
        <span>{fmtDate(new Date(last.t))}</span>
      </div>
    </div>
  );
};

export default TrendChart;
