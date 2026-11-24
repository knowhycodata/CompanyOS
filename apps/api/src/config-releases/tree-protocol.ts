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
  agentCommitFiles,
  buildConfigArchive,
  ConfigArchiveTooLargeError,
  listConfigFiles,
  readComposedRelease,
  readFileTree,
  resolveReleaseTreeSource,
  type AgentFileListInput,
  type ConfigReleaseFile,
  type ReleaseTreeSource,
} from './release-tree';
import type { ReleaseTreeObjects } from './release-tree-git';

/** The jobs a tree thread runs. Each takes one argument object of plain data. */
export const treeOps = {
  resolveSource: (args: { mirror: string; manifestPath: string; commit: string }) =>
    resolveReleaseTreeSource(args.mirror, { manifestPath: args.manifestPath }, args.commit),
  listFiles: (args: { mirror: string; treeId: string }) => listConfigFiles(args.mirror, args.treeId),
  archive: (args: { mirror: string; treeId: string; limit?: number }) => buildConfigArchive(args.mirror, args.treeId, args.limit),
  readComposed: (args: { mirror: string; source: ReleaseTreeSource; archive: boolean; limit?: number }) =>
    readComposedRelease(args.mirror, args.source, { archive: args.archive, limit: args.limit }),
  agentFiles: (args: { mirror: string; manifestPath: string; commit: string; input: AgentFileListInput }) =>
    agentCommitFiles(args.mirror, { manifestPath: args.manifestPath }, args.commit, args.input),
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
