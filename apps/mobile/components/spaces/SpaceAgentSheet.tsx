/**
 * One agent of a channel, for its editor (web's agent row menu): Make default
 * (it moves first: a new thread starts on it) and Remove from the channel.
 */
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { SettingsGroup, SettingsRow } from '@/components/kortix/settings-list';
import { KortixBottomSheetModal, useContentSheetBottomInset } from '@/components/kortix/sheet';
import { SheetScrollView } from '@/components/kortix/sheet-parts';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { StarIcon, TrashIcon } from '@/lib/icons';
import { agentLabel } from '@/lib/spaces/space-model';

export interface SpaceAgentSheetRef {
  open: (agent: string) => void;
}

export const SpaceAgentSheet = React.forwardRef<
  SpaceAgentSheetRef,
  { agents: readonly string[]; onMakeDefault: (agent: string) => void; onRemove: (agent: string) => void }
>(function SpaceAgentSheet({ agents, onMakeDefault, onRemove }, ref) {
  const { t } = useTranslation();
  const modalRef = React.useRef<BottomSheetModal>(null);
  const [agent, setAgent] = React.useState<string | null>(null);
  const bottomInset = useContentSheetBottomInset();
  React.useImperativeHandle(ref, () => ({
    open: (name) => {
      setAgent(name);
      modalRef.current?.present();
    },
  }));
  const act = (run: (name: string) => void) => () => {
    if (!agent) return;
    modalRef.current?.dismiss();
    run(agent);
  };
  const isDefault = agent !== null && agents[0] === agent;
  return (
    <KortixBottomSheetModal ref={modalRef} title={agent ? agentLabel(agent) : ''} enableDynamicSizing enablePanDownToClose>
      <SheetScrollView contentContainerStyle={{ paddingBottom: Math.max(bottomInset, 16) + 8 }}>
        <View className="px-4">
          <SettingsGroup>
            {!isDefault ? <SettingsRow icon={StarIcon} label={t('spaces.details.makeDefault')} onPress={act(onMakeDefault)} right={null} /> : null}
            <SettingsRow icon={TrashIcon} label={t('spaces.details.removeAgent')} onPress={act(onRemove)} destructive right={null} />
          </SettingsGroup>
        </View>
      </SheetScrollView>
    </KortixBottomSheetModal>
  );
});
