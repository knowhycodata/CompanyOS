/**
 * The messages between the API process and a tree thread (`tree-jobs.ts`,
 * `tree-thread.ts`). Loaded by both sides, so it imports only
 * `release-tree.ts` and types.
 *
 * API process → thread: `init` once, then one `job` at a time, and a
 * `response` to each `request`. Thread → API process: one `result` per job,
 * and a `request` for each download the job needs (`ReleaseTreeObjects`).
 */

import {
  agentReleaseFiles,
  buildConfigArchive,
  ConfigArchiveTooLargeError,
  isComposedSource,
  listConfigFiles,
  readComposedRelease,
  readFileTree,
  resolveReleaseTreeSource,
  type AgentFileListInput,
  type ConfigReleaseFile,
} from './release-tree';
import type { ReleaseTreeObjects } from './release-tree-git';

/** A commit of a project's mirror, as a job names it. */
interface CommitArgs {
  mirror: string;
  manifestPath: string;
  commit: string;
}

// replica-local: the release-tree sources this thread resolved last; a commit's source never changes, so a miss only resolves it again.
const sources = new Map<string, ReturnType<typeof resolveReleaseTreeSource>>();
/** Sources a thread keeps: one source can list every path of a large tree. */
const MAX_SOURCES = 2;

/**
 * The release-tree source of a commit, resolved once per thread for the jobs
 * of one build. Its list of left-out paths can be as long as the tree, so it
 * stays in the thread: no job sends it to the API process or back.
 */
function sourceOf({ mirror, manifestPath, commit }: CommitArgs): ReturnType<typeof resolveReleaseTreeSource> {
  const key = `${mirror}\0${manifestPath}\0${commit}`;
  let source = sources.get(key);
  if (!source) {
    source = resolveReleaseTreeSource(mirror, { manifestPath }, commit);
    source.catch(() => sources.delete(key));
    sources.set(key, source);
    if (sources.size > MAX_SOURCES) sources.delete(sources.keys().next().value!);
  }
  return source;
}

/** The jobs a tree thread runs. Each takes one argument object of plain data. */
export const treeOps = {
  /** The commit's root tree, and whether its release tree is composed (`isComposedSource`). */
  resolveSource: async (args: CommitArgs): Promise<{ rootTree: string; composed: boolean } | { reason: string }> => {
    const resolved = await sourceOf(args);
    return 'source' in resolved ? { rootTree: resolved.source.rootTree, composed: isComposedSource(resolved.source) } : resolved;
  },
  listFiles: (args: { mirror: string; treeId: string }) => listConfigFiles(args.mirror, args.treeId),
  archive: (args: { mirror: string; treeId: string; limit?: number }) => buildConfigArchive(args.mirror, args.treeId, args.limit),
  /** The commit's release tree, composed (`readComposedRelease`). */
  readComposed: async (args: CommitArgs & { archive: boolean; limit?: number }) => {
    const resolved = await sourceOf(args);
    if (!('source' in resolved)) throw new Error(resolved.reason);
    return readComposedRelease(args.mirror, resolved.source, { archive: args.archive, limit: args.limit });
  },
  /** One agent's files at the commit (`agentReleaseFiles`), without the paths the whole-tree release leaves out. */
  agentFiles: async (args: CommitArgs & { input: AgentFileListInput }): Promise<{ files: ConfigReleaseFile[] } | { reason: string }> => {
    const resolved = await sourceOf(args);
    if (!('source' in resolved)) return { reason: resolved.reason };
    const ignored = new Set(resolved.source.exportIgnored);
    const listed = await agentReleaseFiles(args.mirror, resolved.source.rootTree, args.input);
    return { files: listed.filter(([path]) => !ignored.has(path)) };
  },
  fileTree: (args: { mirror: string; files: readonly ConfigReleaseFile[]; archive: boolean; limit?: number }) =>
    readFileTree(args.mirror, args.files, { archive: args.archive, limit: args.limit }),
};

export type TreeOps = typeof treeOps;
export type TreeOp = keyof TreeOps;
export type TreeOpArgs<K extends TreeOp> = Parameters<TreeOps[K]>[0];
export type TreeOpResult<K extends TreeOp> = Awaited<ReturnType<TreeOps[K]>>;
export type TreeRequestMethod = keyof ReleaseTreeObjects;

export interface SerializedError {
  name: string;
  message: string;
  /** The error's own fields with a plain value (`limit`, `receivedBytes`). */
  fields: Record<string, string | number | boolean>;
  /** The request whose error this is, when a job failed on a request's error. */
  requestId?: number;
}

export type ToThread =
  | { type: 'init'; env: Record<string, string | undefined>; scratchDir: string }
  | { type: 'job'; id: number; op: TreeOp; args: unknown }
  | { type: 'response'; id: number; ok: true; value: unknown }
  | { type: 'response'; id: number; ok: false; error: SerializedError };

export type FromThread =
  | { type: 'result'; id: number; ok: true; value: unknown }
  | { type: 'result'; id: number; ok: false; error: SerializedError }
  | { type: 'request'; jobId: number; id: number; method: TreeRequestMethod; args: unknown[] };

/** The own field of an error that names the request it came from. */
const REQUEST_ID = 'treeRequestId';

export function serializeError(error: unknown): SerializedError {
  const failure = error instanceof Error ? error : new Error(String(error));
  const fields: SerializedError['fields'] = {};
  for (const [name, value] of Object.entries(failure)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') fields[name] = value;
  }
  const requestId = fields[REQUEST_ID];
  return { name: failure.name, message: failure.message, fields, ...(typeof requestId === 'number' ? { requestId } : {}) };
}

/**
 * The error a serialized one stands for. `ConfigArchiveTooLargeError` is
 * rebuilt, so `instanceof` holds; any other keeps its name, message and
 * fields (`isObjectFetchTooLarge` reads the name).
 */
export function deserializeError(serialized: SerializedError, requestId?: number): Error {
  const { name, message, fields } = serialized;
  const error =
    name === 'ConfigArchiveTooLargeError'
      ? new ConfigArchiveTooLargeError(Number(fields.limit), typeof fields.actualBytes === 'number' ? fields.actualBytes : undefined)
      : Object.assign(new Error(message), fields);
  error.name = name;
  if (requestId !== undefined) Object.assign(error, { [REQUEST_ID]: requestId });
  return error;
}

/** `bytes` as a Node `Buffer`: a byte array crosses a thread as a plain `Uint8Array`. */
export function asBuffer(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
