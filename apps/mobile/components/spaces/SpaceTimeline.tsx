/**
 * A space's Chat tab, web's `SpaceTimeline`: its threads oldest first, one
 * group per local day under a "Today" / "Yesterday" / "Thursday, October 15"
 * divider, opening at the newest message (an inverted list). Above the
 * oldest loaded thread: "Load earlier" while older pages exist, else the
 * space's welcome ("Welcome to #name", or the personal space's agent). The
 * list polls page one: every 5 s while a thread works, else every 15 s.
 */
import type { ProjectSession, ProjectSpace } from '@kortix/sdk';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, View } from 'react-native';
import { useIsFocused } from 'expo-router';

import { KortixLoader } from '@/components/kortix/kortix-loader';
import { AgentPixelMark } from '@/components/session/tool/shared/agent-pixel-mark';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useProjectSessionsPaged } from '@/lib/projects/hooks';
import type { SessionNeedsYou } from '@/lib/session/needs-you';
import { agentLabel, dayKind, spaceDisplayName, spaceTimelineItems, threadIsWorking, type TimelineItem } from '@/lib/spaces/space-model';

import { usePersonalSpaceName } from './space-hooks';
import { spaceThreadsFilter } from './use-space-send';
import { SpaceThreadRow } from './SpaceThreadRow';

const POLL_WORKING_MS = 5_000;
const POLL_IDLE_MS = 15_000;
const EMPTY_NEEDS_YOU: ReadonlyMap<string, SessionNeedsYou> = new Map();

function DayDivider({ date }: { date: Date }) {
  const { t } = useTranslation();
  const kind = dayKind(date, new Date());
  const label =
    kind === 'today'
      ? t('spaces.today')
      : kind === 'yesterday'
        ? t('spaces.yesterday')
        : date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  return (
    <View className="flex-row items-center gap-3 px-4 py-2" accessibilityRole="header">
      <View className="h-px flex-1 bg-border" />
      <Text variant="small" className="leading-5">
        {label}
      </Text>
      <View className="h-px flex-1 bg-border" />
    </View>
  );
}

function SpaceWelcome({ space, empty }: { space: ProjectSpace; empty: boolean }) {
  const { t } = useTranslation();
  const personal = usePersonalSpaceName();
  if (space.kind === 'dm' && space.dm_agent_name) {
    const agent = agentLabel(space.dm_agent_name);
    return (
      <View className="gap-3 px-4 pb-6 pt-16">
        <AgentPixelMark slug={space.dm_agent_name} size={21} tile={52} radius={12} />
        <View className="gap-1.5">
          <Text variant="h3">{spaceDisplayName(space, personal)}</Text>
          <Text variant="muted">{t('spaces.dmIntro', { agent })}</Text>
        </View>
      </View>
    );
  }
  const name = space.slug ?? space.name;
  return (
    <View className="gap-1.5 px-4 pb-6 pt-16">
      <Text variant="h3">{t('spaces.welcomeTitle', { name })}</Text>
      <Text variant="muted">{space.description || t(empty ? 'spaces.welcomeEmpty' : 'spaces.welcomeStart', { name })}</Text>
    </View>
  );
}

export interface SpaceTimelineProps {
  projectId: string;
  space: ProjectSpace;
  needsYouBySession?: ReadonlyMap<string, SessionNeedsYou>;
  names: (text: string) => string;
  /** Above the oldest message, under the welcome: the channel's setup block, `#general`'s notice. */
  head?: React.ReactNode;
  onOpenThread: (session: ProjectSession) => void;
  onThreadActions?: (session: ProjectSession) => void;
  /** Bottom padding: the composer floats over the list's end. */
  contentInset: number;
}

export function SpaceTimeline({
  projectId,
  space,
  needsYouBySession = EMPTY_NEEDS_YOU,
  names,
  head,
  onOpenThread,
  onThreadActions,
  contentInset,
}: SpaceTimelineProps) {
  const { t } = useTranslation();
  const focused = useIsFocused();
  const threads = useProjectSessionsPaged(projectId, { ...spaceThreadsFilter(space.space_id), poll: false });
  const items = React.useMemo(() => spaceTimelineItems(threads.sessions), [threads.sessions]);
  const anyWorking = React.useMemo(
    () => threads.sessions.some((session) => threadIsWorking(session) || !!session.active_child_agent),
    [threads.sessions],
  );
  // Page one only would be web's poll; the mobile list refetches its loaded pages, a few at most.
  const { refetch } = threads;
  React.useEffect(() => {
    if (!focused) return;
    const id = setInterval(() => void refetch(), anyWorking ? POLL_WORKING_MS : POLL_IDLE_MS);
    return () => clearInterval(id);
  }, [focused, anyWorking, refetch]);

  const renderItem = React.useCallback(
    ({ item }: { item: TimelineItem }) =>
      item.kind === 'day' ? (
        <DayDivider date={item.date} />
      ) : (
        <SpaceThreadRow
          session={item.session}
          space={space}
          needsYou={needsYouBySession.get(item.session.session_id)}
          names={names}
          onOpen={onOpenThread}
          onLongPress={onThreadActions}
        />
      ),
    [space, needsYouBySession, names, onOpenThread, onThreadActions],
  );

  const loading = threads.isPending || (threads.isScanning && items.length === 0);
  const failed = threads.isError && items.length === 0;
  // An inverted list draws its footer at the top: the history's start.
  const top = failed ? (
    <View className="items-center gap-2 px-4 py-10">
      <Text variant="small" className="leading-5">
        {t('spaces.threadsLoadError')}
      </Text>
      <Button variant="secondary" size="sm" className="rounded-full" onPress={() => void refetch()}>
        <Text>{t('spaces.retry')}</Text>
      </Button>
    </View>
  ) : loading ? (
    <View className="items-center py-10">
      <KortixLoader size="small" />
    </View>
  ) : (
    <View>
      {threads.hasNextPage ? (
        <View className="items-center py-3">
          <Button variant="ghost" size="sm" disabled={threads.isFetchingNextPage} onPress={() => void threads.fetchNextPage()}>
            <Text>{threads.isFetchingNextPage ? t('spaces.loading') : t('spaces.loadEarlier')}</Text>
          </Button>
        </View>
      ) : (
        <SpaceWelcome space={space} empty={items.length === 0} />
      )}
      {head}
    </View>
  );

  return (
    <FlatList
      inverted
      data={loading || failed ? [] : items}
      keyExtractor={(item) => item.key}
      renderItem={renderItem}
      ListFooterComponent={top}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      // Inverted: the header is the list's visible bottom, under the newest message.
      ListHeaderComponent={<View style={{ height: contentInset }} />}
      onEndReached={() => {
        if (threads.hasNextPage && !threads.isFetchingNextPage) void threads.fetchNextPage();
      }}
      onEndReachedThreshold={0.4}
    />
  );
}
