import React from "react";

export type MacroRingDatum = {
  /** 0-100, already clamped by the caller */
  percent: number;
  colorClassName: string; // Tailwind stroke-* class
};

type MacroRingChartProps = {
  /** Outer-to-inner ring order: calories, protein, carbs, fat */
  calories: MacroRingDatum;
  protein: MacroRingDatum;
  carbs: MacroRingDatum;
  fat: MacroRingDatum;
  size?: number;
};

const STROKE_WIDTH = 10;
const GAP = 4;

/**
 * Four concentric progress rings (calories outer -> fat inner), each independently
 * showing consumed/target as a percentage. Matches the nested-donut reference design.
 */
export default function MacroRingChart({
  calories,
  protein,
  carbs,
  fat,
  size = 160,
}: MacroRingChartProps) {
  const center = size / 2;
  const rings = [calories, protein, carbs, fat];
  const outerRadius = center - STROKE_WIDTH / 2 - 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="-rotate-90"
      role="img"
      aria-label="Daily macro progress"
    >
      {rings.map((ring, i) => {
        const radius = outerRadius - i * (STROKE_WIDTH + GAP);
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (ring.percent / 100) * circumference;

        return (
          <g key={i}>
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              strokeWidth={STROKE_WIDTH}
              className="stroke-muted/30"
            />
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className={`${ring.colorClassName} transition-all duration-500 ease-out`}
            />
          </g>
        );
      })}
    </svg>
  );
}
