import React from "react";

/** Shared macro palette for the meal menu (rings, totals underlines, progress bars). */
export const MACRO_COLORS = {
  calories: "#4C8DFF",
  protein: "#22C55E",
  carbs: "#F59E0B",
  fat: "#EC4899",
} as const;

export type MacroKey = keyof typeof MACRO_COLORS;

export type MacroRing = { key: MacroKey; percent: number };

/** Outer -> inner. Leaves a ~18px hole in the middle at viewBox 200. */
const RING_RADII = [87, 67.25, 47.5, 27.75];
const RING_WIDTH = 18;

type MacroRingsProps = {
  rings: MacroRing[];
  size?: number;
  className?: string;
  label?: string;
};

const MacroRings: React.FC<MacroRingsProps> = ({ rings, size = 176, className, label }) => (
  <svg
    viewBox="0 0 200 200"
    width={size}
    height={size}
    className={className}
    role="img"
    aria-label={label}
  >
    <g transform="rotate(-90 100 100)">
      {rings.slice(0, RING_RADII.length).map((ring, index) => {
        const radius = RING_RADII[index];
        const circumference = 2 * Math.PI * radius;
        const fraction = Math.max(0, Math.min(100, ring.percent)) / 100;
        const color = MACRO_COLORS[ring.key];

        return (
          <React.Fragment key={ring.key}>
            <circle
              cx={100}
              cy={100}
              r={radius}
              fill="none"
              stroke={color}
              strokeOpacity={0.2}
              strokeWidth={RING_WIDTH}
            />
            {fraction > 0 && (
              <circle
                cx={100}
                cy={100}
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth={RING_WIDTH}
                strokeLinecap="round"
                strokeDasharray={`${circumference * fraction} ${circumference}`}
                style={{ transition: "stroke-dasharray 600ms cubic-bezier(0.4, 0, 0.2, 1)" }}
              />
            )}
          </React.Fragment>
        );
      })}
    </g>
  </svg>
);

export default MacroRings;
