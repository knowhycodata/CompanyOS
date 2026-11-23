/**
 * A space's face, web's `SpaceAvatar`: the generated pixel mark of its id
 * (stable across a rename) on a rounded tile, in the agents' avatar system.
 * The personal space shows the person's own avatar; a two-person private
 * space shows the other person's.
 */
import type { ProjectSpace } from '@kortix/sdk';

import { ParticipantAvatar } from '@/components/session/ParticipantAvatar';
import { AgentPixelMark } from '@/components/session/tool/shared/agent-pixel-mark';
import { useAuthContext } from '@/contexts';
import { isPersonalSpace } from '@/lib/spaces/space-model';

import { useOtherPerson } from './space-hooks';

/** The drawer row's tile (web `md`, 29px) and the header's. */
export const SPACE_AVATAR_ROW = 32;
export const SPACE_AVATAR_HERO = 52;

export function SpaceAvatar({
  projectId,
  space,
  personal = false,
  size = SPACE_AVATAR_ROW,
}: {
  projectId: string;
  /** Null: the personal space before its first open. */
  space: ProjectSpace | null;
  personal?: boolean;
  size?: number;
}) {
  const other = useOtherPerson(projectId, space);
  const user = useAuthContext().user;
  if (other) {
    return <ParticipantAvatar person={{ name: other.name, email: '', avatar_url: other.avatar_url }} size={size} />;
  }
  if (personal || (space && isPersonalSpace(space))) {
    const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
    const name = typeof meta.full_name === 'string' ? meta.full_name : null;
    const avatarUrl = typeof meta.avatar_url === 'string' ? meta.avatar_url : null;
    return <ParticipantAvatar person={{ name, email: user?.email ?? '', avatar_url: avatarUrl }} size={size} />;
  }
  return (
    <AgentPixelMark
      slug={`space:${space?.space_id ?? 'new'}`}
      size={size >= 44 ? 21 : 14}
      tile={size}
      radius={Math.round(size * 0.22)}
    />
  );
}
