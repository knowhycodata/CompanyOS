'use client';

import type { WorkspaceBot } from '@kortix/sdk';
import { useProjectSessions, useWorkspaceBots } from '@kortix/sdk/react';
import { PauseCircleIcon } from '@phosphor-icons/react';
import { useMemo } from 'react';

import { useTranslations } from '../../i18n';
import { AgentMark } from '../../internal/components/agent-mark';
import { HoverPrefetchLink } from '../../internal/components/hover-prefetch-link';
import { useIsMobile } from '../../internal/hooks';
import { uiRoutes } from '../../lib/routes';
import { SidebarMenuButton, SidebarMenuItem, useSidebar } from '../../primitives/sidebar';
import { spacePreview } from '../spaces/space-identity';

/** `href`, or a page under it. */
function isAt(pathname: string | null, href: string): boolean {
  return !!pathname && (pathname === href || pathname.startsWith(`${href}/`));
}

/**
 * The Bots rows of the sidebar (flag `kortix_bot`): one row per agent the
 * person can message, after their own space. My Kortix is that space, so it
 * is not repeated here. A row opens the bot's chat (`/dm/<agent>`). Rows
 * render once the list arrives; nothing renders while the flag is off.
 */
export function ProjectBotsRows({
  projectId,
  pathname,
  enabled,
  names,
}: {
  projectId: string;
  pathname: string | null;
  enabled: boolean;
  names: (text: string) => string;
}) {
  const t = useTranslations('sidebar.bots');
  const bots = useWorkspaceBots(projectId, { enabled });
  const shown = (bots.data ?? []).filter((bot) => !bot.builtin);
  if (!enabled || shown.length === 0) return null;
  return (
    <>
      <li className="text-muted-foreground px-2 pt-3 pb-1 text-xs" role="presentation">
        {t('title')}
      </li>
      {shown.map((bot) => {
        const href = uiRoutes().dm(projectId, bot.name);
        return <BotRow key={bot.name} projectId={projectId} bot={bot} href={href} active={isAt(pathname, href)} names={names} />;
      })}
    </>
  );
}

/**
 * One bot: its pixel mark, its name, and under it its newest message, or why
 * it does not answer (Paused, Off). Same geometry as a space row.
 */
function BotRow({
  projectId,
  bot,
  href,
  active,
  names,
}: {
  projectId: string;
  bot: WorkspaceBot;
  href: string;
  active: boolean;
  names: (text: string) => string;
}) {
  const t = useTranslations('sidebar.bots');
  const isMobile = useIsMobile();
  const { setOpenMobile } = useSidebar();
  // The chat's thread list: the same cache entry the bot's chat reads.
  const threads = useProjectSessions(projectId, { spaceId: bot.chat_space_id ?? undefined, parent: 'root', enabled: !!bot.chat_space_id });
  const preview = useMemo(() => spacePreview(threads.sessions, names), [threads.sessions, names]);
  const note = bot.status === 'paused' ? t('paused') : bot.status === 'off' ? t('off') : (preview ?? t('noMessages'));
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        size="lg"
        isActive={active}
        tooltip={bot.display_name}
        className="text-sidebar-foreground gap-2.5 px-2 [&_[data-slot=agent-mark]>svg]:size-auto! [&_[data-slot=bot-paused]]:size-3!"
      >
        <HoverPrefetchLink
          href={href}
          onClick={() => {
            if (isMobile) setOpenMobile(false);
          }}
        >
          <AgentMark slug={bot.name} size={21} tile={29} label={bot.display_name} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex min-w-0 items-center gap-1">
              <span className="truncate">{bot.display_name}</span>
              {bot.status === 'paused' ? (
                <PauseCircleIcon data-slot="bot-paused" role="img" aria-label={t('paused')} className="text-muted-foreground" />
              ) : null}
            </span>
            <span className="text-muted-foreground truncate text-xs font-normal">{note}</span>
          </span>
        </HoverPrefetchLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
