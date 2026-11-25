'use client';

import { useSetWorkspaceBotPaused, useWorkspaceBots } from '@kortix/sdk/react';
import { PauseCircleIcon } from '@phosphor-icons/react';

import { useTranslations } from '../../i18n';
import { Button } from '../../primitives/button';
import { errorToast } from '../../primitives/toast';
import { SpaceView, type SpaceViewProps } from './space-view';

/**
 * A bot's chat (flag `kortix_bot`): the person's DM space with the agent.
 * While the bot is paused, a bar with Resume takes the composer's place:
 * messages would wait for a bot that starts nothing on its own.
 */
export function BotChatView({ agentName, ...props }: Omit<SpaceViewProps, 'target' | 'composer'> & { agentName: string }) {
  const bots = useWorkspaceBots(props.projectId);
  const bot = bots.data?.find((candidate) => candidate.name === agentName);
  return (
    <SpaceView
      {...props}
      target={{ kind: 'dm', agentName }}
      composer={bot?.status === 'paused' ? <BotPausedBar projectId={props.projectId} name={bot.name} label={bot.display_name} /> : undefined}
    />
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
