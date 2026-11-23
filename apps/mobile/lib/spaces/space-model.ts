/**
 * Spaces (project flag `chat`): the pure rules of how a space reads on
 * mobile. Ported from web's `packages/ui/src/workspace/spaces/space-identity.ts`,
 * `space-timeline.ts`, `space-people.ts` and `space-mention-source.ts`; the
 * words and the order match web.
 *
 * A space is a channel of the project or the caller's DM with one agent.
 * Every thread of a space is one session (`space_id`). The person's DM with
 * My Kortix is their personal space; a DM with any other agent is never shown.
 */
import { type ProjectSession, type ProjectSpace, type ProjectSpaceMember } from '@kortix/sdk';
import { agentDisplayName, isMyKortixAgentName } from '@kortix/shared';

import { parseUserMessageText } from '@/lib/session/user-message';
import { sessionDisplayTitle } from '@/lib/session/session-list';

/** The project feature flag that turns Spaces on. */
export const SPACES_FLAG = 'chat' as const;

// ── Identity ─────────────────────────────────────────────────────────────

/** The person's own space: their DM with My Kortix. */
export function isPersonalSpace(space: Pick<ProjectSpace, 'kind' | 'dm_agent_name'>): boolean {
  return space.kind === 'dm' && !!space.dm_agent_name && isMyKortixAgentName(space.dm_agent_name);
}

/** Private to the person: every DM, and a channel set to private. */
export function isPrivateSpace(space: Pick<ProjectSpace, 'kind' | 'visibility'>): boolean {
  return space.kind === 'dm' || space.visibility === 'private';
}

/** The first word of a profile name; null when the profile has none. */
export function viewerFirstName(metadata: Readonly<Record<string, unknown>> | null | undefined): string | null {
  for (const key of ['full_name', 'name'] as const) {
    const value = metadata?.[key];
    if (typeof value !== 'string') continue;
    const first = value.trim().split(/\s+/)[0];
    // An email in the name field is not a name.
    if (first && !first.includes('@')) return first;
  }
  return null;
}

/** An agent's display name, as web's space view says it. */
export function agentLabel(name: string): string {
  return agentDisplayName(name);
}

/**
 * The space's name as people read it. `personal` names the personal space
 * ("Ada's space", or "Your space"); the caller passes it from its catalog.
 */
export function spaceDisplayName(space: Pick<ProjectSpace, 'kind' | 'dm_agent_name' | 'name' | 'slug'>, personal: string): string {
  if (isPersonalSpace(space)) return personal;
  if (space.kind === 'dm') return agentLabel(space.dm_agent_name ?? space.name);
  return space.name || space.slug || '';
}

/** The avatar tile's text: the initials of the first two words, or the first two letters of one word. */
export function spaceInitials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '#';
  if (words.length === 1) {
    const [first = '', second = ''] = Array.from(words[0]!);
    return first.toUpperCase() + second.toLowerCase();
  }
  return (Array.from(words[0]!)[0]! + Array.from(words[1]!)[0]!).toUpperCase();
}

/** One line, a mention by email read as its name part: a preview never shows an address. */
export function oneLineWithoutEmails(text: string): string {
  return text
    .replace(/@([\w.+-]+)@[\w-]+(\.[\w-]+)+/g, '@$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The Spaces list, in order: the personal space first, then every live
 * channel the person sees, in the server's order. DMs with other agents are
 * left out (agents are members of spaces, not spaces).
 */
export function orderSpaces(spaces: readonly ProjectSpace[]): { personal: ProjectSpace | null; others: ProjectSpace[] } {
  const live = spaces.filter((space) => !space.archived_at);
  const personal = live.find(isPersonalSpace) ?? null;
  return { personal, others: live.filter((space) => space.kind === 'channel') };
}

/**
 * Whether the viewer may edit the channel (rename, describe, agents, archive).
 * The server sends `can_edit`; an older API that omits it reads as editable,
 * as on web. A DM is never editable.
 */
export function canEditSpace(space: Pick<ProjectSpace, 'kind' | 'can_edit'>): boolean {
  return space.kind === 'channel' && space.can_edit !== false;
}

/** Whether the viewer may edit the stored tabs: always in a DM, in a channel only with `can_edit === true` (web's rule). */
export function canEditSpaceTabs(space: Pick<ProjectSpace, 'kind' | 'can_edit'>): boolean {
  return space.kind === 'dm' || space.can_edit === true;
}

/** A display name as one `@` token, as the server reads it: `Ana Lima` → `ana-lima`. */
export function mentionSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._@+-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The channel's agents a new thread runs on: its agent list, else the
 * project's default. Empty for a DM (its agent is bound).
 */
export function channelRunnableAgents(space: Pick<ProjectSpace, 'agents' | 'kind'> | null | undefined, projectDefault: string | null | undefined): string[] {
  if (space?.kind !== 'channel') return [];
  const agents = space.agents ?? [];
  return agents.length > 0 ? [...agents] : projectDefault ? [projectDefault] : [];
}

/** A display name for a channel created from "Message <person>": web's `spaces.profile.dmSpaceName`. */
function shortNames(member: Pick<ProjectSpaceMember, 'name'>): string[] {
  const first = member.name.trim().split(/\s+/)[0] ?? '';
  return [...new Set([first, member.name.trim()].filter(Boolean))];
}

/**
 * The other person of a two-person private space that "Message" made, or
 * null. Such a space keeps its generated name ("Ana and Bo", either order);
 * a space named anything else keeps its own name.
 */
export function otherPersonOf(
  space: Pick<ProjectSpace, 'kind' | 'visibility' | 'name'>,
  members: readonly ProjectSpaceMember[] | undefined,
  viewerId: string | undefined,
  generatedName: (a: string, b: string) => string,
): ProjectSpaceMember | null {
  if (space.kind !== 'channel' || space.visibility !== 'private' || !members || members.length !== 2 || !viewerId) return null;
  const me = members.find((member) => member.user_id === viewerId);
  const other = members.find((member) => member.user_id !== viewerId);
  if (!me || !other) return null;
  const name = space.name.trim().toLowerCase();
  for (const a of shortNames(me)) {
    for (const b of shortNames(other)) {
      if (generatedName(a, b).toLowerCase() === name || generatedName(b, a).toLowerCase() === name) return other;
    }
  }
  return null;
}

// ── Mentions in text ─────────────────────────────────────────────────────

/** One name a message may `@`-mention, and every token that names it. */
export interface MentionName {
  label: string;
  tokens: readonly string[];
}

/**
 * `text` with each `@token` that names a person or an agent replaced by
 * `@<display name>`. Case-insensitive, at the start or after whitespace,
 * trailing punctuation kept. Unknown tokens stay.
 */
export function withMentionNames(text: string, names: readonly MentionName[]): string {
  if (!text.includes('@') || names.length === 0) return text;
  const byToken = new Map<string, string>();
  for (const name of names) for (const token of name.tokens) if (token) byToken.set(token.toLowerCase(), name.label);
  return text.replace(/(^|\s)@([^\s]+)/g, (whole, lead: string, raw: string) => {
    const word = raw.replace(/[.,;:!?)\]}'"]+$/, '');
    const label = byToken.get(word.toLowerCase());
    return label ? `${lead}@${label}${raw.slice(word.length)}` : whole;
  });
}

// ── Threads ──────────────────────────────────────────────────────────────

/** Chat: the message a thread Kortix started opens with, or null for a person's thread. */
export function kortixRootText(session: ProjectSession): string | null {
  const value = session.metadata?.chat_root_text;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** A space post: the agent that wrote the thread's top message, when it is not the thread's agent. */
export function rootPostAuthor(session: ProjectSession): string | null {
  const value = session.metadata?.chat_root_author;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** The thread's top message: its first prompt as the person wrote it, else its title. */
export function threadMessageText(session: ProjectSession): string {
  const kortixText = kortixRootText(session);
  if (kortixText) return kortixText;
  const text = parseUserMessageText(session.first_prompt ?? '').text.trim();
  return text || sessionDisplayTitle(session);
}

/**
 * The server stores a thread's first prompt cut at this length
 * (`FIRST_PROMPT_MAX_CHARS` in `apps/api/src/projects/lib/project-spaces.ts`).
 */
export const SERVER_FIRST_PROMPT_MAX_CHARS = 500;

/** The server cut the first prompt: "Show more" opens the thread, whose transcript holds the whole message. */
export function firstPromptTruncated(session: ProjectSession): boolean {
  return (session.first_prompt?.length ?? 0) >= SERVER_FIRST_PROMPT_MAX_CHARS;
}

/** The agent is on it: a turn runs, the first prompt waits for delivery, or the computer starts. */
export function threadIsWorking(session: ProjectSession): boolean {
  if (session.working?.state === 'working' || session.working?.pending_delivery) return true;
  return session.status === 'queued' || session.status === 'branching' || session.status === 'provisioning';
}

/**
 * The sidebar's one-line preview: the newest thread's latest reply, else its
 * first message. Null for a space with no thread.
 */
export function spacePreview(sessions: readonly ProjectSession[], names: (text: string) => string = (text) => text): string | null {
  let newest: ProjectSession | null = null;
  for (const session of sessions) {
    if (!newest || Date.parse(session.updated_at) > Date.parse(newest.updated_at)) newest = session;
  }
  if (!newest) return null;
  const reply = newest.result_excerpt?.trim();
  const text = reply || threadMessageText(newest);
  const line = oneLineWithoutEmails(names(text));
  return line || null;
}

// ── Timeline ─────────────────────────────────────────────────────────────

function localDay(time: number): Date {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Which label a day divider takes. */
export function dayKind(date: Date, now: Date): 'today' | 'yesterday' | 'earlier' {
  const today = localDay(now.getTime()).getTime();
  const day = localDay(date.getTime()).getTime();
  if (day === today) return 'today';
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  return day === yesterday.getTime() ? 'yesterday' : 'earlier';
}

/** One row of the Chat tab: a day divider or a thread. */
export type TimelineItem = { kind: 'day'; key: string; date: Date } | { kind: 'thread'; key: string; session: ProjectSession };

/**
 * A space's threads as the Chat tab draws them, NEWEST FIRST for an inverted
 * list: each day's threads newest first, then that day's divider (an inverted
 * list draws the divider above them). The server lists by last activity, so
 * the order is set here, by creation time.
 */
export function spaceTimelineItems(sessions: readonly ProjectSession[]): TimelineItem[] {
  const sorted = [...sessions].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const items: TimelineItem[] = [];
  let current: Date | null = null;
  for (const session of sorted) {
    const date = localDay(Date.parse(session.created_at));
    if (current && current.getTime() !== date.getTime()) items.push({ kind: 'day', key: `day:${current.getTime()}`, date: current });
    current = date;
    items.push({ kind: 'thread', key: session.session_id, session });
  }
  if (current) items.push({ kind: 'day', key: `day:${current.getTime()}`, date: current });
  return items;
}

/** What the line under a thread shows, in web's priority order (`ThreadReplyLine`). */
export type ReplyLineState =
  | { kind: 'none' }
  | { kind: 'needs-you'; header: string | null }
  | { kind: 'starting' }
  | { kind: 'working'; sinceMs: number }
  | { kind: 'child'; agent: string }
  | { kind: 'reply'; text: string }
  | { kind: 'count' };

/**
 * The reply line's state. Asks that wait on the viewer win; then a running
 * turn ("Starting…" while the computer comes up, else "Working · 0:42");
 * then a hidden worker that still runs; then the newest reply
 * (`result_excerpt`); then the reply count alone. A thread Kortix started
 * shows no reply text until it has a reply. Nothing to say: no line.
 */
export function replyLineState(
  session: ProjectSession,
  needsYou: { waiting: boolean; header?: string | null },
  names: (text: string) => string = (text) => text,
): ReplyLineState {
  const working = threadIsWorking(session);
  const replies = session.reply_count ?? 0;
  const showReply = kortixRootText(session) === null;
  const reply = showReply || replies > 0 ? oneLineWithoutEmails(names(session.result_excerpt ?? '')) || null : null;
  if (needsYou.waiting) return { kind: 'needs-you', header: needsYou.header ?? null };
  if (working) {
    const booting =
      session.status === 'provisioning' || session.status === 'queued' || session.status === 'branching' || session.status === 'stopped';
    if (booting) return { kind: 'starting' };
    const since = Date.parse(session.working?.since ?? session.updated_at);
    return { kind: 'working', sinceMs: Number.isFinite(since) ? since : Date.now() };
  }
  if (session.active_child_agent) return { kind: 'child', agent: session.active_child_agent };
  if (reply) return { kind: 'reply', text: reply };
  return replies > 0 ? { kind: 'count' } : { kind: 'none' };
}

/** "0:42", "12:05", "1:02:09": time since a turn started. */
export function elapsedLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Who a thread row names as its author. */
export type ThreadAuthor =
  | { kind: 'trigger'; name: string; type: string | null }
  | { kind: 'agent'; name: string }
  | { kind: 'person'; name: string; avatarUrl: string | null; userId: string | null };

/** The row's author: a trigger run, a Kortix post, a service account, or the person who wrote it (never an email). */
export function threadAuthor(session: ProjectSession, fallbackPerson: string): ThreadAuthor {
  const metadata = (session.metadata ?? {}) as Record<string, unknown>;
  const triggerName = typeof metadata.trigger_name === 'string' ? metadata.trigger_name : null;
  if (triggerName) return { kind: 'trigger', name: triggerName, type: typeof metadata.trigger_type === 'string' ? metadata.trigger_type : null };
  if (kortixRootText(session)) return { kind: 'agent', name: rootPostAuthor(session) ?? session.agent_name ?? 'kortix' };
  if (session.owner_type && session.owner_type !== 'user') return { kind: 'agent', name: session.agent_name ?? 'kortix' };
  const name = session.owner_name?.trim() || session.owner_email?.split('@')[0] || fallbackPerson;
  return { kind: 'person', name, avatarUrl: session.owner_avatar_url ?? null, userId: session.created_by ?? null };
}
