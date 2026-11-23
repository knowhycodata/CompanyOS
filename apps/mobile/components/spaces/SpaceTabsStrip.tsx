/**
 * A space's tab row, web's `SpaceTabs`: Chat first (always, never stored),
 * then the space's stored tabs in order. Chat is the page under it; any
 * other tab opens where mobile shows its kind (`useOpenSpaceTab`). A long
 * press on a tab opens the space's details, where an editor renames, moves
 * and removes tabs. No tabs: no row.
 */
import type { ProjectSpace, ProjectSpaceTab } from '@kortix/sdk';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { haptics } from '@/lib/haptics';
import { type AppIcon, CardsThreeIcon, ChatCircleIcon, FileIcon, FolderIcon, GlobeIcon, SquaresFourIcon } from '@/lib/icons';
import { cn } from '@/lib/utils/index';

import { useOpenSpaceTab } from './use-open-space-tab';

const TAB_ICON: Record<ProjectSpaceTab['kind'], AppIcon> = {
  file: FileIcon,
  folder: FolderIcon,
  artifact: CardsThreeIcon,
  app: SquaresFourIcon,
  link: GlobeIcon,
};

export function spaceTabIcon(kind: ProjectSpaceTab['kind']): AppIcon {
  return TAB_ICON[kind];
}

function Chip({
  icon,
  label,
  selected,
  onPress,
  onLongPress,
}: {
  icon: AppIcon;
  label: string;
  selected: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      className={cn('h-9 flex-row items-center gap-1.5 rounded-full px-3.5', selected ? 'bg-secondary' : 'active:bg-foreground/5')}>
      <Icon as={icon} size={14} className={selected ? 'text-foreground' : 'text-muted-foreground'} />
      <Text variant="small" className={cn('leading-5', !selected && 'text-muted-foreground')} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function SpaceTabsStrip({
  projectId,
  space,
  onManageTabs,
}: {
  projectId: string;
  space: ProjectSpace;
  onManageTabs: () => void;
}) {
  const { t } = useTranslation();
  const tabs = space.tabs ?? [];
  const openTab = useOpenSpaceTab(projectId, space);
  if (tabs.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      contentContainerStyle={{ paddingHorizontal: 12, gap: 4 }}
      className="grow-0 pb-2">
      <Chip icon={ChatCircleIcon} label={t('spaces.tabs.chat')} selected onPress={() => undefined} />
      {tabs.map((tab) => (
        <Chip
          key={tab.id}
          icon={TAB_ICON[tab.kind]}
          label={tab.title}
          selected={false}
          onPress={() => {
            haptics.tap();
            openTab(tab);
          }}
          onLongPress={() => {
            haptics.selection();
            onManageTabs();
          }}
        />
      ))}
    </ScrollView>
  );
}
