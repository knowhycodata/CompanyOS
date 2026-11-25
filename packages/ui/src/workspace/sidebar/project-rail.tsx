'use client';

import { DotsThreeIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import type { MouseEvent, ReactNode } from 'react';

import { useTranslations } from '../../i18n';
import { SidebarGlyph as PanelLeft } from '../../icons/sidebar-toggle';
import { Home } from '../../internal/icons/home';
import { cn } from '../../lib/utils';
import { uiRoutes } from '../../lib/routes';
import { Button } from '../../primitives/button';
import Hint from '../../primitives/hint';
import { Kbd, KbdGroup } from '../../primitives/kbd';
import { useSidebar } from '../../primitives/sidebar';
import { useUiRouter } from '../../providers/ui-provider';

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
const modSymbol = isMac ? '⌘' : 'Ctrl';

/** What the panel beside the rail shows. Workspace settings follow the route (`/admin`), not this. */
export type RailSection = 'home' | 'more';

/**
 * The project's icon rail (desktop): fixed at the window's left edge, beside
 * the sidebar panel, and on screen whether the panel is open or not.
 *
 * Top: Home (the sessions), Search (the command palette), More (every other
 * page: Review, Customize, Drive, Apps, Calendar, Goals, Artifacts). Bottom:
 * Help, then the panel toggle. The toggle hides the panel, never the rail.
 *
 * Home and More choose what the panel shows. With the panel open, a click
 * switches it. With the panel collapsed, a hover summons it as a flyout on
 * that section (the sidebar's peek, the same hover intent as the old edge
 * strip), and a click switches the section without opening the panel.
 */
export function ProjectRail({
  projectId,
  section,
  onSection,
  onOpenSearch,
  help,
  settingsOpen,
}: {
  projectId: string;
  section: RailSection;
  onSection: (section: RailSection) => void;
  onOpenSearch?: () => void;
  /** The help menu's own icon trigger (apps/web passes `HelpMenu`). */
  help?: ReactNode;
  /** The route is workspace settings: the panel shows its list, so no section is current. */
  settingsOpen: boolean;
}) {
  const t = useTranslations('sidebar');
  const { state, toggleSidebar, peekEnter, peekLeave } = useSidebar();
  const router = useUiRouter();
  const collapsed = state === 'collapsed';

  // Collapsed: a hover shows the panel on this section. Open: the panel is already there.
  const hoverProps = (target: RailSection) =>
    collapsed
      ? {
          onPointerEnter: () => {
            onSection(target);
            peekEnter();
          },
          onPointerLeave: peekLeave,
        }
      : {};

  return (
    <nav
      aria-label={t('rail')}
      className="flex h-full w-full flex-col items-center gap-1 py-2"
    >
      {/* The desktop app's window controls sit in the top-left band (0 on the web): the rail starts below it. */}
      <div aria-hidden className="h-(--kx-titlebar-inset) shrink-0" />
      <RailButton
        label={t('home')}
        current={!settingsOpen && section === 'home'}
        {...hoverProps('home')}
        onClick={(event) => {
          onSection('home');
          if (event.metaKey || event.ctrlKey) return;
          router.push(uiRoutes().project(projectId));
        }}
      >
        <Home className="size-4" />
      </RailButton>
      {onOpenSearch ? (
        <RailButton
          label={
            <span className="flex items-center gap-1.5">
              {t('search')}
              <KbdGroup>
                <Kbd className="font-mono">{modSymbol}</Kbd>
                <Kbd className="font-mono">K</Kbd>
              </KbdGroup>
            </span>
          }
          ariaLabel={t('search')}
          onClick={() => onOpenSearch()}
        >
          <MagnifyingGlassIcon className="size-4" />
        </RailButton>
      ) : null}
      <RailButton
        label={t('more')}
        current={settingsOpen || section === 'more'}
        {...hoverProps('more')}
        onClick={() => onSection('more')}
      >
        <DotsThreeIcon weight="bold" className="size-4" />
      </RailButton>
      <div aria-hidden className="bg-border my-1 h-px w-5" />

      <div className="mt-auto flex flex-col items-center gap-1">
        {help}
        <RailButton
          label={
            <span className="flex items-center gap-1.5">
              {collapsed ? t('pin') : t('collapse')}
              <KbdGroup>
                <Kbd className="font-mono">{modSymbol}</Kbd>
                <Kbd className="font-mono">B</Kbd>
              </KbdGroup>
            </span>
          }
          ariaLabel={collapsed ? t('pin') : t('collapse')}
          onClick={(event) => toggleSidebar(event)}
        >
          <PanelLeft className="cn-rtl-flip" />
        </RailButton>
      </div>
    </nav>
  );
}

/** One rail control: a 32px icon button with its name in a hint on the right. Hover changes color only. */
function RailButton({
  label,
  ariaLabel,
  current,
  onClick,
  onPointerEnter,
  onPointerLeave,
  children,
}: {
  label: ReactNode;
  /** Required when `label` is not plain text. */
  ariaLabel?: string;
  current?: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  children: ReactNode;
}) {
  return (
    <Hint side="right" label={label}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
        aria-current={current ? 'page' : undefined}
        onClick={onClick}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        className={cn('text-muted-foreground hover:text-foreground shrink-0', current && 'bg-sidebar-accent text-foreground')}
      >
        {children}
      </Button>
    </Hint>
  );
}
