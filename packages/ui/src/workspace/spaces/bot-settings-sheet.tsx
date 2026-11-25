'use client';

import { type AgentConfigBlock, getWorkspaceDetail, type WorkspaceBot } from '@kortix/sdk';
import { contract, qk, useSetWorkspaceBotPaused } from '@kortix/sdk/react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { AgentModel, AgentScope } from '../../customize/agents/agent-detail-aside';
import { useTranslations } from '../../i18n';
import { useAgentConfig, useUpdateAgentConfig } from '../../internal/hooks/projects/use-agent-config';
import { uiRoutes } from '../../lib/routes';
import { Button } from '../../primitives/button';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '../../primitives/sheet';
import { Switch } from '../../primitives/switch';
import { Textarea } from '../../primitives/textarea';
import { errorToast } from '../../primitives/toast';
import { UiLink as Link } from '../../providers/ui-provider';

/**
 * A bot's settings (flag `kortix_bot`), opened from the gear in its chat
 * header. Every field is the agent's own config in kortix.yaml, edited where
 * the agent page edits it: the description through the agent config, the
 * model through the per-agent model default, the apps and secrets through
 * the agent's grants. Pause is the bot pause.
 */
export function BotSettingsSheet({
  projectId,
  bot,
  open,
  onOpenChange,
}: {
  projectId: string;
  bot: WorkspaceBot;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('spaces.bot.settings');
  const pause = useSetWorkspaceBotPaused(projectId);
  const detail = useQuery({
    queryKey: qk.project.detail(projectId),
    queryFn: () => getWorkspaceDetail(projectId),
    enabled: open,
    ...contract('config'),
  });
  const agent = detail.data?.config?.agents?.find((candidate) => candidate.name === bot.name);
  const paused = bot.status === 'paused';
  const adminPath = uiRoutes().admin(projectId, `agents/${encodeURIComponent(bot.name)}`);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>{t('title')}</SheetTitle>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-6">
          <dl className="grid grid-cols-[7rem_1fr] items-center gap-x-3 gap-y-3 text-sm">
            <dt className="text-muted-foreground">{t('agent')}</dt>
            <dd className="text-muted-foreground font-mono text-xs [overflow-wrap:anywhere]">{bot.name}</dd>
            <dt className="text-muted-foreground">{t('status')}</dt>
            <dd className="flex items-center gap-2">
              <Switch
                checked={!paused}
                disabled={pause.isPending || bot.status === 'off'}
                aria-label={t('active')}
                onCheckedChange={(on) =>
                  pause.mutate({ name: bot.name, paused: !on }, { onError: () => errorToast(t('pauseFailed')) })
                }
              />
              <span>{bot.status === 'off' ? t('off') : paused ? t('paused') : t('active')}</span>
            </dd>
          </dl>
          <BotDescription projectId={projectId} name={bot.name} />
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t('model')}</h3>
            <AgentModel projectId={projectId} agentName={bot.name} />
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t('apps')}</h3>
            <AgentScope projectId={projectId} agentName={bot.name} scope={agent?.scope} />
          </section>
          {adminPath ? (
            <Button asChild variant="outline" size="sm" className="self-start">
              <Link href={adminPath}>{t('allSettings')}</Link>
            </Button>
          ) : null}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

/** The agent's description: what the bot is for. Saved to its block in kortix.yaml. */
function BotDescription({ projectId, name }: { projectId: string; name: string }) {
  const config = useAgentConfig(projectId, name);
  const block = config.data?.block ?? null;
  const saved = block?.behavior?.description ?? '';
  // Keyed on the saved text: a save that lands, or a change from elsewhere, starts a fresh draft.
  return <BotDescriptionForm key={saved} projectId={projectId} name={name} saved={saved} block={config.data?.editable ? block : null} />;
}

function BotDescriptionForm({
  projectId,
  name,
  saved,
  block,
}: {
  projectId: string;
  name: string;
  saved: string;
  /** Null: the description is read-only (no block, or the server says not editable). */
  block: AgentConfigBlock | null;
}) {
  const t = useTranslations('spaces.bot.settings');
  const save = useUpdateAgentConfig(projectId, name);
  const [draft, setDraft] = useState(saved);
  return (
    <section className="flex flex-col gap-2">
      <label htmlFor="bot-description" className="text-sm font-medium">
        {t('description')}
      </label>
      <Textarea
        id="bot-description"
        value={draft}
        disabled={!block || save.isPending}
        rows={3}
        onChange={(event) => setDraft(event.target.value)}
      />
      {block && draft !== saved ? (
        <Button
          size="sm"
          className="self-start"
          disabled={save.isPending}
          onClick={() =>
            save.mutate(
              { ...block, behavior: { ...block.behavior, description: draft.trim() } },
              { onError: () => errorToast(t('saveFailed')) },
            )
          }
        >
          {t('save')}
        </Button>
      ) : null}
    </section>
  );
}
