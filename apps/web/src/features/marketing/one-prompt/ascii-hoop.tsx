'use client';

import { cn } from '@kortix/ui';
import { useEffect, useRef } from 'react';

import { HOOP_PALETTE, hoopColorAt } from './hoop-palette';

/**
 * The hula hoop as the classic ASCII spinning donut (donut.c): a torus tilted
 * like a hoop and spinning on its own axis. Every cell takes the color of the
 * hoop segment it belongs to, so the segments travel round as it spins. Light
 * picks the glyph from a ramp; the color is never dimmed, because a dimmed hoop
 * color turns muddy. Below PIXEL_BELOW px the glyphs are unreadable, so each
 * cell is a filled square: the same hoop as a pixel ring, like the grain.
 *
 * One ticker drives every hoop on the page. A hoop draws only while it is on
 * screen; a hidden tab gets no frames. Reduced motion draws one still frame.
 */

/** From least to most light. */
const RAMP = '.,-~:;=!*#$@';
const RING = 2;
/** How far the hoop sits from the eye. */
const DISTANCE = 5;
/** The canvas height under which cells are pixels, not glyphs. */
const PIXEL_BELOW = 40;
/** Rows come from the box's height, never a fixed character size: about 6.5 px a glyph row, about 1.5 px a pixel row. */
const GLYPH_ROW_PX = 6.5;
const PIXEL_ROW_PX = 1.5;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
/** Radians per second: the spin round its axis, and the sway's pace. */
const SPIN_SPEED = 0.9;
const SWAY_SPEED = 1.3;
const FRAME_MS = 1000 / 30;
/** Light from the top left, toward the hoop. */
const LIGHT = normalize([-1, 1.4, -1]);

function normalize([x, y, z]: number[]): [number, number, number] {
  const length = Math.hypot(x!, y!, z!);
  return [x! / length, y! / length, z! / length];
}

const still = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The page's one ticker: 30 frames a second to every hoop on screen, nothing while none is. */
const drawers = new Set<(seconds: number) => void>();
let frame = 0;
let last = 0;
function tick(now: number) {
  frame = requestAnimationFrame(tick);
  if (now - last < FRAME_MS) return;
  last = now;
  for (const draw of drawers) draw(now / 1000);
}
function subscribe(draw: (seconds: number) => void) {
  drawers.add(draw);
  if (drawers.size === 1) frame = requestAnimationFrame(tick);
  return () => {
    drawers.delete(draw);
    if (drawers.size === 0) cancelAnimationFrame(frame);
  };
}

export interface AsciiHoopProps {
  className?: string;
  /** Radians from lying flat toward the reader: small is a hoop seen from above, near π/2 an O facing you. */
  tilt?: number;
  /** How far the tilt sways either way, in radians. */
  sway?: number;
  /** The tube's radius against the ring's 2: thin reads as a hoop, thick as a letter's stroke. */
  tube?: number;
  /** Where the segments start, as a share of the ring: two hoops side by side differ. */
  phase?: number;
  /** 1 spins one way, -1 the other. */
  direction?: 1 | -1;
  /** The share of the box the ring may fill on each axis. */
  fill?: number;
}

/**
 * The hoop's projected half-width and half-height at unit scale, over every
 * lean and roll its sway reaches: the scale that fits these fits every frame.
 */
function bounds(tilt: number, sway: number, tube: number): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const leanAt of [-1, -0.5, 0, 0.5, 1]) {
    for (const rollAt of [-1, 0, 1]) {
      const lean = tilt + sway * leanAt;
      const roll = sway * 0.6 * rollAt;
      for (let ring = 0; ring < Math.PI * 2; ring += Math.PI / 48) {
        for (let around = 0; around < Math.PI * 2; around += Math.PI / 6) {
          const reach = RING + tube * Math.cos(around);
          let px = reach * Math.cos(ring);
          let py = tube * Math.sin(around);
          let pz = reach * Math.sin(ring);
          [py, pz] = [py * Math.cos(lean) - pz * Math.sin(lean), py * Math.sin(lean) + pz * Math.cos(lean)];
          [px, py] = [px * Math.cos(roll) - py * Math.sin(roll), px * Math.sin(roll) + py * Math.cos(roll)];
          const near = 1 / (pz + DISTANCE);
          x = Math.max(x, Math.abs(px * near));
          y = Math.max(y, Math.abs(py * near));
        }
      }
    }
  }
  return { x, y };
}

export function AsciiHoop({ className, tilt = 0.42, sway = 0.1, tube = 0.22, phase = 0, direction = 1, fill = 0.84 }: AsciiHoopProps) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const node = canvas.current;
    const context = node?.getContext('2d');
    if (!node || !context) return;
    let width = 0;
    let height = 0;
    let columns = 0;
    let rows = 0;
    let cellWidth = 0;
    let cellHeight = 0;
    let left = 0;
    let pixel = false;
    const extent = bounds(tilt, sway, tube);
    // The grid comes from the box: rows from its height, columns from cells half as wide as tall (square for pixels).
    // The box is the canvas's parent: the canvas sits absolutely inside it, so its pixel size never touches layout.
    const holder = node.parentElement ?? node;
    const size = () => {
      const box = holder.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      width = box.width;
      height = box.height;
      pixel = height < PIXEL_BELOW;
      rows = pixel ? clamp(Math.round(height / PIXEL_ROW_PX), 6, 16) : clamp(Math.round(height / GLYPH_ROW_PX), 8, 64);
      cellHeight = height / rows;
      cellWidth = pixel ? cellHeight : cellHeight / 2;
      columns = Math.max(4, Math.floor(width / cellWidth));
      left = (width - columns * cellWidth) / 2;
      node.width = Math.round(width * ratio);
      node.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.font = `bold ${(cellHeight * 1.05).toFixed(2)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
    };

    const draw = (seconds: number) => {
      if (!width || !height) return;
      const count = columns * rows;
      const glyph = new Int8Array(count).fill(-1);
      const color = new Int8Array(count);
      const depth = new Float32Array(count);
      const spin = direction * seconds * SPIN_SPEED;
      const lean = tilt + sway * Math.sin(seconds * SWAY_SPEED);
      const roll = sway * 0.6 * Math.sin(seconds * SWAY_SPEED * 0.7);
      const [sinLean, cosLean, sinRoll, cosRoll] = [Math.sin(lean), Math.cos(lean), Math.sin(roll), Math.cos(roll)];
      // Each axis has its own scale, from the measured bounds: the ring fills `fill` of the box both ways, so
      // as a letter its edges meet the cap top and the baseline, as an O's do.
      const scaleX = (fill * columns) / 2 / extent.x;
      const scaleY = (fill * rows) / 2 / extent.y;
      // Fewer points for a small grid: enough to fill every cell, no more.
      const ringStep = Math.max(0.02, (Math.PI * 2) / (Math.max(columns, rows) * 4));
      const tubeStep = pixel ? 0.4 : 0.07;
      for (let ring = 0; ring < Math.PI * 2; ring += ringStep) {
        const turned = ring + spin;
        const [sinTurn, cosTurn] = [Math.sin(turned), Math.cos(turned)];
        const segment = hoopColorAt(ring / (Math.PI * 2) + phase);
        for (let around = 0; around < Math.PI * 2; around += tubeStep) {
          const [sinTube, cosTube] = [Math.sin(around), Math.cos(around)];
          // A point on the hoop and its normal, the hoop lying flat (its axis is y).
          const reach = RING + tube * cosTube;
          let x = reach * cosTurn;
          let y = tube * sinTube;
          let z = reach * sinTurn;
          let nx = cosTube * cosTurn;
          let ny = sinTube;
          let nz = cosTube * sinTurn;
          // Lean toward the reader (round x), then roll (round z): the hoop on a hip.
          [y, z] = [y * cosLean - z * sinLean, y * sinLean + z * cosLean];
          [ny, nz] = [ny * cosLean - nz * sinLean, ny * sinLean + nz * cosLean];
          [x, y] = [x * cosRoll - y * sinRoll, x * sinRoll + y * cosRoll];
          [nx, ny] = [nx * cosRoll - ny * sinRoll, nx * sinRoll + ny * cosRoll];
          const near = 1 / (z + DISTANCE);
          const column = Math.round(columns / 2 + scaleX * near * x - 0.5);
          const row = Math.round(rows / 2 - scaleY * near * y - 0.5);
          if (column < 0 || column >= columns || row < 0 || row >= rows) continue;
          const at = row * columns + column;
          if (near <= depth[at]!) continue;
          depth[at] = near;
          const light = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
          glyph[at] = Math.max(0, Math.min(RAMP.length - 1, Math.floor(((light + 1) / 2) * RAMP.length)));
          color[at] = segment;
        }
      }
      context.clearRect(0, 0, width, height);
      for (let at = 0; at < count; at += 1) {
        if (glyph[at]! < 0) continue;
        context.fillStyle = HOOP_PALETTE[color[at]!]!;
        const x = left + (at % columns) * cellWidth;
        const y = Math.floor(at / columns) * cellHeight;
        if (pixel) context.fillRect(x, y, cellWidth, cellHeight);
        else context.fillText(RAMP[glyph[at]!]!, x + cellWidth / 2, y + cellHeight / 2);
      }
    };

    size();
    draw(0);
    const resize = new ResizeObserver(() => {
      size();
      draw(performance.now() / 1000);
    });
    resize.observe(holder);
    if (still()) return () => resize.disconnect();
    let unsubscribe: (() => void) | null = null;
    // Frames only while the hoop is on screen.
    const seen = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) unsubscribe ??= subscribe(draw);
      else {
        unsubscribe?.();
        unsubscribe = null;
      }
    });
    seen.observe(node);
    return () => {
      unsubscribe?.();
      seen.disconnect();
      resize.disconnect();
    };
  }, [tilt, sway, tube, phase, direction, fill]);
  // Absolute and 100% of its box: the drawing-buffer size (width/height attributes) never sizes the layout.
  return <canvas ref={canvas} aria-hidden className={cn('absolute inset-0 block size-full', className)} />;
}
