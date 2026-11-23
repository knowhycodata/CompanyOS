/**
 * Project managers: the private channels they are not in (web
 * `PrivateChannelsNotIn`). Each row shows its people count and creator; a tap
 * archives it or restores an archived one. Renaming and adding people to a
 * channel you are not in stay on web.
 */
import type { PrivateChannelSummary } from '@kortix/sdk';
import { PROJECT_ACTIONS } from '@kortix/sdk';
import { useCan, usePrivateChannelsNotIn, useUpdateWorkspaceSpace } from '@kortix/sdk/react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useConfirmDialog } from '@/components/kortix/confirm-dialog';
import { PageHeader } from '@/components/kortix/page-header';
import { SettingsGroup, SettingsRow } from '@/components/kortix/settings-list';
import { useToast } from '@/components/kortix/toast-provider';
import { KortixLoader } from '@/components/kortix/kortix-loader';
import { Text } from '@/components/ui/text';
import { haptics } from '@/lib/haptics';
import { LockIcon } from '@/lib/icons';

export function PrivateSpacesNotInPage({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const manager = useCan({ projectId }, PROJECT_ACTIONS.PROJECT_MEMBERS_MANAGE).allowed === true;
  const list = usePrivateChannelsNotIn(projectId, { enabled: manager });
  const update = useUpdateWorkspaceSpace(projectId);

  const onRow = (channel: PrivateChannelSummary) => {
    const archive = channel.archived_at === null;
    confirm({
      title: archive ? t('spaces.privateNotIn.archiveTitle', { name: `#${channel.slug}` }) : t('spaces.privateNotIn.restoreTitle', { name: `#${channel.slug}` }),
      confirmLabel: archive ? t('spaces.details.archive') : t('spaces.privateNotIn.restore'),
      destructive: archive,
      onConfirm: () =>
        update.mutate(
          { spaceId: channel.space_id, input: { archived: archive } },
          {
            onSuccess: () => haptics.success(),
            onError: () => {
              haptics.warning();
              toast.error(t('spaces.privateNotIn.failed', { name: `#${channel.slug}` }));
            },
          },
        ),
    });
  };

  const rows = manager ? (list.data ?? []) : [];
  return (
    <View className="flex-1 bg-background">
      <PageHeader title={t('spaces.privateNotIn.title')} onBack={onBack} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 24, gap: 12 }}>
        <Text variant="muted" className="px-4">
          {t('spaces.privateNotIn.description')}
        </Text>
        {list.isLoading ? (
          <View className="items-center py-8">
            <KortixLoader />
          </View>
        ) : list.isError ? (
          <Text variant="muted" className="px-4">
            {t('spaces.loadFailed')}
          </Text>
        ) : rows.length === 0 ? (
          <Text variant="muted" className="px-4">
            {t('spaces.privateNotIn.empty')}
          </Text>
        ) : (
          <SettingsGroup>
            {rows.map((channel) => (
              <SettingsRow
                key={channel.space_id}
                icon={LockIcon}
                label={`#${channel.slug}`}
                description={
                  channel.created_by_name
                    ? t('spaces.privateNotIn.meta', { count: channel.member_count, name: channel.created_by_name })
                    : t('spaces.privateNotIn.metaNoCreator', { count: channel.member_count })
                }
                value={channel.archived_at !== null ? t('spaces.privateNotIn.archived') : undefined}
                onPress={() => onRow(channel)}
                right={null}
              />
            ))}
          </SettingsGroup>
        )}
      </ScrollView>
      {dialog}
    </View>
  );
}
