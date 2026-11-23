/**
 * The project home with Spaces on (project flag `chat`): the active space
 * (`stores/active-space-store`), else the person's own space, as web's home
 * opens `/chat`. The header names the space (a tap opens its details), the
 * timeline fills the page, and the composer starts a new thread per message.
 *
 * The personal space is the person's DM with My Kortix: the first open
 * creates it (`useOpenWorkspaceDm`), as web's `/chat` does. A channel that is
 * gone (archived, removed, made private) falls back to the personal space.
 */
import type { ProjectSession, ProjectSpace } from '@kortix/sdk';
import { useChannelsOnboarding, useJoinWorkspaceSpace, useMarkChannelsOnboarding, useOpenWorkspaceDm, useWorkspaceSpaceGeneralNotice, useWorkspaceSpaceMembers } from '@kortix/sdk/react';
import { MY_KORTIX_AGENT_NAME } from '@kortix/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HEADER_BUTTON_PT } from '@/components/kortix/header-button';

import { KortixLoader } from '@/components/kortix/kortix-loader';
import { PressableSurface } from '@/components/kortix/pressable-surface';
import { useToast } from '@/components/kortix/toast-provider';
import { FloatingMenuButton } from '@/components/session/FloatingMenuButton';
import { NotificationsButton } from '@/components/session/NotificationsButton';
import { ProjectHome, type ProjectHomeSubmit } from '@/components/session/ProjectHome';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { haptics } from '@/lib/haptics';
import { CaretDownIcon, CheckCircleIcon, CircleIcon, LockIcon, XIcon } from '@/lib/icons';
import { useProjectDetail } from '@/lib/projects/hooks';
import type { SessionNeedsYou } from '@/lib/session/needs-you';
import { canEditSpace, channelRunnableAgents, isPrivateSpace, orderSpaces, spaceDisplayName } from '@/lib/spaces/space-model';
import { useActiveSpaceId, useActiveSpaceStore } from '@/stores/active-space-store';

import { SpaceAvatar } from './SpaceAvatar';
import { SpaceTabsStrip } from './SpaceTabsStrip';
import { SpaceTimeline } from './SpaceTimeline';
import { useMentionNames, useOtherPerson, usePersonalSpaceName, useSpaces } from './space-hooks';
import { useSpaceSend } from './use-space-send';

/** A channel's setup block, dismissed on this phone (web keeps it per browser). */
const setupDismissedKey = (spaceId: string) => `kortix:channel-setup-dismissed:${spaceId}`;

export interface SpaceHomeProps {
  projectId: string;
  onOpenDrawer: () => void;
  notifications?: { unreadCount: number; onOpen: () => void };
  needsYouBySession?: ReadonlyMap<string, SessionNeedsYou>;
  onOpenThread: (session: ProjectSession) => void;
  onThreadActions: (session: ProjectSession) => void;
  /** The active space's details page; `section` scrolls to its people or opens Add. */
  onOpenDetails: (section?: 'people' | 'add') => void;
  onCreateSpace: () => void;
  /** Invite people to the project: the Members page. */
  onInviteToProject: () => void;
  showUpgradeForError: (error: unknown) => boolean;
}

/** The space the home shows: the picked one while it is live, else the personal space (null until created). */
export function useHomeSpace(projectId: string): { space: ProjectSpace | null; spaces: ReturnType<typeof useSpaces> } {
  const spaces = useSpaces(projectId);
  const activeId = useActiveSpaceId(projectId);
  const space = React.useMemo(() => {
    const list = spaces.data ?? [];
    const picked = activeId ? list.find((item) => item.space_id === activeId && !item.archived_at) : undefined;
    return picked ?? orderSpaces(list).personal;
  }, [spaces.data, activeId]);
  // The picked space left the list (archived, removed, made private): forget it.
  React.useEffect(() => {
    if (!activeId || !spaces.data) return;
    if (!spaces.data.some((item) => item.space_id === activeId && !item.archived_at)) {
      useActiveSpaceStore.getState().setActiveSpace(projectId, null);
    }
  }, [activeId, spaces.data, projectId]);
  return { space, spaces };
}

export function SpaceHome(props: SpaceHomeProps) {
  const { projectId, onOpenDrawer, notifications } = props;
  const { t } = useTranslation();
  const { space, spaces } = useHomeSpace(projectId);
  const openDm = useOpenWorkspaceDm(projectId);
  const activeId = useActiveSpaceId(projectId);
  // The personal space does not exist before its first open: create it once.
  const requested = React.useRef(false);
  const { mutate: openDmMutate } = openDm;
  React.useEffect(() => {
    if (space || activeId || !spaces.data || requested.current) return;
    requested.current = true;
    openDmMutate(MY_KORTIX_AGENT_NAME);
  }, [space, activeId, spaces.data, openDmMutate]);
  // Every 10 s the list refetches: Kortix edits tabs and agents from a thread.
  const { refetch } = spaces;
  React.useEffect(() => {
    const id = setInterval(() => void refetch(), 10_000);
    return () => clearInterval(id);
  }, [refetch]);

  if (!space) {
    const failed = (spaces.isError && !spaces.data) || openDm.isError;
    return (
      <View className="flex-1 bg-background">
        <FloatingMenuButton onPress={onOpenDrawer}>
          {notifications ? <NotificationsButton unreadCount={notifications.unreadCount} onPress={notifications.onOpen} /> : null}
        </FloatingMenuButton>
        <View className="flex-1 items-center justify-center gap-3 px-6">
          {failed ? (
            <>
              <Text variant="small" className="text-center leading-5">
                {openDm.isError ? t('spaces.dmFailed') : t('spaces.loadError')}
              </Text>
              <Button
                variant="secondary"
                size="sm"
                className="rounded-full"
                onPress={() => {
                  haptics.tap();
                  if (openDm.isError) openDmMutate(MY_KORTIX_AGENT_NAME);
                  else void refetch();
                }}>
                <Text>{t('spaces.retry')}</Text>
              </Button>
            </>
          ) : (
            <KortixLoader size="small" />
          )}
        </View>
      </View>
    );
  }
  return <SpaceHomeReady {...props} space={space} />;
}

function SpaceHomeReady({
  projectId,
  space,
  onOpenDrawer,
  notifications,
  needsYouBySession,
  onOpenThread,
  onThreadActions,
  onOpenDetails,
  onCreateSpace,
  onInviteToProject,
  showUpgradeForError,
}: SpaceHomeProps & { space: ProjectSpace }) {
  const { t } = useTranslation();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const personal = usePersonalSpaceName();
  const other = useOtherPerson(projectId, space);
  const name = other?.name ?? spaceDisplayName(space, personal);
  const names = useMentionNames(projectId);
  const { data: detail } = useProjectDetail(projectId);
  const { sending, send } = useSpaceSend(projectId, space.space_id, { showUpgradeForError });
  const join = useJoinWorkspaceSpace(projectId, space.space_id);
  const canJoin = space.kind === 'channel' && space.is_member === false && !isPrivateSpace(space);

  const agents = React.useMemo(
    () => ({
      locked: space.kind === 'dm' ? space.dm_agent_name : null,
      preferred: channelRunnableAgents(space, detail?.config?.default_agent ?? null),
    }),
    [space, detail?.config?.default_agent],
  );
  const placeholder = space.kind === 'channel' && !other ? t('spaces.messageChannel', { name: space.slug ?? space.name }) : t('spaces.messageNamed', { name });

  const openDetails = React.useCallback(() => {
    haptics.tap();
    onOpenDetails();
  }, [onOpenDetails]);

  const title = (
    <PressableSurface
      onPress={openDetails}
      accessibilityRole="button"
      accessibilityLabel={t('spaces.openDetails', { name })}
      hitSlop={{ top: 10, bottom: 10 }}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '100%', opacity: pressed ? 0.6 : 1 })}>
      <SpaceAvatar projectId={projectId} space={space} size={24} />
      <Text className="shrink font-roobert-medium" numberOfLines={1}>
        {name}
      </Text>
      {isPrivateSpace(space) && space.kind === 'channel' ? <Icon as={LockIcon} size={12} className="text-muted-foreground" /> : null}
      <Icon as={CaretDownIcon} size={12} className="text-muted-foreground" />
    </PressableSurface>
  );

  const head = (
    <View>
      {space.is_default ? <GeneralNotice projectId={projectId} /> : null}
      {space.kind === 'channel' ? (
        <ChannelSetup
          projectId={projectId}
          space={space}
          onAddAgents={() => onOpenDetails('add')}
          onInvite={onInviteToProject}
          onOpenPeople={() => onOpenDetails('people')}
          onCreateSpace={onCreateSpace}
        />
      ) : null}
    </View>
  );

  const body = (
    // The floating header (hamburger · name · bell) sits over the top: the page starts under its row.
    <View className="flex-1" style={{ paddingTop: insets.top + 8 + HEADER_BUTTON_PT + 4 }}>
      <SpaceTabsStrip projectId={projectId} space={space} onManageTabs={() => onOpenDetails()} />
      <SpaceTimeline
        projectId={projectId}
        space={space}
        needsYouBySession={needsYouBySession}
        names={names}
        head={head}
        onOpenThread={onOpenThread}
        onThreadActions={onThreadActions}
        contentInset={8}
      />
      {canJoin ? (
        <View className="flex-row items-center justify-between gap-3 border-t border-border px-4 py-3">
          <Text variant="muted" className="flex-1">
            {t('spaces.notMember', { name: `#${space.slug ?? space.name}` })}
          </Text>
          <Button
            size="sm"
            className="rounded-full"
            disabled={join.isPending}
            onPress={() => {
              haptics.tap();
              join.mutate(undefined, { onError: (err) => toast.error((err as Error)?.message || t('spaces.joinFailed')) });
            }}>
            <Text>{t('spaces.join')}</Text>
          </Button>
        </View>
      ) : null}
    </View>
  );

  const submit = React.useCallback((input: ProjectHomeSubmit) => send(input), [send]);

  return (
    <ProjectHome
      // One composer per space: its draft, agent and attachments.
      key={space.space_id}
      projectId={projectId}
      sending={sending}
      onSubmitNewSession={submit}
      onOpenDrawer={onOpenDrawer}
      notifications={notifications}
      space={{ spaceId: space.space_id, title, body, placeholder, agents }}
    />
  );
}

/** `#general`'s "turned on again" line (web `GeneralChatHead`). */
function GeneralNotice({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const notice = useWorkspaceSpaceGeneralNotice(projectId);
  if (!notice.data) return null;
  return (
    <View className="mx-4 mb-3 rounded-2xl bg-secondary px-4 py-3">
      <Text variant="muted">{t('spaces.reenabled', { count: notice.data.count })}</Text>
    </View>
  );
}

type SetupStep = { key: string; label: string; done: boolean; onPress: () => void };

/**
 * A channel's one setup block (web `ChannelSetup`): only the steps the viewer
 * can take, each checked off from real state. Add agents (an editor): the
 * channel has an agent. Invite people: the channel has a second person.
 * `#general` adds Create a space. Hidden when every step is done or the
 * viewer dismissed it: in `#general` by the server's mark, elsewhere on this phone.
 */
function ChannelSetup({
  projectId,
  space,
  onAddAgents,
  onInvite,
  onOpenPeople,
  onCreateSpace,
}: {
  projectId: string;
  space: ProjectSpace;
  onAddAgents: () => void;
  onInvite: () => void;
  onOpenPeople: () => void;
  onCreateSpace: () => void;
}) {
  const { t } = useTranslation();
  const general = space.is_default === true;
  const members = useWorkspaceSpaceMembers(projectId, space.space_id);
  const onboarding = useChannelsOnboarding(projectId, { enabled: general });
  const mark = useMarkChannelsOnboarding(projectId);
  const [dismissed, setDismissed] = React.useState<boolean | null>(general ? false : null);
  React.useEffect(() => {
    if (general) return;
    let live = true;
    AsyncStorage.getItem(setupDismissedKey(space.space_id))
      .then((value) => live && setDismissed(value === '1'))
      .catch(() => live && setDismissed(false));
    return () => {
      live = false;
    };
  }, [general, space.space_id]);

  const canAdd = members.data?.can_add === true;
  const steps: SetupStep[] = [];
  if (canEditSpace(space)) {
    steps.push({ key: 'agents', label: t('spaces.setup.addAgents'), done: (space.agents?.length ?? 0) > 0, onPress: onAddAgents });
  }
  steps.push({
    key: 'invite',
    label: t('spaces.setup.invite'),
    done: (members.data?.members.length ?? 0) > 1,
    onPress: !general && canAdd ? onOpenPeople : onInvite,
  });
  const state = onboarding.data?.get_started;
  if (general && state) steps.push({ key: 'channel', label: t('spaces.setup.createSpace'), done: state.create_channel, onPress: onCreateSpace });

  const loading = members.isLoading || dismissed === null || (general && onboarding.isLoading);
  if (loading || dismissed || (general && state?.visible === false) || steps.every((step) => step.done)) return null;

  const dismiss = () => {
    haptics.tap();
    setDismissed(true);
    if (general) mark.mutate('get_started.dismissed');
    else void AsyncStorage.setItem(setupDismissedKey(space.space_id), '1').catch(() => {});
  };

  return (
    <View className="mx-4 mb-3 rounded-2xl bg-secondary py-1">
      <View className="flex-row items-center justify-between pl-4 pr-1">
        <Text variant="small" className="leading-5">
          {t('spaces.setup.title', { name: `#${space.slug ?? space.name}` })}
        </Text>
        <Button variant="ghost" size="icon" onPress={dismiss} accessibilityLabel={t('spaces.setup.dismiss')}>
          <Icon as={XIcon} size={16} className="text-muted-foreground" />
        </Button>
      </View>
      {steps.map((step) => (
        <Pressable
          key={step.key}
          onPress={() => {
            haptics.tap();
            step.onPress();
          }}
          accessibilityRole="button"
          accessibilityState={{ checked: step.done }}
          className="h-11 flex-row items-center gap-3 px-4 active:opacity-60">
          <Icon as={step.done ? CheckCircleIcon : CircleIcon} size={18} className={step.done ? 'text-kortix-green' : 'text-muted-foreground'} />
          <Text className={step.done ? 'text-muted-foreground' : undefined}>{step.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
