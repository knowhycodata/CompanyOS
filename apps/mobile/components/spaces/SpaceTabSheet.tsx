/**
 * A space's tab editor. `add()` adds a link (an https URL) or a Drive folder
 * (a path); mobile has no Drive, app or artifact picker, so those tabs are
 * added on web. `edit(tab)` renames, moves and removes one tab.
 */
import type { ProjectSpace, ProjectSpaceTab } from '@kortix/sdk';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, View } from 'react-native';

import { SettingsGroup, SettingsRow } from '@/components/kortix/settings-list';
import { KortixBottomSheetModal, useContentSheetBottomInset } from '@/components/kortix/sheet';
import { SheetScrollView } from '@/components/kortix/sheet-parts';
import { SheetTextInput } from '@/components/kortix/SheetInput';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { haptics } from '@/lib/haptics';
import { ArrowDownIcon, ArrowUpIcon, FolderIcon, GlobeIcon, TrashIcon } from '@/lib/icons';
import { appendTab, folderTitle, isLinkUrl, linkTitle, newTabId, normalizeFolderPath, tabTitle } from '@/lib/spaces/space-tabs';

export interface SpaceTabSheetRef {
  add: () => void;
  edit: (tab: ProjectSpaceTab) => void;
}

interface Props {
  projectId: string;
  space: ProjectSpace;
  tabs: readonly ProjectSpaceTab[];
  onSave: (tabs: ProjectSpaceTab[]) => void;
  onRename: (id: string, title: string) => void;
  onMove: (id: string, by: -1 | 1) => void;
  onRemove: (id: string) => void;
}

type State = { mode: 'add'; kind: 'link' | 'folder' | null } | { mode: 'edit'; tab: ProjectSpaceTab } | null;

export const SpaceTabSheet = React.forwardRef<SpaceTabSheetRef, Props>(function SpaceTabSheet(
  { tabs, onSave, onRename, onMove, onRemove },
  ref,
) {
  const { t } = useTranslation();
  const modalRef = React.useRef<BottomSheetModal>(null);
  const bottomInset = useContentSheetBottomInset();
  const [state, setState] = React.useState<State>(null);
  const [text, setText] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useImperativeHandle(ref, () => ({
    add: () => {
      setState({ mode: 'add', kind: null });
      setText('');
      setTitle('');
      setError(null);
      modalRef.current?.present();
    },
    edit: (tab) => {
      setState({ mode: 'edit', tab });
      setTitle(tab.title);
      setError(null);
      modalRef.current?.present();
    },
  }));

  const close = () => {
    Keyboard.dismiss();
    modalRef.current?.dismiss();
  };

  const submitAdd = (kind: 'link' | 'folder') => {
    const value = text.trim();
    if (kind === 'link') {
      if (!isLinkUrl(value)) {
        setError(t('spaces.tabs.errorLink'));
        return;
      }
      onSave(appendTab(tabs, { id: newTabId('link', tabs), kind: 'link', ref: value, title: tabTitle(title, linkTitle(value)) }));
    } else {
      const path = normalizeFolderPath(value);
      if (!path) {
        setError(t('spaces.tabs.errorFolder'));
        return;
      }
      onSave(appendTab(tabs, { id: newTabId('folder', tabs), kind: 'folder', ref: path, title: tabTitle(title, folderTitle(path)) }));
    }
    haptics.success();
    close();
  };

  const index = state?.mode === 'edit' ? tabs.findIndex((tab) => tab.id === state.tab.id) : -1;
  const sheetTitle =
    state?.mode === 'edit'
      ? state.tab.title
      : state?.kind === 'link'
        ? t('spaces.tabs.addLink')
        : state?.kind === 'folder'
          ? t('spaces.tabs.addFolder')
          : t('spaces.tabs.add');

  return (
    <KortixBottomSheetModal
      ref={modalRef}
      title={sheetTitle}
      enableDynamicSizing
      enablePanDownToClose
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore">
      <SheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: Math.max(bottomInset, 16) + 8 }}>
        <View className="gap-4 px-4">
          {state?.mode === 'add' && state.kind === null ? (
            <>
              <SettingsGroup>
                <SettingsRow icon={GlobeIcon} label={t('spaces.tabs.addLink')} onPress={() => setState({ mode: 'add', kind: 'link' })} />
                <SettingsRow icon={FolderIcon} label={t('spaces.tabs.addFolder')} onPress={() => setState({ mode: 'add', kind: 'folder' })} />
              </SettingsGroup>
              <Text variant="muted" className="px-4">
                {t('spaces.tabs.moreOnWeb')}
              </Text>
            </>
          ) : null}
          {state?.mode === 'add' && state.kind !== null ? (
            <>
              <SheetTextInput
                value={text}
                onChangeText={(next) => {
                  setText(next);
                  if (error) setError(null);
                }}
                placeholder={state.kind === 'link' ? 'https://' : t('spaces.tabs.folderPlaceholder')}
                accessibilityLabel={state.kind === 'link' ? t('spaces.tabs.addLink') : t('spaces.tabs.addFolder')}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType={state.kind === 'link' ? 'url' : 'default'}
                autoFocus
              />
              <SheetTextInput
                value={title}
                onChangeText={setTitle}
                placeholder={t('spaces.tabs.titlePlaceholder')}
                accessibilityLabel={t('spaces.tabs.titlePlaceholder')}
                maxLength={60}
                returnKeyType="done"
                onSubmitEditing={() => submitAdd(state.kind as 'link' | 'folder')}
              />
              {error ? (
                <Text variant="small" className="px-4 leading-5 text-destructive">
                  {error}
                </Text>
              ) : null}
              <Button size="lg" className="rounded-full" onPress={() => submitAdd(state.kind as 'link' | 'folder')}>
                <Text>{t('spaces.tabs.addButton')}</Text>
              </Button>
            </>
          ) : null}
          {state?.mode === 'edit' ? (
            <>
              <SheetTextInput
                value={title}
                onChangeText={setTitle}
                placeholder={t('spaces.tabs.titlePlaceholder')}
                accessibilityLabel={t('spaces.tabs.rename')}
                maxLength={60}
                returnKeyType="done"
              />
              <Button
                size="lg"
                className="rounded-full"
                disabled={!title.trim() || title.trim() === state.tab.title}
                onPress={() => {
                  onRename(state.tab.id, tabTitle(title, state.tab.title));
                  close();
                }}>
                <Text>{t('spaces.tabs.rename')}</Text>
              </Button>
              <SettingsGroup>
                {index > 0 ? (
                  <SettingsRow icon={ArrowUpIcon} label={t('spaces.tabs.moveLeft')} onPress={() => (onMove(state.tab.id, -1), close())} right={null} />
                ) : null}
                {index >= 0 && index < tabs.length - 1 ? (
                  <SettingsRow icon={ArrowDownIcon} label={t('spaces.tabs.moveRight')} onPress={() => (onMove(state.tab.id, 1), close())} right={null} />
                ) : null}
                <SettingsRow icon={TrashIcon} label={t('spaces.tabs.remove')} destructive onPress={() => (onRemove(state.tab.id), close())} right={null} />
              </SettingsGroup>
            </>
          ) : null}
        </View>
      </SheetScrollView>
    </KortixBottomSheetModal>
  );
});
