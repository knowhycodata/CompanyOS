/**
 * One message of a space's Chat tab, web's `ThreadRow`: every message is a
 * thread (one session). The author's avatar and name, the time, the message
 * (six lines, "Show more" past them), and ONE reply line under it: the agent's
 * mark, then "Needs you", "Starting…", "Working · 0:42", the worker that
 * still runs, or the newest reply; the reply count and the last activity at
 * its end. A tap anywhere opens the thread; a long press opens the session
 * actions sheet.
 */
import type { ProjectSession, ProjectSpace } from '@kortix/sdk';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { TextShimmer } from '@/components/kortix/text-shimmer';
import { ParticipantAvatar } from '@/components/session/ParticipantAvatar';
import { SessionStatusMark } from '@/components/session/SessionStatusMark';
import { AgentPixelMark } from '@/components/session/tool/shared/agent-pixel-mark';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { haptics } from '@/lib/haptics';
import { AlarmIcon, LightningIcon, WebhooksLogoIcon } from '@/lib/icons';
import type { SessionNeedsYou } from '@/lib/session/needs-you';
import { formatRelativeTime } from '@/lib/ui/format';
import {
  agentLabel,
  elapsedLabel,
  firstPromptTruncated,
  replyLineState,
  threadAuthor,
  threadMessageText,
  type ReplyLineState,
} from '@/lib/spaces/space-model';

/** The author column: web's `lg` avatar. */
const AUTHOR_AVATAR = 32;
/** The message clamps at six lines, as on web. */
const MESSAGE_LINES = 6;

/** "Working · 0:42", ticking once a second while the row is on screen. */
function useElapsed(sinceMs: number | null): string | null {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (sinceMs === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sinceMs]);
  return sinceMs === null ? null : elapsedLabel(now - sinceMs);
}

function TriggerTile({ type }: { type: string | null }) {
  const glyph = type === 'webhook' ? WebhooksLogoIcon : type === 'cron' ? AlarmIcon : LightningIcon;
  return (
    <View className="items-center justify-center rounded-md bg-muted" style={{ width: AUTHOR_AVATAR, height: AUTHOR_AVATAR }}>
      <Icon as={glyph} size={16} className="text-muted-foreground" />
    </View>
  );
}

function ReplyLine({
  state,
  agent,
  replies,
  updatedAt,
}: {
  state: ReplyLineState;
  agent: string;
  replies: number;
  updatedAt: string;
}) {
  const { t } = useTranslation();
  const elapsed = useElapsed(state.kind === 'working' ? state.sinceMs : null);
  if (state.kind === 'none') return null;
  const trailing = `${replies > 0 ? `${t('spaces.replies', { count: replies })} · ` : ''}${formatRelativeTime(updatedAt)}`;
  if (state.kind === 'count') {
    return (
      <View className="mt-1.5 flex-row items-center gap-1">
        <Text variant="small" className="leading-5">
          {t('spaces.replies', { count: replies })}
        </Text>
        <Text variant="muted">· {formatRelativeTime(updatedAt)}</Text>
      </View>
    );
  }
  const markAgent = state.kind === 'child' ? state.agent : agent;
  let body: React.ReactNode;
  switch (state.kind) {
    case 'needs-you':
      body = (
        <View className="min-w-0 flex-1 flex-row items-center gap-1">
          <SessionStatusMark status="needs-you" waitingOn="answer" />
          <Text variant="small" className="flex-1 leading-5" numberOfLines={1}>
            {state.header ?? t('spaces.needsYou')}
          </Text>
        </View>
      );
      break;
    case 'starting':
      body = (
        <TextShimmer variant="muted" containerStyle={{ flex: 1 }} numberOfLines={1}>
          {t('spaces.starting')}
        </TextShimmer>
      );
      break;
    case 'working':
      body = (
        <TextShimmer variant="muted" containerStyle={{ flex: 1 }} numberOfLines={1}>
          {elapsed ? t('spaces.workingFor', { time: elapsed }) : t('spaces.working')}
        </TextShimmer>
      );
      break;
    case 'child':
      body = (
        <TextShimmer variant="muted" containerStyle={{ flex: 1 }} numberOfLines={1}>
          {t('spaces.agentIsWorking', { agent: agentLabel(state.agent) })}
        </TextShimmer>
      );
      break;
    case 'reply':
      body = (
        <Text className="flex-1" numberOfLines={1}>
          {state.text}
        </Text>
      );
      break;
  }
  return (
    <View className="mt-1.5 flex-row items-center gap-2">
      <AgentPixelMark slug={markAgent} size={14} tile={20} />
      {body}
      <Text variant="muted" className="shrink-0" style={{ fontVariant: ['tabular-nums'] }}>
        {trailing}
      </Text>
    </View>
  );
}

export interface SpaceThreadRowProps {
  session: ProjectSession;
  space: ProjectSpace;
  /** What waits on the viewer in this thread, or undefined. */
  needsYou?: SessionNeedsYou;
  /** Mentions read as names in the reply line. */
  names: (text: string) => string;
  onOpen: (session: ProjectSession) => void;
  onLongPress?: (session: ProjectSession) => void;
}

export const SpaceThreadRow = React.memo(function SpaceThreadRow({ session, space, needsYou, names, onOpen, onLongPress }: SpaceThreadRowProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = React.useState(false);
  const [clamped, setClamped] = React.useState(false);
  const author = threadAuthor(session, t('spaces.someone'));
  const message = threadMessageText(session);
  const truncatedByServer = firstPromptTruncated(session);
  const agent = session.agent_name ?? space.dm_agent_name ?? 'kortix';
  const state = replyLineState(session, { waiting: !!needsYou, header: needsYou?.reason ?? null }, names);
  const created = new Date(session.created_at);
  const time = created.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const authorName = author.kind === 'agent' ? agentLabel(author.name) : author.name;

  const open = React.useCallback(() => {
    haptics.tap();
    onOpen(session);
  }, [onOpen, session]);
  const longPress = React.useCallback(() => {
    if (!onLongPress) return;
    haptics.selection();
    onLongPress(session);
  }, [onLongPress, session]);
  const toggleMore = React.useCallback(() => {
    // A message the server cut: its whole text is in the thread.
    if (truncatedByServer && !expanded) {
      open();
      return;
    }
    haptics.selection();
    setExpanded((value) => !value);
  }, [truncatedByServer, expanded, open]);

  return (
    <Pressable
      onPress={open}
      onLongPress={onLongPress ? longPress : undefined}
      accessibilityRole="button"
      accessibilityLabel={t('spaces.threadA11y', { author: authorName, time })}
      className="flex-row gap-3 px-4 py-2 active:bg-muted/50">
      <View style={{ width: AUTHOR_AVATAR }}>
        {author.kind === 'trigger' ? (
          <TriggerTile type={author.type} />
        ) : author.kind === 'agent' ? (
          <AgentPixelMark slug={author.name} size={21} tile={AUTHOR_AVATAR} radius={7} />
        ) : (
          <ParticipantAvatar person={{ name: author.name, email: session.owner_email ?? '', avatar_url: author.avatarUrl }} size={AUTHOR_AVATAR} />
        )}
      </View>
      <View className="min-w-0 flex-1">
        <View className="flex-row items-baseline gap-2">
          <Text variant="small" className="shrink leading-5" numberOfLines={1}>
            {authorName}
          </Text>
          <Text variant="muted">
            {time}
          </Text>
        </View>
        <Text
          className="mt-0.5"
          numberOfLines={expanded ? undefined : MESSAGE_LINES}
          onTextLayout={(event) => {
            if (!expanded) setClamped(event.nativeEvent.lines.length >= MESSAGE_LINES);
          }}>
          {message}
          {truncatedByServer && !expanded ? '…' : ''}
        </Text>
        {clamped || truncatedByServer ? (
          <Pressable onPress={toggleMore} hitSlop={8} accessibilityRole="button" className="mt-1 self-start">
            <Text variant="muted">{expanded ? t('spaces.showLess') : t('spaces.showMore')}</Text>
          </Pressable>
        ) : null}
        <ReplyLine state={state} agent={agent} replies={session.reply_count ?? 0} updatedAt={session.updated_at} />
      </View>
    </Pressable>
  );
});
