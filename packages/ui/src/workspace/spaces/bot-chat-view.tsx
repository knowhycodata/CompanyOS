'use client';

import { useSetWorkspaceBotPaused, useWorkspaceBots } from '@kortix/sdk/react';
import { GearSixIcon, PauseCircleIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { useTranslations } from '../../i18n';
import { Button } from '../../primitives/button';
import { errorToast } from '../../primitives/toast';
import { BotSettingsSheet } from './bot-settings-sheet';
import { SpaceView, type SpaceViewProps } from './space-view';

/**
 * A bot's chat (flag `kortix_bot`): the person's DM space with the agent.
 * The gear at the right of the header opens the bot's settings. While the bot
 * is paused, a bar with Resume takes the composer's place: messages would wait
 * for a bot that starts nothing on its own.
 */
export function BotChatView({ agentName, ...props }: Omit<SpaceViewProps, 'target' | 'composer' | 'headerActions'> & { agentName: string }) {
  const t = useTranslations('spaces.bot.settings');
  const bots = useWorkspaceBots(props.projectId);
  const bot = bots.data?.find((candidate) => candidate.name === agentName);
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <>
      <SpaceView
        {...props}
        target={{ kind: 'dm', agentName }}
        composer={bot?.status === 'paused' ? <BotPausedBar projectId={props.projectId} name={bot.name} label={bot.display_name} /> : undefined}
        headerActions={
          bot ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('settingsButton')}
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen(true)}
            >
              <GearSixIcon />
            </Button>
          ) : null
        }
      />
      {bot ? <BotSettingsSheet projectId={props.projectId} bot={bot} open={settingsOpen} onOpenChange={setSettingsOpen} /> : null}
    </>
  );
}

/** "Marketing is paused." and Resume, where the composer was. */
function BotPausedBar({ projectId, name, label }: { projectId: string; name: string; label: string }) {
  const t = useTranslations('spaces.bot');
  const resume = useSetWorkspaceBotPaused(projectId);
  return (
    <div data-bot-paused="" className="shrink-0 px-5 pt-1 pb-4">
      <div className="border-border bg-muted/40 flex items-center gap-3 rounded-lg border px-3 py-2.5">
        <PauseCircleIcon aria-hidden className="text-muted-foreground size-4 shrink-0" />
        <p className="text-muted-foreground min-w-0 flex-1 text-sm">{t('pausedBar', { name: label })}</p>
        <Button
          size="sm"
          disabled={resume.isPending}
          onClick={() =>
            resume.mutate({ name, paused: false }, { onError: () => errorToast(t('resumeFailed', { name: label })) })
          }
        >
          {t('resume')}
        </Button>
      </div>
    </div>
  );
}
