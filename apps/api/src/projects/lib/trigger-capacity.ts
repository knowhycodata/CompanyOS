import { z } from 'zod';
const capacityUsage = z.object({ limited: z.boolean(), observed_at: z.string().datetime(), windows: z.array(z.object({ used_percent: z.number().min(0).max(100), resets_at: z.string().datetime().nullable() })) });

/** Explicit trigger policy only. Re-evaluate the intended model for every fire. */
export function selectTriggerCapacityModel(input: {
  model: string | null; fallbacks?: string[]; snapshots: unknown[]; available: string[]; now: number;
}): { model: string | null; intendedModel?: string; reason?: 'claude-exhausted' } {
  const { model, fallbacks, snapshots, available, now } = input;
  if (!model?.startsWith('claude-agent/') || !fallbacks?.length) return { model };
  if (!snapshots.length) throw new Error('Shared Claude capacity is unknown');
  const states = snapshots.map(snapshot => {
    const parsed = capacityUsage.safeParse(snapshot);
    if (!parsed.success) throw new Error('Shared Claude capacity is invalid');
    const usage = parsed.data;
    const age = now - Date.parse(usage.observed_at);
    if (age < 0 || age > 300_000) throw new Error('Shared Claude capacity is stale');
    if (!usage.limited) return 'available';
    if (!usage.windows.some(window => window.used_percent >= 100 && window.resets_at && Date.parse(window.resets_at) > now)) throw new Error('Shared Claude exhaustion has no future reset');
    return 'exhausted';
  });
  if (states.includes('available')) return { model };
  const fallback = fallbacks.find(candidate => !candidate.startsWith('claude-agent/') && available.includes(candidate));
  if (!fallback) throw new Error('No available trigger capacity fallback');
  return { model: fallback, intendedModel: model, reason: 'claude-exhausted' };
}
