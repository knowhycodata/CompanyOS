import { describe, expect, test } from 'bun:test';
import type { ProjectSession, ProjectSpace } from '@kortix/sdk';

import {
  canEditSpace,
  canEditSpaceTabs,
  channelRunnableAgents,
  elapsedLabel,
  orderSpaces,
  spaceTimelineItems,
  withMentionNames,
} from './space-model';

const space = (over: Partial<ProjectSpace>): ProjectSpace => ({ space_id: 's', kind: 'channel', name: 'n', ...over }) as ProjectSpace;
const session = (id: string, created: string): ProjectSession => ({ session_id: id, created_at: created, updated_at: created }) as ProjectSession;

describe('space permissions', () => {
  test('a channel is editable unless the server says can_edit false; a DM never', () => {
    expect(canEditSpace(space({}))).toBe(true);
    expect(canEditSpace(space({ can_edit: false }))).toBe(false);
    expect(canEditSpace(space({ kind: 'dm' }))).toBe(false);
  });
  test('tabs: a DM always, a channel only with can_edit true', () => {
    expect(canEditSpaceTabs(space({ kind: 'dm' }))).toBe(true);
    expect(canEditSpaceTabs(space({}))).toBe(false);
    expect(canEditSpaceTabs(space({ can_edit: true }))).toBe(true);
  });
});

describe('orderSpaces', () => {
  test('the personal DM apart, channels after, archived and other DMs hidden', () => {
    const personal = space({ space_id: 'me', kind: 'dm', dm_agent_name: 'mykortix' });
    const other = space({ space_id: 'dm2', kind: 'dm', dm_agent_name: 'writer' });
    const live = space({ space_id: 'c1' });
    const archived = space({ space_id: 'c2', archived_at: '2026-01-01T00:00:00Z' });
    const out = orderSpaces([live, other, personal, archived]);
    expect(out.personal?.space_id).toBe('me');
    expect(out.others.map((row) => row.space_id)).toEqual(['c1']);
  });
});

test('channelRunnableAgents: its agents, else the project default, none for a DM', () => {
  expect(channelRunnableAgents(space({ agents: ['a', 'b'] }), 'd')).toEqual(['a', 'b']);
  expect(channelRunnableAgents(space({ agents: [] }), 'd')).toEqual(['d']);
  expect(channelRunnableAgents(space({ kind: 'dm' }), 'd')).toEqual([]);
});

test('spaceTimelineItems: newest first, a day divider after each day', () => {
  const items = spaceTimelineItems([
    session('old', '2026-11-20T10:00:00'),
    session('new', '2026-11-21T12:00:00'),
    session('mid', '2026-11-21T09:00:00'),
  ]);
  expect(items.map((item) => (item.kind === 'thread' ? item.key : 'day'))).toEqual(['new', 'mid', 'day', 'old', 'day']);
});

test('withMentionNames replaces known tokens only, keeping punctuation', () => {
  const names = [{ label: 'Ana Lima', tokens: ['ana-lima', 'Ana'] }];
  expect(withMentionNames('hi @ana-lima, and @bob.', names)).toBe('hi @Ana Lima, and @bob.');
  expect(withMentionNames('mail a@ana-lima', names)).toBe('mail a@ana-lima');
});

test('elapsedLabel', () => {
  expect(elapsedLabel(42_000)).toBe('0:42');
  expect(elapsedLabel(725_000)).toBe('12:05');
  expect(elapsedLabel(3_729_000)).toBe('1:02:09');
  expect(elapsedLabel(-5)).toBe('0:00');
});
