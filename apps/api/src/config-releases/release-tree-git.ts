/**
 * Git for `release-tree.ts`, which runs in the tree threads (`tree-jobs.ts`).
 *
 * A tree thread loads only `release-tree.ts`, this module and small pure
 * helpers: never `config.ts` or `projects/`, whose imports start the API. So
 * whoever starts it passes what it needs (`configureReleaseTreeGit`):
 * - `env`: the variables every git child process starts from;
 * - `objects`: downloads into a project's partial store. Only the API process
 *   holds the project's credentials, so in a tree thread each call is a
 *   request to it;
 * - `scratchDir`: the folder scratch repositories are made in. A tree thread
 *   gets its own, which the API process removes when it stops the thread.
 */

import { execFile } from 'node:child_process';

export interface ReleaseTreeObjects {
  /**
   * Make `oids` present in the project store at `repo`, and return the bytes
   * received. A no-op for a repository that is not a project's partial store.
   * Over `maxBytes`: `ObjectFetchTooLargeError`, nothing kept. With
   * `overLimitKey`, a fetch of that key once over `maxBytes` is not tried again.
   */
  ensureObjects(repo: string, oids: readonly string[], options?: { maxBytes?: number; overLimitKey?: string }): Promise<number>;
  /** Make every tree of `revs` present. */
  ensureCommitTrees(repo: string, revs: readonly string[]): Promise<void>;
  /** Download the objects a failed git command in `repo` named in `stderr`. True when any arrived: the command is run again. */
  faultIn(repo: string, stderr: string): Promise<boolean>;
}

export interface ReleaseTreeGitConfig {
  env: Record<string, string | undefined>;
  objects: ReleaseTreeObjects;
  scratchDir: string;
}

let configured: ReleaseTreeGitConfig | null = null;

export function configureReleaseTreeGit(next: ReleaseTreeGitConfig): void {
  configured = next;
}

function current(): ReleaseTreeGitConfig {
  if (!configured) throw new Error('release-tree git is not configured');
  return configured;
}

export function treeObjects(): ReleaseTreeObjects {
  return current().objects;
}

export function scratchDir(): string {
  return current().scratchDir;
}

/** The environment of a git child: no prompt, and no lazy fetch (`projects/git/object-store.ts`). */
export function gitEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(current().env)) if (value !== undefined) env[name] = value;
  return { ...env, GIT_TERMINAL_PROMPT: '0', ...extra, GIT_NO_LAZY_FETCH: '1' };
}

/** What one git call returns at most on stdout or stderr, as `runGitCapture` in `projects/git/mirror.ts`. */
const MAX_GIT_OUTPUT_BYTES = 10 * 1024 * 1024;
const GIT_TIMEOUT_MS = 30_000;
/** Times one command is run again after a download of the objects it named. */
const MAX_FAULT_ROUNDS = 2;
/** The stderr a fault-in request carries at most. */
const MAX_FAULT_STDERR_CHARS = 64 * 1024;

export interface GitResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * `git <args>` in `cwd`. Never throws on a non-zero exit. A command that
 * failed on objects a partial store lacks runs again once they are
 * downloaded, as `runGitCapture` does in the API process.
 */
export async function runGit(args: string[], cwd: string, env?: Record<string, string>): Promise<GitResult> {
  for (let round = 0; ; round += 1) {
    const result = await execGit(args, cwd, env);
    if (result.exitCode === 0 || round >= MAX_FAULT_ROUNDS) return result;
    if (!(await treeObjects().faultIn(cwd, result.stderr.slice(0, MAX_FAULT_STDERR_CHARS)))) return result;
  }
}

function execGit(args: string[], cwd: string, env?: Record<string, string>): Promise<GitResult> {
  return new Promise((resolveResult) => {
    execFile(
      'git',
      args,
      { cwd, env: gitEnv(env), maxBuffer: MAX_GIT_OUTPUT_BYTES, timeout: GIT_TIMEOUT_MS, encoding: 'utf8' },
      (error, stdout, stderr) => {
        const code = (error as { code?: unknown } | null)?.code;
        resolveResult({
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? ''),
          exitCode: error ? (typeof code === 'number' ? code : 1) : 0,
        });
      },
    );
  });
}
