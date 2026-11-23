/**
 * The drawer with Spaces on (project flag `chat`), web's `ProjectSpacesNav`:
 * Review first, then the person's own space, then every live channel they
 * see, each as its tile, its name (a lock when private) and its newest
 * message on the line under it. "New space" ends the list; a project manager
 * then sees the private spaces they are not in. The session list is hidden:
 * every session lives in a space, and Search still reaches all of them.
 */
import type { ProjectSpace } from '@kortix/sdk';
import { PROJECT_ACTIONS } from '@kortix/sdk';
import { useCan, usePrivateChannelsNotIn } from '@kortix/sdk/react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { CountBadge } from '@/components/kortix/count-badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useProjectSessionsPaged } from '@/lib/projects/hooks';
import { LockIcon, PlusIcon, SealCheckIcon } from '@/lib/icons';
import { cn } from '@/lib/utils/index';
import { isPersonalSpace, isPrivateSpace, orderSpaces, spaceDisplayName, spacePreview } from '@/lib/spaces/space-model';

import { NavPill } from '@/components/session/DrawerNavRows';
import { SpaceAvatar } from './SpaceAvatar';
import { useMentionNames, useOtherPerson, usePersonalSpaceName, useSpaces } from './space-hooks';
import { spaceThreadsFilter } from './use-space-send';

/** One space: tile, name (lock when private), newest message. The space on screen is highlighted. */
const SpaceRow = React.memo(function SpaceRow({
  projectId,
  space,
  name,
  personal,
  active,
  names,
  onPress,
}: {
  projectId: string;
  /** Null: the personal space before its first open. */
  space: ProjectSpace | null;
  name: string;
  personal: boolean;
  active: boolean;
  names: (text: string) => string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  // The same list the space's Chat reads (one cache entry): no poll of its own.
  const threads = useProjectSessionsPaged(projectId, { ...spaceThreadsFilter(space?.space_id ?? 'none'), poll: false, enabled: !!space });
  const preview = React.useMemo(() => spacePreview(threads.sessions, names), [threads.sessions, names]);
  const other = useOtherPerson(projectId, space);
  const shown = other?.name ?? name;
  const locked = !personal && !!space && isPrivateSpace(space) && !other;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={locked ? t('spaces.privateNamed', { name: shown }) : shown}
      className={cn('flex-row items-center gap-3 rounded-xl px-3 py-2 active:bg-foreground/5', active && 'bg-accent')}>
      <SpaceAvatar projectId={projectId} space={space} personal={personal} />
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-1">
          <Text className="shrink font-medium" numberOfLines={1}>
            {shown}
          </Text>
          {locked ? <Icon as={LockIcon} size={12} className="text-muted-foreground" /> : null}
        </View>
        <Text variant="muted" numberOfLines={1}>
          {preview ?? t('spaces.noMessages')}
        </Text>
      </View>
    </Pressable>
  );
});

export interface DrawerSpacesProps {
  projectId: string;
  /** The space the home shows (null: the personal space), and whether the home is on screen. */
  activeSpaceId: string | null;
  homeShown: boolean;
  showReview: boolean;
  reviewNeedsYouCount: number;
  onOpenReview: () => void;
  /** Show a space on the project home; null opens the personal space. */
  onOpenSpace: (spaceId: string | null) => void;
  onCreateSpace: () => void;
  /** A manager's row for the private spaces they are not in. */
  onOpenPrivateNotIn: () => void;
}

export function DrawerSpaces({
  projectId,
  activeSpaceId,
  homeShown,
  showReview,
  reviewNeedsYouCount,
  onOpenReview,
  onOpenSpace,
  onCreateSpace,
  onOpenPrivateNotIn,
}: DrawerSpacesProps) {
  const { t } = useTranslation();
  const spaces = useSpaces(projectId);
  const personalName = usePersonalSpaceName();
  const names = useMentionNames(projectId);
  const { personal, others } = React.useMemo(() => orderSpaces(spaces.data ?? []), [spaces.data]);
  const manager = useCan({ projectId }, PROJECT_ACTIONS.PROJECT_MEMBERS_MANAGE).allowed === true;
  const notIn = usePrivateChannelsNotIn(projectId, { enabled: manager });
  const notInCount = notIn.data?.length ?? 0;
  // The personal space is on screen when the home shows it: no pick, or the pick is the personal space.
  const personalActive = homeShown && (!activeSpaceId || (personal ? activeSpaceId === personal.space_id : false));

  return (
    <View className="px-1">
      {showReview ? (
        <View className="mb-2">
          <NavPill
            icon={SealCheckIcon}
            label={t('spaces.review')}
            accessibilityLabel={reviewNeedsYouCount > 0 ? t('spaces.reviewPending', { count: reviewNeedsYouCount }) : t('spaces.review')}
            onPress={onOpenReview}
            trailing={<CountBadge count={reviewNeedsYouCount} tone="waiting" />}
          />
        </View>
      ) : null}
      <SpaceRow
        projectId={projectId}
        space={personal}
        name={personalName}
        personal
        active={personalActive}
        names={names}
        onPress={() => onOpenSpace(null)}
      />
      {spaces.isError && !spaces.data ? (
        <View className="items-start gap-2 px-4 py-3">
          <Text variant="muted">{t('spaces.loadError')}</Text>
          <Button variant="secondary" size="sm" className="rounded-full" onPress={() => void spaces.refetch()}>
            <Text>{t('spaces.retry')}</Text>
          </Button>
        </View>
      ) : null}
      {others.map((space) => (
        <SpaceRow
          key={space.space_id}
          projectId={projectId}
          space={space}
          name={spaceDisplayName(space, personalName)}
          personal={isPersonalSpace(space)}
          active={homeShown && activeSpaceId === space.space_id}
          names={names}
          onPress={() => onOpenSpace(space.space_id)}
        />
      ))}
      {spaces.data ? (
        <Pressable
          onPress={onCreateSpace}
          accessibilityRole="button"
          className="flex-row items-center gap-3 rounded-xl px-3 py-2 active:bg-foreground/5">
          <View className="h-8 w-8 items-center justify-center">
            <Icon as={PlusIcon} size={18} className="text-muted-foreground" />
          </View>
          <Text className="text-muted-foreground">{t('spaces.newSpace')}</Text>
        </Pressable>
      ) : null}
      {manager && notInCount > 0 ? (
        <Pressable
          onPress={onOpenPrivateNotIn}
          accessibilityRole="button"
          className="flex-row items-center gap-3 rounded-xl px-3 py-2 active:bg-foreground/5">
          <View className="h-8 w-8 items-center justify-center">
            <Icon as={LockIcon} size={16} className="text-muted-foreground" />
          </View>
          <Text className="flex-1 text-muted-foreground" numberOfLines={1}>
            {t('spaces.privateNotInRow', { count: notInCount })}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
