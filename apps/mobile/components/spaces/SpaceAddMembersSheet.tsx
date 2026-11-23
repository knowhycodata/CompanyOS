/**
 * Add people and agents to a channel (web `AddChannelMembersDialog`). People
 * are `#general`'s members (every project member) not in the channel yet;
 * agents are the project's selectable agents not on it yet. One Add sends
 * both; the part that fails stays picked, so a second Add retries only it.
 */
import { isSelectableAgent, type ProjectSpace } from '@kortix/sdk';
import { useAddWorkspaceSpaceMembers, useUpdateWorkspaceSpace, useWorkspaceSpaceMembers } from '@kortix/sdk/react';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { SettingsGroup, SettingsRow } from '@/components/kortix/settings-list';
import { KortixBottomSheetModal, useContentSheetBottomInset } from '@/components/kortix/sheet';
import { SheetScrollView } from '@/components/kortix/sheet-parts';
import { SheetTextInput } from '@/components/kortix/SheetInput';
import { useToast } from '@/components/kortix/toast-provider';
import { ParticipantAvatar } from '@/components/session/ParticipantAvatar';
import { AgentPixelMark } from '@/components/session/tool/shared/agent-pixel-mark';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { haptics } from '@/lib/haptics';
import { useProjectDetail } from '@/lib/projects/hooks';
import { agentLabel } from '@/lib/spaces/space-model';

import { useSpaces } from './space-hooks';

export type AddMembersMode = 'people' | 'agents';

export interface SpaceAddMembersSheetRef {
  open: (mode?: AddMembersMode) => void;
}

interface Props {
  projectId: string;
  space: ProjectSpace;
  canAddPeople: boolean;
  canAddAgents: boolean;
  projectDefault: string | null;
}

export const SpaceAddMembersSheet = React.forwardRef<SpaceAddMembersSheetRef, Props>(function SpaceAddMembersSheet(
  { projectId, space, canAddPeople, canAddAgents },
  ref,
) {
  const { t } = useTranslation();
  const toast = useToast();
  const modalRef = React.useRef<BottomSheetModal>(null);
  const bottomInset = useContentSheetBottomInset();
  const [mode, setMode] = React.useState<AddMembersMode | null>(null);
  const [query, setQuery] = React.useState('');
  const [people, setPeople] = React.useState<string[]>([]);
  const [agents, setAgents] = React.useState<string[]>([]);

  React.useImperativeHandle(ref, () => ({
    open: (next) => {
      setMode(next ?? null);
      setQuery('');
      setPeople([]);
      setAgents([]);
      modalRef.current?.present();
    },
  }));

  const spaces = useSpaces(projectId);
  const generalId = spaces.data?.find((row) => row.is_default)?.space_id;
  const everyone = useWorkspaceSpaceMembers(projectId, canAddPeople ? generalId : null);
  const current = useWorkspaceSpaceMembers(projectId, canAddPeople ? space.space_id : null);
  const { data: detail } = useProjectDetail(projectId);
  const add = useAddWorkspaceSpaceMembers(projectId, space.space_id);
  const update = useUpdateWorkspaceSpace(projectId);
  const pending = add.isPending || update.isPending;
  const currentAgents = React.useMemo(() => space.agents ?? [], [space.agents]);
  const outside = space.visibility === 'private' && space.is_member === false;

  const needle = query.trim().toLowerCase();
  const personRows = React.useMemo(() => {
    if (!canAddPeople || mode === 'agents') return [];
    const taken = new Set((current.data?.members ?? []).map((member) => member.user_id));
    return (everyone.data?.members ?? []).filter((member) => !taken.has(member.user_id) && !(outside && member.is_viewer));
  }, [canAddPeople, mode, current.data, everyone.data, outside]);
  const agentRows = React.useMemo(() => {
    if (!canAddAgents || mode === 'people') return [];
    return (detail?.config?.agents ?? []).filter((agent) => isSelectableAgent(agent) && !currentAgents.includes(agent.name)).map((agent) => agent.name);
  }, [canAddAgents, mode, detail?.config?.agents, currentAgents]);
  const shownPeople = personRows.filter((member) => !needle || member.name.toLowerCase().includes(needle));
  const shownAgents = agentRows.filter((name) => !needle || name.toLowerCase().includes(needle) || agentLabel(name).toLowerCase().includes(needle));
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  const count = people.length + agents.length;

  const submit = async () => {
    if (count === 0 || pending) return;
    const [peopleResult, agentsResult] = await Promise.allSettled([
      people.length > 0 ? add.mutateAsync(people) : null,
      agents.length > 0 ? update.mutateAsync({ spaceId: space.space_id, input: { agents: [...currentAgents, ...agents] } }) : null,
    ]);
    const peopleFailed = peopleResult.status === 'rejected';
    const agentsFailed = agentsResult.status === 'rejected';
    if (!peopleFailed) setPeople([]);
    if (!agentsFailed) setAgents([]);
    if (!peopleFailed && !agentsFailed) {
      haptics.success();
      modalRef.current?.dismiss();
      return;
    }
    haptics.warning();
    toast.error(peopleFailed && agentsFailed ? t('spaces.addMembers.failed') : peopleFailed ? t('spaces.addMembers.peopleFailed') : t('spaces.addMembers.agentsFailed'));
  };

  const loading = canAddPeople && mode !== 'agents' && (everyone.isLoading || current.isLoading);
  const empty = loading
    ? null
    : personRows.length + agentRows.length === 0
      ? t('spaces.addMembers.allAdded')
      : shownPeople.length + shownAgents.length === 0
        ? t('spaces.addMembers.noMatches', { query: query.trim() })
        : null;
  const title = mode === 'agents' ? t('spaces.details.addAgent') : mode === 'people' ? t('spaces.details.addPeople') : t('spaces.addMembers.title');

  return (
    <KortixBottomSheetModal
      ref={modalRef}
      title={title}
      snapPoints={['70%']}
      enablePanDownToClose
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore">
      <SheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: Math.max(bottomInset, 16) + 8 }}>
        <View className="gap-4 px-4">
          <SheetTextInput value={query} onChangeText={setQuery} placeholder={t('spaces.addMembers.search')} accessibilityLabel={t('spaces.addMembers.search')} />
          {empty ? (
            <Text variant="muted" className="px-4">
              {empty}
            </Text>
          ) : null}
          {shownPeople.length > 0 ? (
            <SettingsGroup title={t('spaces.details.people')}>
              {shownPeople.map((member) => (
                <SettingsRow
                  key={member.user_id}
                  leading={<ParticipantAvatar person={{ name: member.name, email: '', avatar_url: member.avatar_url }} size={28} />}
                  label={member.name}
                  checked={people.includes(member.user_id)}
                  onPress={() => {
                    haptics.selection();
                    setPeople((list) => toggle(list, member.user_id));
                  }}
                  right={null}
                />
              ))}
            </SettingsGroup>
          ) : null}
          {shownAgents.length > 0 ? (
            <SettingsGroup title={t('spaces.details.agents')}>
              {shownAgents.map((name) => (
                <SettingsRow
                  key={name}
                  leading={<AgentPixelMark slug={name} size={14} tile={28} radius={7} />}
                  label={agentLabel(name)}
                  checked={agents.includes(name)}
                  onPress={() => {
                    haptics.selection();
                    setAgents((list) => toggle(list, name));
                  }}
                  right={null}
                />
              ))}
            </SettingsGroup>
          ) : null}
          <Button size="lg" className="rounded-full" disabled={count === 0 || pending} onPress={submit}>
            <Text>{pending ? t('spaces.form.saving') : count > 0 ? t('spaces.addMembers.addCount', { count }) : t('spaces.addMembers.add')}</Text>
          </Button>
        </View>
      </SheetScrollView>
    </KortixBottomSheetModal>
  );
});
