import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet } from './ui';
import './qa2I18n';

/**
 * QA #55: what each body measurement is and how to take it, with a drawing of where the tape goes.
 * Sites follow the usual WHO / ISAK protocols (waist midway between the lowest rib and the iliac crest, hips at the
 * widest point of the buttocks, thigh just below the gluteal fold, relaxed arm midway between shoulder and elbow).
 */
export type MeasureKey = 'waist' | 'chest' | 'hips' | 'right_thigh' | 'left_thigh' | 'right_arm' | 'left_arm' | 'thighs';

/** Tape position on the 200 × 420 front-view figure: centre, half-width, tilt, and the side for limbs. */
const TAPE: Record<MeasureKey, { cx: number; cy: number; rx: number; side?: 'r' | 'l' }> = {
  chest: { cx: 100, cy: 128, rx: 47 },
  waist: { cx: 100, cy: 182, rx: 37 },
  hips: { cx: 100, cy: 222, rx: 46 },
  thighs: { cx: 76, cy: 262, rx: 23, side: 'r' },
  // the figure faces the viewer: the person's right side is on the viewer's left
  right_thigh: { cx: 76, cy: 262, rx: 23, side: 'r' },
  left_thigh: { cx: 124, cy: 262, rx: 23, side: 'l' },
  right_arm: { cx: 39, cy: 150, rx: 11, side: 'r' },
  left_arm: { cx: 161, cy: 150, rx: 11, side: 'l' },
};

/** Clean front-view figure; the measured band is drawn in the brand orange with a dashed back half. */
export const MeasureFigure: React.FC<{ k: MeasureKey; className?: string }> = ({ k, className }) => {
  const tape = TAPE[k];
  const ry = Math.max(4, tape.rx * 0.22);
  return (
    <svg viewBox="0 0 200 420" className={cn('h-auto w-full', className)} role="img" aria-hidden>
      <defs>
        <linearGradient id="mg-body" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="hsl(var(--foreground) / .16)" />
          <stop offset="1" stopColor="hsl(var(--foreground) / .08)" />
        </linearGradient>
      </defs>
      <g fill="url(#mg-body)" stroke="hsl(var(--foreground) / .28)" strokeWidth="1.4" strokeLinejoin="round">
        {/* head + neck */}
        <ellipse cx="100" cy="42" rx="22" ry="26" />
        <path d="M90 64 h20 v14 h-20 z" />
        {/* torso: shoulders, chest, waist taper, hips */}
        <path d="M58 86 C72 78 128 78 142 86 C150 92 150 112 146 132 C143 152 136 168 137 184 C138 198 146 210 147 226 C148 238 140 246 100 248 C60 246 52 238 53 226 C54 210 62 198 63 184 C64 168 57 152 54 132 C50 112 50 92 58 86 Z" />
        {/* arms */}
        <path d="M56 90 C44 96 38 116 37 140 C36 166 34 196 32 222 C31 232 39 234 42 224 C46 198 50 170 54 146 C56 132 60 116 62 104 Z" />
        <path d="M144 90 C156 96 162 116 163 140 C164 166 166 196 168 222 C169 232 161 234 158 224 C154 198 150 170 146 146 C144 132 140 116 138 104 Z" />
        {/* legs */}
        <path d="M56 236 C54 268 58 300 62 332 C65 356 64 380 66 404 C67 412 84 412 85 404 C86 380 88 352 90 330 C93 300 97 270 99 246 Z" />
        <path d="M144 236 C146 268 142 300 138 332 C135 356 136 380 134 404 C133 412 116 412 115 404 C114 380 112 352 110 330 C107 300 103 270 101 246 Z" />
      </g>
      {/* landmarks for waist / arm: lowest rib, iliac crest, shoulder, elbow */}
      {k === 'waist' && (
        <g stroke="hsl(var(--foreground) / .35)" strokeWidth="1" strokeDasharray="2 3">
          <line x1="58" x2="142" y1="166" y2="166" />
          <line x1="58" x2="142" y1="200" y2="200" />
        </g>
      )}
      {(k === 'right_arm' || k === 'left_arm') && (
        <g fill="hsl(var(--foreground) / .45)">
          <circle cx={k === 'right_arm' ? 52 : 148} cy="94" r="2.6" />
          <circle cx={k === 'right_arm' ? 35 : 165} cy="198" r="2.6" />
        </g>
      )}
      {/* tape: dashed back half, solid front half, small tag */}
      <g className="mg-tape">
        <path d={`M ${tape.cx - tape.rx} ${tape.cy} A ${tape.rx} ${ry} 0 0 1 ${tape.cx + tape.rx} ${tape.cy}`} fill="none" stroke="#E8652A" strokeWidth="3" strokeDasharray="4 4" opacity=".55" />
        <path d={`M ${tape.cx - tape.rx} ${tape.cy} A ${tape.rx} ${ry} 0 0 0 ${tape.cx + tape.rx} ${tape.cy}`} fill="none" stroke="#F59532" strokeWidth="4" strokeLinecap="round" />
        <rect x={tape.cx + tape.rx - 3} y={tape.cy - 3} width="14" height="9" rx="2" fill="#E8652A" />
      </g>
    </svg>
  );
};

/** Info button opening the guide for one measurement. */
export const MeasureInfo: React.FC<{ k: MeasureKey; className?: string }> = ({ k, className }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const key = k === 'thighs' ? 'right_thigh' : k;
  const steps = t(`trainee.measureGuide.${key}.steps`, { returnObjects: true }) as unknown;
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
        className={cn('inline-grid h-7 w-7 flex-none place-items-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary', className)}
        aria-label={t('trainee.measureGuide.open', { name: t(`trainee.progress.m_${k}`) })}
        data-testid="measure-info"
      >
        <Info className="h-4 w-4" />
      </button>
      <Sheet open={open} onOpenChange={setOpen} title={t(`trainee.progress.m_${k}`)} description={t(`trainee.measureGuide.${key}.what`)}>
        <div className="grid gap-4 pb-2 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-start">
          <div className="mx-auto w-40 rounded-2xl bg-foreground/[.04] p-3 sm:w-full">
            <MeasureFigure k={k} />
          </div>
          <div className="space-y-3">
            <p className="tp-label">{t('trainee.measureGuide.how')}</p>
            <ol className="space-y-2">
              {(Array.isArray(steps) ? steps : []).map((s: string, i: number) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed">
                  <span className="tp-num grid h-6 w-6 flex-none place-items-center rounded-full bg-primary/15 text-xs text-primary">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
            <p className="rounded-2xl bg-primary/[.08] px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">{t('trainee.measureGuide.tips')}</p>
          </div>
        </div>
      </Sheet>
    </>
  );
};

export default MeasureInfo;
