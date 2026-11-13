import React from 'react';
import {
  Apple,
  Carrot,
  Droplet,
  Dumbbell,
  Leaf,
  Milk,
  Wheat,
  WheatOff,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';
import type { MacroType, PropertyTag } from './foodbankModel';

/* Small custom line icons drawn in the lucide style (24 grid, 2px round strokes)
   so they sit next to lucide icons without looking foreign. */

type SvgProps = React.SVGProps<SVGSVGElement> & { size?: number };

const Svg = ({ size = 24, children, ...rest }: SvgProps & { children: React.ReactNode }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...rest}
  >
    {children}
  </svg>
);

/** Protein: a drumstick with a bone end. */
export const ProteinIcon = (props: SvgProps) => (
  <Svg {...props}>
    <path d="M14.6 3.2a6 6 0 0 1 6.2 6.2c-.2 3.4-3.3 6-6.8 6.1l-2.6 2.6" />
    <path d="M14.6 3.2C11.2 3.4 8.6 6.4 8.5 10l-2.6 2.6" />
    <path d="M11.4 18.1a2 2 0 1 1-2.8 2.8 2 2 0 1 1-2.8-2.8l.3-.3a2 2 0 1 1 2.8-2.8l3.3-3.3" />
    <path d="M14.5 7.5c.9 0 1.9.6 2.2 1.6" />
  </Svg>
);

/** Carbs: a grain stalk. */
export const CarbIcon = (props: SvgProps) => (
  <Svg {...props}>
    <path d="M12 22V9" />
    <path d="M12 9c0-2.2 1.2-4.3 3-5.5.6 2.4-.4 4.6-3 5.5z" />
    <path d="M12 9c0-2.2-1.2-4.3-3-5.5-.6 2.4.4 4.6 3 5.5z" />
    <path d="M12 14c.5-2.2 2.2-3.8 4.5-4.2-.1 2.4-1.9 4.1-4.5 4.2z" />
    <path d="M12 14c-.5-2.2-2.2-3.8-4.5-4.2.1 2.4 1.9 4.1 4.5 4.2z" />
    <path d="M12 19c.5-2.2 2.2-3.8 4.5-4.2-.1 2.4-1.9 4.1-4.5 4.2z" />
    <path d="M12 19c-.5-2.2-2.2-3.8-4.5-4.2.1 2.4 1.9 4.1 4.5 4.2z" />
  </Svg>
);

/** Fat: an olive drop with a highlight. */
export const FatIcon = (props: SvgProps) => (
  <Svg {...props}>
    <path d="M12 2.8c3.2 3.7 6 7.4 6 11a6 6 0 0 1-12 0c0-3.6 2.8-7.3 6-11z" />
    <path d="M9.2 14.6a2.9 2.9 0 0 0 2.6 2.6" />
  </Svg>
);

/** Kosher: a generic certification seal (circle + K). */
export const KosherIcon = (props: SvgProps) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 7.5v9" />
    <path d="M14.5 7.5 9.6 12.2l5.1 4.3" />
  </Svg>
);

/** Vegan: a leaf inside a V. */
export const VeganIcon = (props: SvgProps) => (
  <Svg {...props}>
    <path d="M3 5l6.5 15L13 12" />
    <path d="M13 12c0-4.4 3.2-7.6 8-8-.2 4.8-3.4 8-8 8z" />
    <path d="M13 12l4-4" />
  </Svg>
);

/** High fiber: three stacked strands. */
export const FiberIcon = (props: SvgProps) => (
  <Svg {...props}>
    <path d="M4 7c2.7-2 5.3 2 8 0s5.3 2 8 0" />
    <path d="M4 12c2.7-2 5.3 2 8 0s5.3 2 8 0" />
    <path d="M4 17c2.7-2 5.3 2 8 0s5.3 2 8 0" />
  </Svg>
);

/** Food bank mark used in the header and empty state: plate + fork. */
export const PlateIcon = (props: SvgProps) => (
  <Svg {...props}>
    <circle cx="13" cy="12" r="8" />
    <circle cx="13" cy="12" r="4.5" />
    <path d="M3 3v5a1.5 1.5 0 0 0 3 0V3" />
    <path d="M4.5 9.5V21" />
  </Svg>
);

type AnyIcon = LucideIcon | ((props: SvgProps) => JSX.Element);

export const MACRO_ICON: Record<MacroType, AnyIcon> = {
  protein: ProteinIcon,
  carb: CarbIcon,
  fat: FatIcon,
};

export const PROPERTY_ICON: Record<PropertyTag, AnyIcon> = {
  high_protein: Dumbbell,
  carb_source: Wheat,
  fat_source: Droplet,
  high_fiber: FiberIcon,
  vegetable: Carrot,
  fruit: Apple,
  dairy: Milk,
  vegan: VeganIcon,
  vegetarian: Leaf,
  gluten_free: WheatOff,
  kosher: KosherIcon,
};

export const IconOf = ({ icon: Icon, ...rest }: { icon: AnyIcon } & LucideProps) => {
  const Comp = Icon as React.ComponentType<LucideProps>;
  return <Comp {...rest} />;
};
