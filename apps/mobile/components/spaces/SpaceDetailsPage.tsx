/**
 * The space on the project home, its details (web's details panel and its
 * "All settings" dialog as one page): the name and description, its agents
 * (the first is the default for a new thread), its people, its tabs, the
 * routines that post into it, Proactive (flag `spaces_proactive`), then
 * Make private, Leave and Archive. Every control shows only to whom the
 * server lets act: `can_edit` (creator or manager), the member list's
 * `can_add` and each member's `can_remove`.
 */
import type { ProjectSpace, ProjectSpaceMember, ProjectSpaceTab } from '@kortix/sdk';
import {
  useFeatureFlag,
  useLeaveWorkspaceSpace,
  usePrivateChannelsAvailable,
  useRemoveWorkspaceSpaceMember,
  useSetWorkspaceSpaceProactive,
  useSetWorkspaceSpaceTabs,
  useUpdateWorkspaceSpace,
  useWorkspaceSpaceMembers,
  useWorkspaceSpaceProactive,
} from '@kortix/sdk/react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useConfirmDialog } from '@/components/kortix/confirm-dialog';
import { PageHeader } from '@/components/kortix/page-header';
import { SettingsGroup, SettingsRow } from '@/components/kortix/settings-list';
import { Switch } from '@/components/kortix/switch';
import { useToast } from '@/components/kortix/toast-provider';
import { ParticipantAvatar } from '@/components/session/ParticipantAvatar';
import { AgentPixelMark } from '@/components/session/tool/shared/agent-pixel-mark';
import { Text } from '@/components/ui/text';
import { haptics } from '@/lib/haptics';
import { ArchiveIcon, CalendarIcon, LockIcon, PencilSimpleIcon, PlusIcon, SignOutIcon, UserPlusIcon } from '@/lib/icons';
import { useProjectDetail, useProjectTriggers } from '@/lib/projects/hooks';
import { describeCron } from '@/lib/projects/triggers-format';
import { agentLabel, canEditSpace, canEditSpaceTabs, isPrivateSpace, spaceDisplayName } from '@/lib/spaces/space-model';
import { moveTab, removeTab, renameTab } from '@/lib/spaces/space-tabs';
import { useActiveSpaceStore } from '@/stores/active-space-store';

import { CreateSpaceSheet, type CreateSpaceSheetRef } from './CreateSpaceSheet';
import { SpaceAvatar, SPACE_AVATAR_HERO } from './SpaceAvatar';
import { useHomeSpace } from './SpaceHome';
import { SpaceAgentSheet, type SpaceAgentSheetRef } from './SpaceAgentSheet';
import { SpaceAddMembersSheet, type SpaceAddMembersSheetRef } from './SpaceAddMembersSheet';
import { SpaceTabSheet, type SpaceTabSheetRef } from './SpaceTabSheet';
import { spaceTabIcon } from './SpaceTabsStrip';
import { useOtherPerson, usePersonalSpaceName } from './space-hooks';
import { useOpenSpaceTab } from './use-open-space-tab';

export interface SpaceDetailsPageProps {
  projectId: string;
  onBack: () => void;
  /** Invite people to the project (the Members page). */
  onOpenProjectMembers: () => void;
  /** The project's Schedules page, where routines are made. */
  onOpenSchedules: () => void;
}

export function SpaceDetailsPage({ projectId, onBack, onOpenProjectMembers, onOpenSchedules }: SpaceDetailsPageProps) {
  const { t } = useTranslation();
  const { space } = useHomeSpace(projectId);
  if (!space) {
    return (
      <View className="flex-1 bg-background">
        <PageHeader title={t('spaces.details.title')} onBack={onBack} />
      </View>
    );
  }
  return (
    <SpaceDetails
      projectId={projectId}
      space={space}
      onBack={onBack}
      onOpenProjectMembers={onOpenProjectMembers}
      onOpenSchedules={onOpenSchedules}
    />
  );
}

function SpaceDetails({ projectId, space, onBack, onOpenProjectMembers, onOpenSchedules }: SpaceDetailsPageProps & { space: ProjectSpace }) {
  const { t } = useTranslation();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { confirm, dialog } = useConfirmDialog();
  const personal = usePersonalSpaceName();
  const other = useOtherPerson(projectId, space);
  const name = other?.name ?? spaceDisplayName(space, personal);
  const channel = space.kind === 'channel';
  const editable = canEditSpace(space);
  const tabsEditable = canEditSpaceTabs(space);
  const { data: detail } = useProjectDetail(projectId);
  const projectDefault = detail?.config?.default_agent ?? null;
  const members = useWorkspaceSpaceMembers(projectId, channel ? space.space_id : null);
  const canAdd = members.data?.can_add === true;
  const update = useUpdateWorkspaceSpace(projectId);
  const removeMember = useRemoveWorkspaceSpaceMember(projectId, space.space_id);
  const leave = useLeaveWorkspaceSpace(projectId, space.space_id);
  const setTabs = useSetWorkspaceSpaceTabs(projectId);
  const privateAvailable = usePrivateChannelsAvailable(projectId).data === true;
  const proactiveFlag = useFeatureFlag(projectId, 'spaces_proactive').enabled;
  const proactive = useWorkspaceSpaceProactive(projectId, space.space_id, { enabled: proactiveFlag });
  const setProactive = useSetWorkspaceSpaceProactive(projectId, space.space_id);
  const triggers = useProjectTriggers(projectId);
  const routines = React.useMemo(() => (Array.isArray(triggers.data) ? triggers.data : (triggers.data?.triggers ?? [])).filter((trigger) => trigger.space_id === space.space_id), [triggers.data, space.space_id]);
  const openTab = useOpenSpaceTab(projectId, space);

  const editSheet = React.useRef<CreateSpaceSheetRef>(null);
  const agentSheet = React.useRef<SpaceAgentSheetRef>(null);
  const addSheet = React.useRef<SpaceAddMembersSheetRef>(null);
  const tabSheet = React.useRef<SpaceTabSheetRef>(null);

  // The home asked for the Add sheet (a new space, the setup block's steps).
  React.useEffect(() => {
    const section = useActiveSpaceStore.getState().detailsSection;
    if (!section) return;
    useActiveSpaceStore.getState().setDetailsSection(null);
    if (section === 'add' || (section === 'people' && !space.is_default)) {
      const id = setTimeout(() => addSheet.current?.open(section === 'people' ? 'people' : undefined), 350);
      return () => clearTimeout(id);
    }
  }, []);

  const fail = React.useCallback(
    (fallback: string) => (err: unknown) => {
      haptics.warning();
      toast.error((err as Error)?.message || fallback);
    },
    [toast],
  );

  // ── Agents ──
  const agents = space.kind === 'dm' ? (space.dm_agent_name ? [space.dm_agent_name] : []) : (space.agents ?? []);
  const showsProjectDefault = channel && agents.length === 0 && !!projectDefault;
  const saveAgents = (next: string[]) =>
    update.mutate({ spaceId: space.space_id, input: { agents: next } }, { onError: fail(t('spaces.details.saveFailed')) });

  // ── Tabs ──
  const tabs = space.tabs ?? [];
  const saveTabs = (next: ProjectSpaceTab[]) =>
    setTabs.mutate({ spaceId: space.space_id, tabs: next }, { onError: fail(t('spaces.tabs.saveFailed')) });

  // ── People ──
  const people = React.useMemo(() => {
    const list = members.data?.members ?? [];
    return [...list.filter((member) => member.is_viewer), ...list.filter((member) => !member.is_viewer)];
  }, [members.data]);
  const viewerRow = people.find((member) => member.is_viewer);
  const onMember = (member: ProjectSpaceMember) => {
    if (!member.can_remove) return;
    if (member.is_viewer) {
      confirmLeave();
      return;
    }
    confirm({
      title: t('spaces.details.removeTitle', { name: member.name }),
      description: t('spaces.details.removeBody', { space: `#${space.slug ?? space.name}` }),
      confirmLabel: t('spaces.details.remove'),
      destructive: true,
      onConfirm: () => removeMember.mutate(member.user_id, { onError: fail(t('spaces.details.removeFailed')) }),
    });
  };
  const confirmLeave = () =>
    confirm({
      title: t('spaces.details.leaveTitle', { space: `#${space.slug ?? space.name}` }),
      description: isPrivateSpace(space) ? t('spaces.details.leavePrivateBody') : t('spaces.details.leaveBody'),
      confirmLabel: t('spaces.details.leave'),
      destructive: true,
      onConfirm: () =>
        leave.mutate(undefined, {
          onSuccess: () => {
            // A private space the viewer left is gone from their list.
            if (isPrivateSpace(space)) {
              useActiveSpaceStore.getState().setActiveSpace(projectId, null);
              onBack();
            }
          },
          onError: fail(t('spaces.details.leaveFailed')),
        }),
    });
  const confirmArchive = () =>
    confirm({
      title: t('spaces.details.archiveTitle', { space: `#${space.slug ?? space.name}` }),
      description: t('spaces.details.archiveBody'),
      confirmLabel: t('spaces.details.archive'),
      destructive: true,
      onConfirm: () =>
        update.mutate(
          { spaceId: space.space_id, input: { archived: true } },
          {
            onSuccess: () => {
              useActiveSpaceStore.getState().setActiveSpace(projectId, null);
              onBack();
            },
            onError: fail(t('spaces.details.saveFailed')),
          },
        ),
    });
  const confirmPrivate = () =>
    confirm({
      title: t('spaces.details.makePrivateTitle', { space: `#${space.slug ?? space.name}` }),
      description:
        routines.length > 0 ? t('spaces.details.makePrivateRoutines', { count: routines.length }) : t('spaces.details.makePrivateBody'),
      confirmLabel: t('spaces.details.makePrivate'),
      onConfirm: () => update.mutate({ spaceId: space.space_id, input: { visibility: 'private' } }, { onError: fail(t('spaces.details.saveFailed')) }),
    });

  const proactiveData = proactive.data;
  const proactiveEditable = proactiveData?.can_edit === true;

  return (
    <View className="flex-1 bg-background">
      <PageHeader title={channel && !other ? `#${space.slug ?? space.name}` : name} onBack={onBack} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 28 }} showsVerticalScrollIndicator={false}>
        <View className="items-center gap-2 px-6 pb-2 pt-4">
          <SpaceAvatar projectId={projectId} space={space} size={SPACE_AVATAR_HERO} />
          <View className="flex-row items-center gap-1.5">
            <Text variant="h4" numberOfLines={2} className="text-center">
              {name}
            </Text>
            {channel && isPrivateSpace(space) ? <LockIcon size={14} /> : null}
          </View>
          <Text variant="muted" className="text-center">
            {space.description || (space.kind === 'dm' ? t('spaces.details.personalHint') : t('spaces.details.noDescription'))}
          </Text>
        </View>

        <View className="gap-6 px-4 pt-4">
          {channel && editable ? (
            <SettingsGroup>
              <SettingsRow icon={PencilSimpleIcon} label={t('spaces.details.edit')} onPress={() => editSheet.current?.open()} />
            </SettingsGroup>
          ) : null}

          <SettingsGroup title={t('spaces.details.agents')}>
            {agents.map((agent, index) => (
              <SettingsRow
                key={agent}
                leading={<AgentPixelMark slug={agent} size={14} tile={28} radius={7} />}
                label={agentLabel(agent)}
                value={channel && index === 0 && agents.length > 1 ? t('spaces.details.default') : undefined}
                onPress={channel && editable ? () => agentSheet.current?.open(agent) : undefined}
                right={channel && editable ? undefined : null}
              />
            ))}
            {showsProjectDefault ? (
              <SettingsRow
                leading={<AgentPixelMark slug={projectDefault!} size={14} tile={28} radius={7} />}
                label={agentLabel(projectDefault!)}
                value={t('spaces.details.projectDefault')}
                right={null}
              />
            ) : null}
            {channel && editable ? (
              <SettingsRow icon={PlusIcon} label={t('spaces.details.addAgent')} onPress={() => addSheet.current?.open('agents')} />
            ) : null}
          </SettingsGroup>

          {channel ? (
            <SettingsGroup title={t('spaces.details.people')}>
              {members.isLoading ? (
                <SettingsRow label={t('spaces.loading')} right={null} disabled />
              ) : (
                people.map((member) => (
                  <SettingsRow
                    key={member.user_id}
                    leading={<ParticipantAvatar person={{ name: member.name, email: '', avatar_url: member.avatar_url }} size={28} />}
                    label={member.name}
                    value={member.is_viewer ? t('spaces.details.you') : member.is_creator ? t('spaces.details.creator') : undefined}
                    onPress={member.can_remove ? () => onMember(member) : undefined}
                    right={member.can_remove ? undefined : null}
                    accessibilityHint={member.can_remove ? (member.is_viewer ? t('spaces.details.leave') : t('spaces.details.remove')) : undefined}
                  />
                ))
              )}
              {(canAdd || editable) && !space.is_default ? (
                <SettingsRow icon={UserPlusIcon} label={t('spaces.details.addPeople')} onPress={() => addSheet.current?.open('people')} />
              ) : null}
              {space.is_default ? (
                <SettingsRow icon={UserPlusIcon} label={t('spaces.details.inviteToProject')} onPress={onOpenProjectMembers} />
              ) : null}
            </SettingsGroup>
          ) : null}
          {channel && isPrivateSpace(space) ? (
            <Text variant="muted" className="-mt-4 px-4">
              {t('spaces.details.privateNote')}
            </Text>
          ) : null}

          <SettingsGroup title={t('spaces.details.tabs')}>
            {tabs.map((tab) => (
              <SettingsRow
                key={tab.id}
                icon={spaceTabIcon(tab.kind)}
                label={tab.title}
                value={t(`spaces.tabs.kind.${tab.kind}`)}
                onPress={() => openTab(tab)}
                onLongPress={tabsEditable ? () => tabSheet.current?.edit(tab) : undefined}
                longPressLabel={tabsEditable ? t('spaces.tabs.edit') : undefined}
              />
            ))}
            {tabs.length === 0 && !tabsEditable ? <SettingsRow label={t('spaces.tabs.none')} right={null} disabled /> : null}
            {tabsEditable && tabs.length < 20 ? (
              <SettingsRow icon={PlusIcon} label={t('spaces.tabs.add')} onPress={() => tabSheet.current?.add()} />
            ) : null}
          </SettingsGroup>

          <SettingsGroup title={t('spaces.details.routines')}>
            {routines.map((trigger) => (
              <SettingsRow
                key={trigger.slug}
                icon={CalendarIcon}
                label={trigger.name}
                value={trigger.cron ? describeCron(trigger.cron) : trigger.type}
                onPress={onOpenSchedules}
              />
            ))}
            {channel && isPrivateSpace(space) ? (
              <SettingsRow label={t('spaces.details.routinesPrivate')} right={null} disabled />
            ) : triggers.isSuccess && routines.length === 0 ? (
              <SettingsRow label={t('spaces.details.noRoutines')} right={null} disabled />
            ) : null}
          </SettingsGroup>

          {proactiveFlag && proactiveData ? (
            <SettingsGroup title={t('spaces.details.proactive')}>
              <SettingsRow
                label={t('spaces.details.proactiveWatch')}
                right={
                  <Switch
                    checked={proactiveData.enabled}
                    disabled={!proactiveEditable || setProactive.isPending}
                    onCheckedChange={(enabled) => setProactive.mutate({ enabled }, { onError: fail(t('spaces.details.saveFailed')) })}
                    accessibilityLabel={t('spaces.details.proactiveWatch')}
                  />
                }
              />
              <SettingsRow
                label={t('spaces.details.dailyBrief')}
                right={
                  <Switch
                    checked={proactiveData.daily_brief}
                    disabled={!proactiveEditable || setProactive.isPending}
                    onCheckedChange={(daily_brief) =>
                      setProactive.mutate(
                        { daily_brief, brief_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
                        { onError: fail(t('spaces.details.saveFailed')) },
                      )
                    }
                    accessibilityLabel={t('spaces.details.dailyBrief')}
                  />
                }
              />
            </SettingsGroup>
          ) : null}

          {channel ? (
            <SettingsGroup>
              {editable && privateAvailable && !space.is_default && !isPrivateSpace(space) ? (
                <SettingsRow icon={LockIcon} label={t('spaces.details.makePrivate')} onPress={confirmPrivate} />
              ) : null}
              {viewerRow?.can_remove && !space.is_default ? (
                <SettingsRow icon={SignOutIcon} label={t('spaces.details.leave')} onPress={confirmLeave} destructive />
              ) : null}
              {editable && !space.is_default ? (
                <SettingsRow icon={ArchiveIcon} label={t('spaces.details.archive')} onPress={confirmArchive} destructive />
              ) : null}
            </SettingsGroup>
          ) : null}
          {channel ? (
            <Text variant="muted" className="-mt-3 px-4">
              {t('spaces.details.created', { date: new Date(space.created_at).toLocaleDateString(undefined, { dateStyle: 'long' }) })}
            </Text>
          ) : null}
        </View>
      </ScrollView>

      {channel && editable ? <CreateSpaceSheet ref={editSheet} projectId={projectId} space={space} /> : null}
      {channel && editable ? (
        <SpaceAgentSheet
          ref={agentSheet}
          agents={agents}
          onMakeDefault={(agent) => saveAgents([agent, ...agents.filter((name) => name !== agent)])}
          onRemove={(agent) => saveAgents(agents.filter((name) => name !== agent))}
        />
      ) : null}
      {channel ? (
        <SpaceAddMembersSheet
          ref={addSheet}
          projectId={projectId}
          space={space}
          canAddPeople={canAdd || editable}
          canAddAgents={editable}
          projectDefault={projectDefault}
        />
      ) : null}
      {tabsEditable ? (
        <SpaceTabSheet
          ref={tabSheet}
          projectId={projectId}
          space={space}
          tabs={tabs}
          onSave={saveTabs}
          onRename={(id, title) => saveTabs(renameTab(tabs, id, title))}
          onMove={(id, by) => saveTabs(moveTab(tabs, id, by))}
          onRemove={(id) => saveTabs(removeTab(tabs, id))}
        />
      ) : null}
      {dialog}
    </View>
  );
}
