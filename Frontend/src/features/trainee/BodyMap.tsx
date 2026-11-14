import React, { useId } from 'react';
import { cn } from '@/lib/utils';
import type { Load, Region } from './training/muscles';
import './training/training.css';

/*
 * Front + back body map, drawn from scratch: one half of each figure is described and mirrored.
 * Coordinates: one figure is 100 x 210 with its centre line at x = 50.
 */

const SILHOUETTE =
  'M50,23 L45.5,23 L45,29 C40,30 34,30.5 30,32 C25,33.5 22.5,38 22,44 C21,50 20,58 19.5,66 C18.5,72 16.5,80 15.5,88 ' +
  'C15,93 14.5,97 14,100 C13,103 13,108 15,111 C17,113 19.5,112 20,109 C20.5,105 20.5,102 21,99 C23,92 25.5,84 27,76 ' +
  'C28,70 29,64 30,58 L31.5,52 C32,62 33,72 34,84 C33.5,90 33,95 33.5,100 C33,112 33.5,126 35.5,140 C36.5,146 36.5,150 36,154 ' +
  'C35,165 35.5,178 37.5,192 L37,200 C37,204 40,205 44,204 L45,201 C45,190 46,176 46,164 C46,158 46.5,153 47,149 ' +
  'C47.5,136 48.5,118 49,104 L50,102 Z';

type Shapes = Partial<Record<Region, string[]>>;

const FRONT: Shapes = {
  neck: ['M45.6,23.6 L47.6,23.6 L48.6,30.2 L45.6,29.6 Z'],
  traps: ['M45,28.6 C41,29.6 37,30.6 33.6,31.6 L45.6,31.2 Z'],
  frontDelts: ['M34,32.2 C28.5,32.6 24.6,36 23.7,42 C23.5,45.5 24,48 25.2,50 C28,46 31,41.5 35.6,37.6 Z'],
  sideDelts: ['M27.6,33.8 C25,35.8 23.9,39 23.6,42.5 C23.4,45.5 24,48 25.2,50 C25.8,46 26.6,40 27.6,33.8 Z'],
  chest: ['M49.3,33.5 L36.6,33.8 C33,37 31.6,42 31.8,47.5 C34,51.5 40,53.5 45,53 C47.5,52.7 49,52 49.3,51 Z'],
  biceps: ['M25.6,51.5 C23.5,56 22.4,62 22.6,68.5 C24,70.5 26.5,70.5 28,69 C29.3,63 30,57.5 30.2,52.5 C29,50.5 27,50 25.6,51.5 Z'],
  forearms: ['M22.3,72 C20,78.5 18.2,86 17.4,95 L20.2,96.5 C22.5,89 25,81 26.6,73 C25.5,71 23.5,70.8 22.3,72 Z'],
  abs: ['M49.2,55.5 L43.6,55.5 C43,66 43,78 44,90 C45.5,95 47.5,98 49.2,99 Z'],
  obliques: ['M42.2,55 C38,55 34.6,57 33.2,59.5 C33.6,68 34.5,78 35.5,86 C37.5,89 40,91 42.6,92 C42,80 41.8,67 42.2,55 Z'],
  abductors: ['M34.3,92 C33.6,97 33.6,103 34.3,109 C35.5,104 37.2,99.5 39.5,96 C38,94 36,92.5 34.3,92 Z'],
  adductors: ['M49.4,103 C47.2,105 45.6,108 45.3,112 C46.5,118 47.5,126 47.9,133 C48.6,124 49.2,112 49.4,103 Z'],
  quads: ['M40,97.5 C37,102 35,110 34.8,120 C35,129 36.3,137 38.3,145 C40.5,148 44,148.5 46,146.5 C46.8,138 46.6,126 45.4,114 C44.5,106 42.5,100.5 40,97.5 Z'],
  calves: [
    'M37,156 C35.6,164 35.8,173 37.6,182 C39.5,183 40.5,180 40.6,176 C40.5,169 39.5,161 37,156 Z',
    'M45.5,156 C43.8,162 43,170 43.4,178 C44.4,180 45.3,178 45.6,175 C46,168 46,161 45.5,156 Z',
  ],
};

const BACK: Shapes = {
  traps: ['M50,22.6 L46,24 C45.5,27 44.5,29.5 42,30.5 C38.5,31.5 35,32 33,33 C38,35.5 43,38.5 46,44 C47.5,49 48.8,55 50,60 Z'],
  rearDelts: ['M33,33.4 C28,33.6 24.6,37 23.6,42.5 C23.4,45.5 24,48 25.2,50 C28,46.5 31,42.5 35,39 C34.8,37 34,35 33,33.4 Z'],
  sideDelts: ['M27.6,34 C25,36 23.8,39 23.5,42.5 C23.3,45.5 24,48 25.2,50 C25.8,46 26.5,40 27.6,34 Z'],
  triceps: ['M25.4,51.5 C23.3,56 22.3,62 22.5,68.5 C24.2,70.6 26.6,70.4 28.2,68.6 C29.5,63 30.1,57.5 30.2,52.5 C28.8,50.4 26.8,50.2 25.4,51.5 Z'],
  forearms: ['M22.3,72 C20,78.5 18.2,86 17.4,95 L20.2,96.5 C22.5,89 25,81 26.6,73 C25.5,71 23.5,70.8 22.3,72 Z'],
  middleBack: ['M46,45 C42.5,42 38.5,39.8 35.2,39.2 C33.4,41 32.8,43.5 33.4,46.2 C37,49.5 42,52.5 47.5,53 Z'],
  lats: ['M33.6,48 C32.5,54 33,62 34.8,70 C36.5,77 40,83 44.5,86 C46.5,80 47.5,70 48.6,58.5 C43.5,56.5 38,53 33.6,48 Z'],
  lowerBack: ['M49.4,61 C47.6,70 46,80 44.6,88.5 C45.6,92.5 47.6,95 49.4,95.5 Z'],
  obliques: ['M34.8,72 C35.2,79 35.4,85 35.2,90 C37.8,90.5 40.5,89.5 43,88 C39.5,84 36.8,78.5 34.8,72 Z'],
  abductors: ['M34.4,92.5 C34,95 34,97.5 34.6,100 C37.5,96.8 41.5,95 46,94.8 C42,92.2 38,91.5 34.4,92.5 Z'],
  glutes: ['M49.4,97 C44,95 38.5,96 35.4,100 C34,106 34.5,113 37,118 C41,121.5 46,121.5 49.4,119.5 Z'],
  hamstrings: ['M37.5,123 C36,130 36.5,139 38.5,147 C40.5,149.5 43.5,149.6 46.2,148 C47.4,140 47.8,131 47.2,123.5 C44,124.5 40.5,124.5 37.5,123 Z'],
  adductors: ['M49.3,121.5 C48,126 47.8,132 48.1,138 C48.8,133 49.3,127 49.3,121.5 Z'],
  calves: [
    'M37.5,154 C35.5,160 35.4,168 37,175 C38.8,178.5 41.5,178.5 43.4,176 C44,169 43.6,160 41.8,154.5 C40.4,153.2 38.8,153.2 37.5,154 Z',
    'M42.8,154.5 C44.8,160 45.6,168 45,175 C46.2,174 46.6,166 46.2,159 C45.6,156.5 44.4,155 42.8,154.5 Z',
  ],
};

/** Ab segment lines and a few anatomical contour strokes (drawn over the muscles). */
const FRONT_LINES = ['M43.4,63 L49.2,63', 'M43.3,71 L49.2,71', 'M43.5,79.5 L49.2,79.5', 'M36,153 C38.5,154.5 42.5,154.5 45.6,153'];
const BACK_LINES = ['M36.4,152 C39,153.4 42.8,153.4 46,152', 'M30.6,40.8 C31.8,45 33,48 33.8,50'];

/** Order matters: later shapes sit on top. */
const ORDER: Region[] = [
  'adductors', 'quads', 'abductors', 'hamstrings', 'glutes', 'calves', 'obliques', 'abs', 'lats', 'lowerBack', 'middleBack',
  'traps', 'neck', 'chest', 'biceps', 'triceps', 'forearms', 'frontDelts', 'rearDelts', 'sideDelts',
];

export type BodyMapProps = {
  load: Load;
  size?: 'thumb' | 'md' | 'lg';
  /** Picker mode: regions are buttons. */
  onPick?: (region: Region) => void;
  /** Regions drawn as selected (picker). */
  selected?: Region[];
  labelFor?: (region: Region) => string;
  className?: string;
  /** Accessible summary of the highlighted muscles. */
  title?: string;
  animate?: boolean;
};

const Figure: React.FC<{
  shapes: Shapes; lines: string[]; x: number; head: 'front' | 'back'; gid: string;
  load: Load; selected?: Region[]; onPick?: (r: Region) => void; labelFor?: (r: Region) => string; animate: boolean;
}> = ({ shapes, lines, x, head, gid, load, selected, onPick, labelFor, animate }) => {
  let n = 0;
  const half = (mirror: boolean) => (
    <g transform={mirror ? 'translate(100,0) scale(-1,1)' : undefined}>
      <path d={SILHOUETTE} className="bm-body" />
      {ORDER.map((r) => {
        const paths = shapes[r];
        if (!paths) return null;
        const v = load[r] ?? 0;
        const sel = selected?.includes(r);
        const hit = v > 0 || sel;
        const i = n++;
        const common = {
          className: cn('bm-region', hit && 'bm-hit', animate && hit && 'bm-anim', onPick && 'bm-pick', sel && 'bm-sel'),
          style: { ['--v' as string]: sel ? 1 : 0.3 + 0.7 * v, ['--d' as string]: `${(i % 10) * 40}ms` } as React.CSSProperties,
          fill: hit ? `url(#${gid})` : undefined,
        };
        if (!onPick) return <g key={r} {...common}>{paths.map((d) => <path key={d} d={d} />)}</g>;
        return (
          <g
            key={r}
            {...common}
            role="button"
            tabIndex={mirror ? -1 : 0}
            aria-label={labelFor?.(r) ?? r}
            aria-pressed={!!sel}
            onClick={() => onPick(r)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onPick(r);
              }
            }}
          >
            {paths.map((d) => <path key={d} d={d} />)}
          </g>
        );
      })}
      {lines.map((d) => <path key={d} d={d} className="bm-line" />)}
    </g>
  );
  return (
    <g transform={`translate(${x},0)`}>
      <ellipse cx={50} cy={13} rx={8.5} ry={10.5} className="bm-body" />
      {head === 'back' && <path d="M43,9 C45,4 55,4 57,9 C56,6 44,6 43,9 Z" className="bm-line-fill" />}
      {half(false)}
      {half(true)}
    </g>
  );
};

/**
 * Body map: neutral figure, worked muscles in the brand orange.
 * `load` is 0..1 per region (primary 1, secondary less); `onPick` turns it into a muscle picker.
 */
export const BodyMap: React.FC<BodyMapProps> = ({ load, size = 'md', onPick, selected, labelFor, className, title, animate = true }) => {
  const gid = `bm${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg
      viewBox="10 0 166 210"
      className={cn('bm', `bm--${size}`, className)}
      role={onPick ? 'group' : 'img'}
      aria-label={title}
      aria-hidden={!title && !onPick ? true : undefined}
      style={{ direction: 'ltr' }}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#F59532" />
          <stop offset="100%" stopColor="#D8361E" />
        </linearGradient>
      </defs>
      <Figure shapes={FRONT} lines={FRONT_LINES} x={0} head="front" gid={gid} load={load} selected={selected} onPick={onPick} labelFor={labelFor} animate={animate} />
      <Figure shapes={BACK} lines={BACK_LINES} x={86} head="back" gid={gid} load={load} selected={selected} onPick={onPick} labelFor={labelFor} animate={animate} />
    </svg>
  );
};

export default BodyMap;
