import type { ProjectSpace, ProjectSpaceMember } from '@kortix/sdk';
import { useFeatureFlag, useWorkspaceSpaceMembers, useWorkspaceSpaces } from '@kortix/sdk/react';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuthContext } from '@/contexts';
import { useProjectDetail } from '@/lib/projects/hooks';
import {
  SPACES_FLAG,
  agentLabel,
  mentionSlug,
  otherPersonOf,
  viewerFirstName,
  withMentionNames,
  type MentionName,
} from '@/lib/spaces/space-model';

/** Spaces are on for this project (flag `chat`). Fails closed while the flag loads. */
export function useSpacesEnabled(projectId: string): { enabled: boolean; isLoading: boolean } {
  const flag = useFeatureFlag(projectId, SPACES_FLAG);
  return { enabled: flag.enabled, isLoading: flag.isLoading };
}

/** The project's spaces, read only while Spaces are on (the route answers 403 otherwise). */
export function useSpaces(projectId: string) {
  const { enabled } = useSpacesEnabled(projectId);
  return useWorkspaceSpaces(projectId, { enabled });
}

/** The personal space's name: "Ada's space", or "Your space" when the profile has no name. */
export function usePersonalSpaceName(): string {
  const { t } = useTranslation();
  const first = viewerFirstName(useAuthContext().user?.user_metadata);
  return first ? t('spaces.personalNamed', { name: first }) : t('spaces.personal');
}

/** The generated name of a two-person space ("Ana and Bo"), as "Message" names it. */
export function useTwoPersonName(): (a: string, b: string) => string {
  const { t } = useTranslation();
  return useCallback((a: string, b: string) => t('spaces.twoPersonName', { a, b }), [t]);
}

/** A two-person private space reads as the other person; null for every other space. */
export function useOtherPerson(projectId: string, space: ProjectSpace | null | undefined): ProjectSpaceMember | null {
  const viewerId = useAuthContext().user?.id;
  const generated = useTwoPersonName();
  const twoPerson = space?.kind === 'channel' && space.visibility === 'private';
  const members = useWorkspaceSpaceMembers(projectId, twoPerson ? space.space_id : null);
  return useMemo(
    () => (space && twoPerson ? otherPersonOf(space, members.data?.members, viewerId, generated) : null),
    [space, twoPerson, members.data, viewerId, generated],
  );
}

/**
 * The project's people and agents as mention names, for previews and reply
 * lines: `@ana-lima` reads `@Ana Lima`. People come from `#general`'s members
 * (every project member), agents from the project config.
 */
export function useMentionNames(projectId: string): (text: string) => string {
  const spaces = useSpaces(projectId);
  const general = spaces.data?.find((space) => space.is_default)?.space_id;
  const members = useWorkspaceSpaceMembers(projectId, general);
  const { data: detail } = useProjectDetail(projectId);
  const names = useMemo<MentionName[]>(() => {
    const people = (members.data?.members ?? []).map((member) => ({
      label: member.name,
      tokens: [mentionSlug(member.name), member.name.trim().split(/\s+/)[0] ?? ''],
    }));
    const agents = (detail?.config?.agents ?? []).map((agent) => ({ label: agentLabel(agent.name), tokens: [agent.name] }));
    return [...people, ...agents];
  }, [members.data, detail?.config?.agents]);
  return useCallback((text: string) => withMentionNames(text, names), [names]);
}
