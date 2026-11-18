'use client';

import { cn } from '@kortix/ui';
import { useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';

/**
 * Loopmaxxing's own palette: the four colors of the hula hoop it is named
 * after, sampled from the real hoop (founder call 2026-11-18). This page is a
 * deliberate exception to the one-accent rule of the Kortix brand kit, and
 * these values exist on this page only. Components read them as CSS
 * variables (`--hoop-red`, …) that `hoopVars` sets on the page wrapper.
 */
const HOOP = {
  red: '#DA2A2E', // audit:allow Loopmaxxing hoop palette, founder call 2026-11-18
  blue: '#2452D6', // audit:allow Loopmaxxing hoop palette, founder call 2026-11-18
  green: '#4DBA45', // audit:allow Loopmaxxing hoop palette, founder call 2026-11-18
  yellow: '#F5C61E', // audit:allow Loopmaxxing hoop palette, founder call 2026-11-18
} as const;

export type HoopColor = keyof typeof HOOP;

/** The colors in the order the page hands them out: section after section, card after card. */
export const HOOP_ORDER: readonly HoopColor[] = ['red', 'blue', 'green', 'yellow'];

/** The palette as CSS variables, for the page wrapper's `style`. */
export const hoopVars = Object.fromEntries(Object.entries(HOOP).map(([name, value]) => [`--hoop-${name}`, value])) as CSSProperties;

/** `var(--hoop-red)` for a color, or the color for an index, cycling through the palette. */
export function hoop(color: HoopColor | number): string {
  const name = typeof color === 'number' ? HOOP_ORDER[((color % HOOP_ORDER.length) + HOOP_ORDER.length) % HOOP_ORDER.length]! : color;
  return `var(--hoop-${name})`;
}

/**
 * The hoop's segments as the toy has them: long and short pieces, never one
 * color twice in a row. Lengths are percent of the ring.
 */
const SEGMENTS: ReadonlyArray<{ color: HoopColor; length: number }> = [
  { color: 'yellow', length: 7 },
  { color: 'green', length: 16 },
  { color: 'blue', length: 15 },
  { color: 'red', length: 12 },
  { color: 'green', length: 9 },
  { color: 'red', length: 14 },
  { color: 'blue', length: 17 },
  { color: 'red', length: 10 },
];

/** Where each segment starts on the ring, in percent: the sum of the lengths before it. */
const STARTS = SEGMENTS.map((_, index) => SEGMENTS.slice(0, index).reduce((sum, segment) => sum + segment.length, 0));

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** True when the reader asked for less motion. The server renders the moving hoop; the browser stops it. */
export function useStill(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia(REDUCED_MOTION).matches, () => false);
}

/** The shape a hoop's segments run along: an ellipse, or a rounded box around a button. */
type Shape = { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number } | { kind: 'rect'; x: number; y: number; width: number; height: number; rx: number };

function ShapePath({ shape, ...rest }: { shape: Shape } & React.SVGProps<SVGEllipseElement & SVGRectElement>) {
  if (shape.kind === 'ellipse') return <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} {...rest} />;
  return <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx} {...rest} />;
}

/** The segments along one shape. Each segment's dash travels the shape once per `seconds`, so the hoop spins. */
function Segments({ shape, width, seconds, still, shine = true }: { shape: Shape; width: number; seconds: number; still: boolean; shine?: boolean }) {
  return (
    <>
      {SEGMENTS.map((segment, index) => {
        const offset = -STARTS[index]!;
        return (
          <ShapePath
            key={index}
            shape={shape}
            fill="none"
            pathLength={100}
            stroke={hoop(segment.color)}
            strokeWidth={width}
            strokeDasharray={`${segment.length} ${100 - segment.length}`}
            strokeDashoffset={offset}
          >
            {still ? null : (
              <animate attributeName="stroke-dashoffset" from={offset} to={offset - 100} dur={`${seconds}s`} repeatCount="indefinite" />
            )}
          </ShapePath>
        );
      })}
      {/* The tube's shine: a thin light line along the top of the tube. */}
      {shine && shape.kind === 'ellipse' ? (
        <ellipse cx={shape.cx} cy={shape.cy - width * 0.18} rx={shape.rx} ry={shape.ry} fill="none" stroke="white" strokeOpacity={0.28} strokeWidth={width * 0.22} />
      ) : null}
    </>
  );
}

/** One ring of segments, as an ellipse. */
function Ring({ cx, cy, rx, ry, width, seconds, still }: { cx: number; cy: number; rx: number; ry: number; width: number; seconds: number; still: boolean }) {
  return <Segments shape={{ kind: 'ellipse', cx, cy, rx, ry }} width={width} seconds={seconds} still={still} />;
}

/** The gap between a button and the hoop around it, and the hoop's thickness, in px. */
const OUTLINE_GAP = 4;
const OUTLINE_WIDTH = 2.5;
/** The button's corner radius (`--radius` − 0.2rem ≈ 6.8 px) plus the gap, so the hoop stays concentric. */
const OUTLINE_RADIUS = 6.8 + OUTLINE_GAP;

/**
 * A spinning hoop around the page's one action, the copy button. It measures
 * the button, so it fits any label and width.
 */
export function HoopOutline({ children, className }: { children: ReactNode; className?: string }) {
  const still = useStill();
  const box = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const outer = size ? { width: size.width + 2 * OUTLINE_GAP, height: size.height + 2 * OUTLINE_GAP } : null;
  return (
    <span ref={box} className={cn('relative inline-flex', className)}>
      {children}
      {outer ? (
        <svg
          aria-hidden
          width={outer.width}
          height={outer.height}
          style={{ left: -OUTLINE_GAP, top: -OUTLINE_GAP }}
          className="pointer-events-none absolute overflow-visible"
        >
          <Segments
            shape={{
              kind: 'rect',
              x: OUTLINE_WIDTH / 2,
              y: OUTLINE_WIDTH / 2,
              width: outer.width - OUTLINE_WIDTH,
              height: outer.height - OUTLINE_WIDTH,
              rx: OUTLINE_RADIUS,
            }}
            width={OUTLINE_WIDTH}
            seconds={4}
            still={still}
          />
        </svg>
      ) : null}
    </span>
  );
}

/**
 * The spinning hula hoop around the hero headline. It is drawn twice: the back
 * half behind the text and the front half over it, so the hoop goes around the
 * words instead of lying on them. The caller wraps the words in a relative
 * box and puts `<HoopAround layer="back" />` before them and
 * `<HoopAround layer="front" />` after them.
 */
export function HoopAround({ layer, className }: { layer: 'back' | 'front'; className?: string }) {
  const still = useStill();
  const clip = useId();
  // The hoop tilts like one on a moving hip: a wide, flat ellipse.
  const ring = { cx: 500, cy: 150, rx: 470, ry: 70, width: 16, seconds: 7, still };
  return (
    <svg
      aria-hidden
      viewBox="0 0 1000 300"
      className={cn(
        'pointer-events-none absolute top-[70%] left-1/2 sm:top-[60%] w-[116%] -translate-x-1/2 -translate-y-1/2 overflow-visible',
        layer === 'back' ? 'z-0' : 'z-20',
        className,
      )}
    >
      <g transform="rotate(-5 500 150)">
        {layer === 'front' ? (
          <>
            <defs>
              <clipPath id={clip} clipPathUnits="userSpaceOnUse">
                <rect x={0} y={150} width={1000} height={200} />
              </clipPath>
            </defs>
            <g clipPath={`url(#${clip})`}>
              <Ring {...ring} />
            </g>
          </>
        ) : (
          <Ring {...ring} />
        )}
      </g>
    </svg>
  );
}

/** A small hoop seen from above: a ring of segments, spinning. For the wordmark's O's and section marks. */
export function HoopRing({ className, seconds = 5 }: { className?: string; seconds?: number }) {
  const still = useStill();
  return (
    <svg aria-hidden viewBox="0 0 100 100" className={cn('shrink-0', className)}>
      <Ring cx={50} cy={50} rx={38} ry={38} width={16} seconds={seconds} still={still} />
    </svg>
  );
}

/** A straight piece of hoop: the segments side by side. A section's mark and the top edge of a band. */
export function HoopStripe({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('flex overflow-hidden', className)}>
      {SEGMENTS.map((segment, index) => (
        <span key={index} style={{ flexGrow: segment.length, background: hoop(segment.color) }} />
      ))}
    </div>
  );
}

/** LOOPMAXXING with its two O's as hoops. Screen readers read the word. */
export function LoopmaxxingWordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center', className)}>
      <span className="sr-only">Loopmaxxing</span>
      <span aria-hidden className="inline-flex items-center">
        L
        <HoopRing className="mx-px size-3.5" seconds={4} />
        <HoopRing className="mx-px size-3.5" seconds={6} />
        PMAXXING
      </span>
    </span>
  );
}
