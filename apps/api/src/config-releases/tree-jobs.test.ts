/**
 * The tree threads' limits (`tree-jobs.ts`), with a thread that runs jobs
 * built for them (`__tests__/fixtures/test-tree-thread.ts`): a job that never
 * ends, a job that waits on a download, a thread that crashes.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { ConfigArchiveTooLargeError } from './release-tree';
import type { ReleaseTreeObjects } from './release-tree-git';
import { TreeJobBusyError, TreeJobs, TreeJobTimeoutError, type TreeJobsOptions } from './tree-jobs';

const entry = new URL('./__tests__/fixtures/test-tree-thread.ts', import.meta.url);
let jobs: TreeJobs | null = null;

function start(options: Partial<TreeJobsOptions> = {}, objects: Partial<ReleaseTreeObjects> = {}) {
  jobs = new TreeJobs({
    entry,
    env: {},
    objects: { ensureObjects: async () => 0, ensureCommitTrees: async () => undefined, faultIn: async () => false, ...objects },
    ...options,
  });
  const pool = jobs;
  // The test thread runs its own ops, not `treeOps`.
  return (projectId: string, op: string, args: object = {}) =>
    (pool.run as unknown as (projectId: string, op: string, args: object) => Promise<unknown>).call(pool, projectId, op, args);
}

afterEach(async () => {
  await jobs?.close();
  jobs = null;
});

/** Run `fn` and return the longest time, in ms, the event loop could not run a 5 ms timer. */
async function longestStall<T>(fn: () => Promise<T>): Promise<{ result: T; stallMs: number }> {
  let last = performance.now();
  let stallMs = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    stallMs = Math.max(stallMs, now - last);
    last = now;
  }, 5);
  try {
    const result = await fn();
    stallMs = Math.max(stallMs, performance.now() - last);
    return { result, stallMs };
  } finally {
    clearInterval(timer);
  }
}

describe('tree threads', () => {
  test('a job that never ends is stopped at its time, the event loop runs all along, and the same job then fails at once', async () => {
    const run = start({ jobMillis: 300 });
    const { result, stallMs } = await longestStall(() => run('p', 'spin').catch((error: unknown) => error));
    expect(result).toBeInstanceOf(TreeJobTimeoutError);
    expect(stallMs).toBeLessThan(100);

    const again = performance.now();
    await expect(run('p', 'spin')).rejects.toBeInstanceOf(TreeJobTimeoutError);
    expect(performance.now() - again).toBeLessThan(50);
    // Another job of the project runs, in a new thread.
    expect(await run('p', 'sleep', { ms: 1 })).toBe(1);
  });

  test('the time a job waits for a download the API process runs does not count against it; the wall bound does', async () => {
    const slowDownload = { ensureObjects: async () => (await Bun.sleep(400), 42) };
    expect(await start({ jobMillis: 200 }, slowDownload)('p', 'request', { text: 'x' })).toBe(42);
    await jobs!.close();
    await expect(start({ jobMillis: 200, wallMillis: 300 }, slowDownload)('p', 'request', { text: 'y' })).rejects.toBeInstanceOf(
      TreeJobTimeoutError,
    );
  });

  test('one job per project runs at a time; past the waiting bound a job answers busy; another project runs beside it', async () => {
    const run = start({ threads: 2, maxWaitingPerProject: 2 });
    const order: string[] = [];
    const done = (name: string) => () => void order.push(name);
    const a = [run('a', 'sleep', { ms: 200 }).then(done('a1')), run('a', 'sleep', { ms: 1 }).then(done('a2')), run('a', 'sleep', { ms: 2 }).then(done('a3'))];
    await expect(run('a', 'sleep', { ms: 3 })).rejects.toBeInstanceOf(TreeJobBusyError);
    const b = run('b', 'sleep', { ms: 1 }).then(done('b'));
    await Promise.all([...a, b]);
    expect(order).toEqual(['b', 'a1', 'a2', 'a3']);
  });

  test('a free thread goes to the project served least recently, not to the job that came first', async () => {
    const run = start({ threads: 1 });
    const order: string[] = [];
    const done = (name: string) => () => void order.push(name);
    const first = run('a', 'sleep', { ms: 100 }).then(done('a1'));
    const later = run('a', 'sleep', { ms: 1 }).then(done('a2'));
    const other = run('b', 'sleep', { ms: 1 }).then(done('b'));
    await Promise.all([first, later, other]);
    expect(order).toEqual(['a1', 'b', 'a2']);
  });

  test('the timeout memo reads a bounded part of a job: a listing-sized argument costs its check no time', async () => {
    const run = start({ jobMillis: 200 });
    const listing = Array.from({ length: 200_000 }, (_, at) => [`folder/${at}/file.ts`, '100644', at.toString(16).padStart(40, '0')]);
    await expect(run('p', 'spin', { listing })).rejects.toBeInstanceOf(TreeJobTimeoutError);
    // The check runs on every request of a project with a timed-out job.
    const started = performance.now();
    const again = run('p', 'spin', { listing });
    expect(performance.now() - started).toBeLessThan(10);
    await expect(again).rejects.toBeInstanceOf(TreeJobTimeoutError);
  });

  test('a job that waits past the wait bound answers busy', async () => {
    const run = start({ maxWaitMillis: 100 });
    const first = run('a', 'sleep', { ms: 400 });
    await expect(run('a', 'sleep', { ms: 1 })).rejects.toBeInstanceOf(TreeJobBusyError);
    expect(await first).toBe(400);
  });

  test('errors keep their type: a too-large error is rebuilt, and a download error arrives as the very object thrown', async () => {
    class DownloadError extends Error {}
    const thrown = new DownloadError('remote is gone');
    const run = start({}, { ensureObjects: async () => Promise.reject(thrown) });
    const tooLarge = await run('p', 'tooLarge').catch((error: unknown) => error);
    expect(tooLarge).toBeInstanceOf(ConfigArchiveTooLargeError);
    expect(tooLarge).toMatchObject({ limit: 5, actualBytes: 9 });
    expect(await run('p', 'request', { text: 'z' }).catch((error: unknown) => error)).toBe(thrown);
  });

  test('a thread that crashes fails its job and is replaced', async () => {
    const run = start();
    await expect(run('p', 'crash')).rejects.toThrow('tree thread failed');
    expect(await run('p', 'sleep', { ms: 1 })).toBe(1);
  });

  test('archive bytes arrive as a Buffer', async () => {
    const bytes = await start()('p', 'archive');
    expect(Buffer.isBuffer(bytes)).toBe(true);
    expect([...(bytes as Buffer)]).toEqual([1, 2, 3]);
  });
});
