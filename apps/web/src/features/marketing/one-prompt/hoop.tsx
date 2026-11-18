'use client';

import { cn } from '@kortix/ui';
import type { CSSProperties } from 'react';

import { AsciiHoop } from './ascii-hoop';
import { HOOP_PALETTE, SEGMENTS } from './hoop-palette';

/**
 * The hula hoop, Loopmaxxing's motif: its four colors used sparingly on a
 * black and white page. A hairline, a dot, a thin ring; never a fill and
 * never on the words. The colors live in `hoop-palette.ts`; components read
 * them as CSS variables (`--hoop-0` … `--hoop-3`) that `hoopVars` sets on the
 * page wrapper.
 */
export const hoopVars = Object.fromEntries(HOOP_PALETTE.map((color, index) => [`--hoop-${index}`, color])) as CSSProperties;

/** The color for an index, cycling red, blue, green, yellow. */
export function hoop(index: number): string {
  return `var(--hoop-${((index % HOOP_PALETTE.length) + HOOP_PALETTE.length) % HOOP_PALETTE.length})`;
}

/** An O of the wordmark: the hoop facing the reader, its tube as thick as a letter's stroke, filling its box. */
const LETTER_O = { tilt: Math.PI / 2 - 0.3, sway: 0.12, tube: 0.42, fill: 1 } as const;

/** The word's letter-spacing: the header's small caps run wide, the big word runs tight. The O's take the same. */
const TRACKING = { wide: '0.05em', tight: '-0.025em' } as const;

/**
 * One O: a box exactly one letter of the monospace font, 1ch wide (its
 * advance) and 1cap tall (its cap height), sitting on the baseline where an O
 * would. The letters after it land where plain text puts them, at any size.
 */
function HoopO({ phase, direction }: { phase: number; direction: 1 | -1 }) {
  return (
    // Letter-spacing follows every character but never an inline box, so the box carries it as a right margin.
    <span className="relative inline-block h-[1cap] w-[1ch] align-baseline" style={{ marginRight: 'var(--wordmark-tracking)' }}>
      <AsciiHoop {...LETTER_O} phase={phase} direction={direction} />
    </span>
  );
}

/**
 * LOOPMAXXING with its two O's as ASCII spinning hoops (`AsciiHoop`), turning
 * opposite ways with their colors offset, so the pair plays off each other.
 * Below 40 px a hoop draws as a pixel ring. Screen readers read the word.
 */
export function LoopmaxxingWordmark({ className, tracking = 'tight' }: { className?: string; tracking?: keyof typeof TRACKING }) {
  return (
    <span
      className={cn('inline-block whitespace-nowrap', className)}
      style={{ '--wordmark-tracking': TRACKING[tracking], letterSpacing: 'var(--wordmark-tracking)' } as CSSProperties}
    >
      <span className="sr-only">Loopmaxxing</span>
      <span aria-hidden>
        L<HoopO phase={0} direction={1} />
        <HoopO phase={0.5} direction={-1} />
        PMAXXING
      </span>
    </span>
  );
}

/** A straight piece of hoop, a hairline: the segments side by side. A band's top edge. */
export function HoopLine({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('flex h-px', className)}>
      {SEGMENTS.map((segment, index) => (
        <span key={index} style={{ flexGrow: segment.length, background: hoop(segment.color) }} />
      ))}
    </div>
  );
}

/** A section's mark: four dots, one per hoop color. */
export function HoopDots({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('inline-flex items-center gap-1.5', className)}>
      {HOOP_PALETTE.map((_, index) => (
        <span key={index} className="size-1.5 rounded-full" style={{ background: hoop(index) }} />
      ))}
    </span>
  );
}
