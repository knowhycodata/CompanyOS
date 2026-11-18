/**
 * Published releases: the config is ready before any box asks for it.
 *
 * When a base ref moves, the API builds the `project` release of the new tip
 * once, writes its descriptor next to the archive in the config archive store,
 * and records both in `config_release_heads`. It then republishes the boot
 * bundle (`agent:<name>`) of every agent with a row in
 * `config_release_agent_heads` at that ref. Session create reads the session
 * agent's row (a missing one starts its publish) and puts signed URLs in the
 * box env (`KORTIX_CONFIG_RELEASE`). A booting box then downloads its config
 * from the store and asks the API nothing.
 *
 * Triggers. Each one is a no-op when the row already names the tip:
 *   - `notifyBaseBranchMoved`: a push through the git proxy, an API write, a
 *     change-request merge, a manifest write, a repository replacement.
 *   - the descriptor route, after it resolved the tip for a box: a push made
 *     directly on the upstream reaches the API only there.
 *   - session create, when the row names a commit other than the tip it read.
 *
 * The row can be one commit behind while a publish runs. A session created
 * then boots on the previous release, and convergence moves it to the new one.
 * Anything the row cannot answer exactly as the descriptor route would (an
 * agent the release does not declare, a quarantined release, a store a box
 * cannot reach) gives no env value, and the box asks the route as before.
 */

import { configReleaseAgentHeads, configReleaseHeads } from '@kortix/db';
import { and, eq, lt, sql } from 'drizzle-orm';
import { config } from '../config';
import { logger } from '../lib/logger';
import type { GitBackedProject } from '../projects/surface';
import { db } from '../shared/db';
import { bumpBounded } from '../shared/ttl-memo';
import { loadAgentRosterAtCommit } from './agent-roster';
import { buildConfigRelease, CONFIG_RELEASE_FORMAT_V3, configReleaseId, toDescriptor, type ConfigRelease, type ConfigReleaseVariant } from './builder';
import { dbConfigReleaseLedger, PROJECT_QUARANTINE_SESSIONS, type ConfigReleaseLedger } from './quarantine';
import { publicDownloadTarget } from './serve-archive';
import { releaseVariantFor, resolveSessionReleaseAgent, type DeclaredAgentRoster } from './session-agent';
import {
  CONFIG_ARCHIVE_URL_TTL_SECONDS,
  configArchiveKey,
  configReleaseDescriptorKey,
  getConfigArchiveStore,
  type ConfigArchiveStore,
} from './store';
import { projectsView } from '../workspaces/rows';

/**
 * A row older than this is published again, and session create gives no env
 * value from it. The bucket lifecycle expires objects at 30 days.
 */
export const REPUBLISH_AFTER_MS = 20 * 24 * 60 * 60 * 1000;

const HEX40 = /^[0-9a-f]{40}$/;

export type HeadRow = typeof configReleaseHeads.$inferSelect;

export interface PublishDeps {
  build: (project: GitBackedProject, commit: string, variant: ConfigReleaseVariant) => Promise<ConfigRelease>;
  roster: (project: GitBackedProject, commit: string) => Promise<DeclaredAgentRoster>;
  resolveTip: (project: GitBackedProject, ref: string) => Promise<string>;
  store: () => ConfigArchiveStore;
  ledger: Pick<ConfigReleaseLedger, 'recordAssigned' | 'quarantined'>;
  now: () => Date;
  /**
   * Start a background publish (`schedulePublish`). `staleReleaseId`: the head release a session refused.
   * `agent`: publish that agent's head (`config_release_agent_heads`), not the project head.
   */
  schedule: (projectId: string, ref: string, commit: string | null, staleReleaseId?: string, agent?: string) => void;
}

const defaultDeps: PublishDeps = {
  build: (project, commit, variant) => buildConfigRelease(project, commit, variant),
  roster: loadAgentRosterAtCommit,
  // Loaded on first use: projects/surface reaches session code that imports the sandbox
  // proxy root, which reaches back here through session-open (an import cycle).
  resolveTip: async (project, ref) => (await import('../projects/surface')).resolveCommitSha(project, ref),
  store: getConfigArchiveStore,
  ledger: dbConfigReleaseLedger,
  now: () => new Date(),
  schedule: (projectId, ref, commit, staleReleaseId, agent) => schedulePublish(projectId, ref, commit, staleReleaseId, agent),
};

export async function readReleaseHead(projectId: string, ref: string): Promise<HeadRow | null> {
  const [row] = await db
    .select()
    .from(configReleaseHeads)
    .where(and(eq(configReleaseHeads.projectId, projectId), eq(configReleaseHeads.ref, ref)))
    .limit(1);
  return row ?? null;
}

/** The published release of one agent's boot bundle at `ref`, or null. */
export async function readAgentReleaseHead(projectId: string, ref: string, agent: string): Promise<HeadRow | null> {
  const [row] = await db
    .select()
    .from(configReleaseAgentHeads)
    .where(and(eq(configReleaseAgentHeads.projectId, projectId), eq(configReleaseAgentHeads.ref, ref), eq(configReleaseAgentHeads.agent, agent)))
    .limit(1);
  return row ?? null;
}

/** Every agent with a published head at `ref`: the ones a base move republishes. */
export async function listPublishedAgents(projectId: string, ref: string): Promise<string[]> {
  const rows = await db
    .select({ agent: configReleaseAgentHeads.agent })
    .from(configReleaseAgentHeads)
    .where(and(eq(configReleaseAgentHeads.projectId, projectId), eq(configReleaseAgentHeads.ref, ref)));
  return rows.map((row) => row.agent);
}

function fresh(head: HeadRow, now: Date): boolean {
  return now.getTime() - head.publishedAt.getTime() < REPUBLISH_AFTER_MS;
}

/**
 * Publish the release of `ref`'s tip (`commit`, or resolved here): the
 * `project` release, or with `opts.agent` that agent's boot bundle
 * (`agent:<name>`). An agent the tip does not declare is not published.
 * Returns what happened. Throws only on a git, store or database error.
 */
export async function publishConfigRelease(
  project: GitBackedProject,
  ref: string,
  commit: string | null,
  deps: PublishDeps = defaultDeps,
  opts: {
    /** The head release a session refused as not this API's compile: rebuild even at the same tip. */
    staleReleaseId?: string;
    /** Publish this agent's boot bundle instead of the project release. */
    agent?: string;
  } = {},
): Promise<'published' | 'current' | 'unpublishable'> {
  const resolvedAt = deps.now();
  const tip = commit ?? (await deps.resolveTip(project, ref));
  const agent = opts.agent;
  const head = agent ? await readAgentReleaseHead(project.projectId, ref, agent) : await readReleaseHead(project.projectId, ref);
  const refused = !!opts.staleReleaseId && head?.releaseId === opts.staleReleaseId;
  if (head && head.sourceCommit === tip && fresh(head, resolvedAt) && !refused) return 'current';

  const roster = await deps.roster(project, tip);
  // An agent the tip does not declare has no bundle: the route re-points such a session.
  if (agent && !roster.enabled.includes(agent)) return 'unpublishable';
  const variant: ConfigReleaseVariant = agent ? `agent:${agent}` : 'project';
  // `toDescriptor` with repository access, exactly as the route answers a box.
  const descriptor = toDescriptor(await deps.build(project, tip, variant), { repositoryAccess: true, format: CONFIG_RELEASE_FORMAT_V3 });
  // No release, no archive (a tree over the archive cap), or no files: the box asks the route.
  if (!descriptor.release_id || !descriptor.archive || !descriptor.files || !descriptor.config_tree_id) {
    logger.info('[config-releases] tip not published', { projectId: project.projectId, ref, agent, commit: tip, reason: descriptor.reason });
    return 'unpublishable';
  }
  const descriptorKey = configReleaseDescriptorKey(project.projectId, tip, resolvedAt);
  await deps.store().putIfAbsent(descriptorKey, Buffer.from(JSON.stringify(descriptor)), 'application/json');
  // The ledger row a box's proof updates (`recordProof`); the route writes it when it assigns.
  await deps.ledger.recordAssigned({
    projectId: project.projectId,
    releaseId: descriptor.release_id,
    variant,
    sourceCommit: tip,
  });
  const row = {
    projectId: project.projectId,
    ref,
    releaseId: descriptor.release_id,
    sourceCommit: tip,
    configTreeId: descriptor.config_tree_id,
    descriptorKey,
    roster: {
      enabled: [...roster.enabled],
      defaultAgent: roster.defaultAgent,
      readable: roster.readable,
      governed: roster.governed,
      ...(roster.onlyDeclared ? { onlyDeclared: true } : {}),
    },
    resolvedAt,
    publishedAt: resolvedAt,
  };
  // A slower publish of an older tip never replaces a newer one.
  if (agent) {
    await db
      .insert(configReleaseAgentHeads)
      .values({ ...row, agent })
      .onConflictDoUpdate({
        target: [configReleaseAgentHeads.projectId, configReleaseAgentHeads.ref, configReleaseAgentHeads.agent],
        set: { ...row, agent },
        setWhere: lt(configReleaseAgentHeads.resolvedAt, sql`excluded.resolved_at`),
      });
  } else {
    await db
      .insert(configReleaseHeads)
      .values(row)
      .onConflictDoUpdate({
        target: [configReleaseHeads.projectId, configReleaseHeads.ref],
        set: { ...row },
        setWhere: lt(configReleaseHeads.resolvedAt, sql`excluded.resolved_at`),
      });
  }
  logger.info('[config-releases] published', { projectId: project.projectId, ref, agent, commit: tip, releaseId: descriptor.release_id });
  return 'published';
}

// replica-local: one publish per (project, ref, agent) at a time in this process; a trigger during it runs one more.
const running = new Map<string, { again: string | null | undefined; stale?: string }>();

/**
 * Publish in the background. Never throws, never waits. A trigger that arrives
 * while a publish of the same head runs makes it run once more afterwards.
 *
 * Without `agent` it publishes the project head, then every agent head the
 * ref has: a base move reaches each agent a session has used.
 */
export function schedulePublish(projectId: string, ref: string, commit: string | null = null, staleReleaseId?: string, agent?: string): void {
  // Every trigger of a release moves the saved config summary too (/detail
  // reads it). Imported lazily: this module loads without the projects surface.
  if (!agent) {
    void import('../projects/surface')
      .then(({ scheduleConfigSummary }) => scheduleConfigSummary(projectId, ref, commit))
      .catch(() => {});
  }
  const key = `${projectId}\0${ref}\0${agent ?? ''}`;
  const busy = running.get(key);
  if (busy) {
    busy.again = commit;
    if (staleReleaseId) busy.stale = staleReleaseId;
    return;
  }
  const state: { again: string | null | undefined; stale?: string } = { again: undefined, stale: staleReleaseId };
  running.set(key, state);
  void (async () => {
    let next: string | null | undefined = commit;
    while (next !== undefined) {
      state.again = undefined;
      const stale = state.stale;
      state.stale = undefined;
      try {
        const project = await loadPublishProject(projectId);
        if (project) {
          await publishConfigRelease(project, ref, next, defaultDeps, { ...(stale ? { staleReleaseId: stale } : {}), ...(agent ? { agent } : {}) });
          if (!agent) for (const used of await listPublishedAgents(projectId, ref)) schedulePublish(projectId, ref, next, undefined, used);
        }
      } catch (error) {
        // Drizzle wraps the driver error: its `cause` holds what Postgres said.
        const cause = (error as { cause?: Error }).cause?.message;
        logger.warn('[config-releases] publish failed', { projectId, ref, agent, error: (error as Error).message.split('\n')[0], cause });
      }
      next = state.again;
    }
    running.delete(key);
  })();
}

async function loadPublishProject(projectId: string): Promise<GitBackedProject | null> {
  const [row] = await db
    .select({
      projectId: projectsView.projectId,
      repoUrl: projectsView.repoUrl,
      defaultBranch: projectsView.defaultBranch,
      manifestPath: projectsView.manifestPath,
      status: projectsView.status,
    })
    .from(projectsView)
    .where(eq(projectsView.projectId, projectId))
    .limit(1);
  if (!row || row.status === 'archived' || !row.repoUrl) return null;
  return {
    projectId: row.projectId,
    repoUrl: row.repoUrl,
    defaultBranch: row.defaultBranch,
    manifestPath: row.manifestPath ?? 'kortix.yaml',
    gitAuthToken: null,
  };
}

// replica-local: the tip this process last saw published per (project, ref), so a hot route reads no row.
const seenTips = new Map<string, string>();

/**
 * The descriptor route resolved `tip` for a box. Publish it unless this
 * process already saw that tip published. A push made directly on the
 * upstream reaches the API only through such a read.
 */
export function notePublishedTip(projectId: string, ref: string, tip: string): void {
  const key = `${projectId}\0${ref}`;
  if (seenTips.get(key) === tip) return;
  bumpBounded(seenTips, key, tip, 10_000);
  schedulePublish(projectId, ref, tip);
}

/** What the box reads from `KORTIX_CONFIG_RELEASE` (base64 of this JSON). */
export interface PublishedReleaseEnv {
  release_id: string;
  source_commit: string;
  descriptor_url: string;
  archive_url: string;
  expires_at: string;
}

/**
 * The `KORTIX_CONFIG_RELEASE` value for a session with repository access: its
 * agent's published boot bundle (`config_release_agent_heads`), or the project
 * head for a session that runs no declared agent; null when the box must ask
 * the descriptor route. A missing or older agent head starts its publish. `tip` is the
 * base tip session create resolved, when it has one: a row on another commit
 * still serves, and a publish of the tip starts.
 */
export async function configReleaseEnvForSession(
  input: {
    projectId: string;
    ref: string;
    agentName: string | null;
    tip: string | null;
    /**
     * The etag of the agent config this API compiled for the session (`agentConfigEtag`).
     * A head whose release this compile would not produce is refused: another API
     * version built it (a compile change since), or it is another commit.
     */
    expectedGovernanceEtag?: Promise<string | null>;
  },
  deps: Pick<PublishDeps, 'store' | 'ledger' | 'now' | 'schedule'> = defaultDeps,
): Promise<string | null> {
  const head = await readReleaseHead(input.projectId, input.ref);
  const tip = input.tip && HEX40.test(input.tip) ? input.tip : null;
  if (!head || (tip && head.sourceCommit !== tip)) deps.schedule(input.projectId, input.ref, tip);
  if (!head) return null;
  const now = deps.now();
  if (!fresh(head, now)) {
    deps.schedule(input.projectId, input.ref, tip);
    return null;
  }
  // The route re-points a session whose agent the release does not declare. Only the route does.
  const decision = resolveSessionReleaseAgent(input.agentName, head.roster);
  if (decision.kind !== 'declared') return null;
  // A declared agent boots its own bundle (`releaseVariantFor`), from its own head.
  const variant = releaseVariantFor(decision.agent, true, head.roster.enabled);
  const agent = variant.startsWith('agent:') ? variant.slice('agent:'.length) : null;
  const served = agent ? await readAgentReleaseHead(input.projectId, input.ref, agent) : head;
  if (agent && (!served || served.sourceCommit !== head.sourceCommit || !fresh(served, now))) {
    deps.schedule(input.projectId, input.ref, tip ?? head.sourceCommit, undefined, agent);
  }
  if (!served || !fresh(served, now)) return null;
  const quarantined = await deps.ledger.quarantined(input.projectId, [served.releaseId], PROJECT_QUARANTINE_SESSIONS);
  if (quarantined.size > 0) return null;
  // The box would run the head's compiled config, not the one this API just
  // compiled into its env. They differ after a deploy that changed the compile
  // (the head was built by the old API) or when the tip moved: republish, and
  // let the box run the provisioned config.
  const expectedEtag = input.expectedGovernanceEtag ? await input.expectedGovernanceEtag.catch(() => null) : null;
  if (expectedEtag && configReleaseId(served.configTreeId, expectedEtag) !== served.releaseId) {
    deps.schedule(input.projectId, input.ref, tip, served.releaseId, agent ?? undefined);
    logger.info('[config-releases] the published release differs from this compile; the box runs the provisioned config', {
      projectId: input.projectId,
      releaseId: served.releaseId,
    });
    return null;
  }

  const store = deps.store();
  const [descriptorSigned, archiveSigned] = await Promise.all([
    store.signedUrl(served.descriptorKey, CONFIG_ARCHIVE_URL_TTL_SECONDS),
    store.signedUrl(configArchiveKey(input.projectId, served.configTreeId), CONFIG_ARCHIVE_URL_TTL_SECONDS),
  ]);
  // A store a cloud box cannot reach (local Supabase): the route streams through the API instead.
  const descriptorUrl = publicDownloadTarget(descriptorSigned, config.KORTIX_CONFIG_ARCHIVE_PUBLIC_URL);
  const archiveUrl = publicDownloadTarget(archiveSigned, config.KORTIX_CONFIG_ARCHIVE_PUBLIC_URL);
  if (!descriptorUrl || !archiveUrl) return null;
  const env: PublishedReleaseEnv = {
    release_id: served.releaseId,
    source_commit: served.sourceCommit,
    descriptor_url: descriptorUrl,
    archive_url: archiveUrl,
    expires_at: new Date(now.getTime() + CONFIG_ARCHIVE_URL_TTL_SECONDS * 1000).toISOString(),
  };
  return Buffer.from(JSON.stringify(env)).toString('base64');
}
