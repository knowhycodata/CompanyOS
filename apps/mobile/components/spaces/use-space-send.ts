import { getProjectSession, type ProjectSession } from '@kortix/sdk';
import { splitPastedContent } from '@kortix/shared';
import { useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useCallback, useRef, useState } from 'react';

import { useToast } from '@/components/kortix/toast-provider';
import type { ProjectHomeSubmit } from '@/components/session/ProjectHome';
import { useAuthContext } from '@/contexts';
import { log } from '@/lib/logger';
import { requestPushPermissionOnce } from '@/lib/notifications/registration';
import { listCreatedSession, projectKeys, useCreateProjectSession } from '@/lib/projects/hooks';
import { draftKey } from '@/lib/session/composer-draft';
import { createSessionCommitted } from '@/lib/session/create-session';
import { newSessionCreateInput } from '@/lib/session/new-session-input';
import { applyToSessionCache, createdSessionListRow, upsertIntoSessionCache, withoutSession, writeSessionLists } from '@/lib/session/session-cache-write';
import { clearComposerDraftIfSent } from '@/stores/composer-draft-store';

/** The filter of a space's thread list: its top-level sessions (`space_id`). */
export function spaceThreadsFilter(spaceId: string) {
  return { parent: 'root' as const, spaceId };
}

/**
 * A space composer's send (web's `useProjectHomeSend({ space })`): each
 * message is a new thread, one session filed in the space (`space_id`). The
 * row shows in the space's list at once (`provisioning`, no reply yet, the
 * viewer as its author), before the create answers; a failed create takes it
 * out again. The composer stays on screen for the next message: a phone is
 * a narrow window, where web leaves the new thread closed too.
 */
export function useSpaceSend(projectId: string, spaceId: string | null, options: { showUpgradeForError: (error: unknown) => boolean }) {
  const { showUpgradeForError } = options;
  const createProjectSession = useCreateProjectSession(projectId);
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user } = useAuthContext();
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);

  const send = useCallback(
    async ({ text, fileParts, files, model, picks, agent }: ProjectHomeSubmit): Promise<boolean> => {
      if (!projectId || !spaceId || sendingRef.current) return false;
      if (!text.trim() && files.length === 0) return false;
      sendingRef.current = true;
      setSending(true);
      const mintedId = Crypto.randomUUID();
      const listKey = projectKeys.projectSessionsPaged(projectId, spaceThreadsFilter(spaceId));
      // A poll that lands after the seed would drop the optimistic row.
      await queryClient.cancelQueries({ queryKey: listKey });
      const at = new Date().toISOString();
      const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
      const name = typeof metadata.full_name === 'string' ? metadata.full_name : typeof metadata.name === 'string' ? metadata.name : null;
      const row = {
        session_id: mintedId,
        account_id: '',
        project_id: projectId,
        space_id: spaceId,
        branch_name: '',
        base_ref: '',
        sandbox_provider: null,
        sandbox_id: null,
        sandbox_url: null,
        runtime_session_id: null,
        runtime_sessions: [],
        name: null,
        custom_name: null,
        agent_name: agent,
        status: 'provisioning',
        error: null,
        metadata: {},
        first_prompt: text,
        reply_count: 0,
        parent_session_id: null,
        created_by: user?.id ?? null,
        owner_email: user?.email ?? null,
        owner_name: name,
        owner_avatar_url: typeof metadata.avatar_url === 'string' ? metadata.avatar_url : null,
        owner_type: 'user',
        is_owner: true,
        created_at: at,
        updated_at: at,
      } as unknown as ProjectSession;
      writeSessionLists(queryClient, [listKey], (cached) => upsertIntoSessionCache(cached, row));
      try {
        const input = newSessionCreateInput({
          sessionId: mintedId,
          text,
          fileParts,
          fileNames: files.map((f) => f.name),
          model,
          picks,
          agent,
        });
        await createSessionCommitted(
          {
            create: (body) => createProjectSession.mutateAsync(body),
            read: async (id) => {
              const created = await getProjectSession(projectId, id, { showErrors: false });
              listCreatedSession(queryClient, projectId, created);
              // A poll during the create may have dropped the seed: put the server row back.
              const listed = createdSessionListRow(created, projectId);
              if (listed) writeSessionLists(queryClient, [listKey], (cached) => upsertIntoSessionCache(cached, listed));
              return created;
            },
          },
          { ...input, session_id: mintedId, space_id: spaceId },
        );
        void queryClient.invalidateQueries({ queryKey: listKey });
        clearComposerDraftIfSent(draftKey({ kind: 'space', spaceId }), splitPastedContent(text).text);
        void requestPushPermissionOnce();
        return true;
      } catch (err: any) {
        writeSessionLists(queryClient, [listKey], (cached) => applyToSessionCache<ProjectSession>(cached, (rows) => withoutSession(rows, mintedId)));
        if (showUpgradeForError(err)) return false;
        log.error('❌ [Space] Send failed:', err?.message || err);
        toast.error(err?.message || 'Message not sent');
        return false;
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    },
    [projectId, spaceId, queryClient, user, createProjectSession, showUpgradeForError, toast],
  );

  return { sending, send };
}
