/**
 * New space, and a channel's rename (web `CreateChannelDialog`): a name (80
 * characters) with its `#slug` under it as you type, a description (160),
 * and "Private" when this deployment allows private spaces. The errors are
 * the server's: an empty or slug-less name, a taken slug (with the space it
 * names), private spaces turned off. A created space opens on the home with
 * its Add sheet, as web opens `?details=add`.
 */
import { ApiError, type ProjectSpace } from '@kortix/sdk';
import { useCreateWorkspaceSpace, usePrivateChannelsAvailable, useUpdateWorkspaceSpace } from '@kortix/sdk/react';
import { spaceSlug } from '@kortix/shared';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, View } from 'react-native';

import { KortixBottomSheetModal, useContentSheetBottomInset, useSheetHandle, type SheetRef } from '@/components/kortix/sheet';
import { SheetScrollView } from '@/components/kortix/sheet-parts';
import { SheetTextInput } from '@/components/kortix/SheetInput';
import { Switch } from '@/components/kortix/switch';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { haptics } from '@/lib/haptics';
import { useActiveSpaceStore } from '@/stores/active-space-store';

export const SPACE_NAME_MAX = 80;
export const SPACE_DESCRIPTION_MAX = 160;

export type CreateSpaceSheetRef = SheetRef;

type FormError = 'empty' | 'invalid' | 'taken' | 'unavailable' | 'failed';

/** The server's refusal as the form says it. A taken slug carries the space it names. */
export function spaceFormError(err: unknown): { kind: FormError; existingId?: string } {
  if (err instanceof ApiError) {
    const data = (err as ApiError & { data?: { space_id?: unknown } }).data;
    if (err.status === 409 && err.code === 'slug_taken') {
      return { kind: 'taken', existingId: typeof data?.space_id === 'string' ? data.space_id : undefined };
    }
    if (err.status === 400 && err.code === 'invalid_name') return { kind: 'invalid' };
    if (err.status === 409 && err.code === 'private_channels_unavailable') return { kind: 'unavailable' };
  }
  return { kind: 'failed' };
}

interface CreateSpaceSheetProps {
  projectId: string;
  /** Edit this channel's name and description instead of creating one. */
  space?: ProjectSpace | null;
  /** A new space: its id. Not called for an edit. */
  onCreated?: (spaceId: string) => void;
}

export const CreateSpaceSheet = React.forwardRef<CreateSpaceSheetRef, CreateSpaceSheetProps>(function CreateSpaceSheet(
  { projectId, space, onCreated },
  ref,
) {
  const { t } = useTranslation();
  const editing = !!space;
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [isPrivate, setIsPrivate] = React.useState(false);
  const [error, setError] = React.useState<{ kind: FormError; existingId?: string } | null>(null);
  const reset = React.useCallback(() => {
    setName(space?.name ?? '');
    setDescription(space?.description ?? '');
    setIsPrivate(false);
    setError(null);
  }, [space]);
  const modalRef = useSheetHandle(ref, reset);
  const bottomInset = useContentSheetBottomInset();
  const privateAvailable = usePrivateChannelsAvailable(projectId).data === true;
  const create = useCreateWorkspaceSpace(projectId);
  const update = useUpdateWorkspaceSpace(projectId);
  const pending = create.isPending || update.isPending;
  const slug = spaceSlug(name);

  const submit = React.useCallback(() => {
    if (pending) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError({ kind: 'empty' });
      return;
    }
    if (!slug) {
      setError({ kind: 'invalid' });
      return;
    }
    Keyboard.dismiss();
    setError(null);
    const fail = (err: unknown) => {
      haptics.warning();
      setError(spaceFormError(err));
    };
    if (space) {
      const input = {
        ...(trimmed !== space.name ? { name: trimmed } : {}),
        ...((description.trim() || null) !== (space.description ?? null) ? { description: description.trim() || null } : {}),
      };
      if (Object.keys(input).length === 0) {
        modalRef.current?.dismiss();
        return;
      }
      update.mutate(
        { spaceId: space.space_id, input },
        {
          onSuccess: () => {
            haptics.success();
            modalRef.current?.dismiss();
          },
          onError: fail,
        },
      );
      return;
    }
    create.mutate(
      {
        name: trimmed,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(isPrivate ? { visibility: 'private' as const } : {}),
      },
      {
        onSuccess: (created) => {
          haptics.success();
          modalRef.current?.dismiss();
          onCreated?.(created.space_id);
        },
        onError: fail,
      },
    );
  }, [pending, name, slug, description, isPrivate, space, create, update, modalRef, onCreated]);

  const openExisting = React.useCallback(() => {
    if (!error?.existingId) return;
    modalRef.current?.dismiss();
    useActiveSpaceStore.getState().setActiveSpace(projectId, error.existingId);
  }, [error, modalRef, projectId]);

  const errorText = error
    ? {
        empty: t('spaces.form.errorEmpty'),
        invalid: t('spaces.form.errorInvalid'),
        taken: t('spaces.form.errorTaken', { name: `#${slug}` }),
        unavailable: t('spaces.form.errorUnavailable'),
        failed: editing ? t('spaces.form.errorSaveFailed') : t('spaces.form.errorCreateFailed'),
      }[error.kind]
    : null;

  return (
    <KortixBottomSheetModal
      ref={modalRef}
      title={editing ? t('spaces.form.editTitle') : t('spaces.form.createTitle')}
      enableDynamicSizing
      enablePanDownToClose
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore">
      <SheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: Math.max(bottomInset, 16) + 8 }}>
        <View className="gap-4 px-4">
          <View className="gap-1.5">
            <SheetTextInput
              value={name}
              onChangeText={(next) => {
                setName(next);
                if (error) setError(null);
              }}
              placeholder={t('spaces.form.namePlaceholder')}
              accessibilityLabel={t('spaces.form.name')}
              autoFocus
              maxLength={SPACE_NAME_MAX}
              returnKeyType="next"
            />
            <Text variant="muted" className="px-4">
              {slug ? `#${slug}` : t('spaces.form.slugHint')}
            </Text>
          </View>
          <SheetTextInput
            value={description}
            onChangeText={setDescription}
            placeholder={t('spaces.form.descriptionPlaceholder')}
            accessibilityLabel={t('spaces.form.description')}
            maxLength={SPACE_DESCRIPTION_MAX}
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          {!editing && privateAvailable ? (
            <View className="flex-row items-center justify-between gap-3 px-4">
              <View className="flex-1">
                <Text>{t('spaces.form.private')}</Text>
                <Text variant="muted">{t('spaces.form.privateHint')}</Text>
              </View>
              <Switch checked={isPrivate} onCheckedChange={setIsPrivate} accessibilityLabel={t('spaces.form.private')} />
            </View>
          ) : null}
          {errorText ? (
            <View className="gap-1 px-4">
              <Text variant="small" className="leading-5 text-destructive">
                {errorText}
              </Text>
              {error?.kind === 'taken' && error.existingId ? (
                <Button variant="link" size="sm" className="self-start px-0" onPress={openExisting}>
                  <Text>{t('spaces.form.openExisting')}</Text>
                </Button>
              ) : null}
            </View>
          ) : null}
          <Button size="lg" className="rounded-full" disabled={pending} onPress={submit}>
            <Text>{pending ? t('spaces.form.saving') : editing ? t('spaces.form.save') : t('spaces.form.create')}</Text>
          </Button>
        </View>
      </SheetScrollView>
    </KortixBottomSheetModal>
  );
});
