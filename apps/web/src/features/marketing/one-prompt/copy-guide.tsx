'use client';

import { cn } from '@kortix/ui';
import { Claude } from '@kortix/ui/internal/icons/claude';
import { Codex } from '@kortix/ui/internal/icons/codex';
import { SolidCheckIcon } from '@kortix/ui/internal/icons/solid-check-icon';
import { Kbd } from '@kortix/ui/kbd';
import { Modal, ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from '@kortix/ui/modal';
import { CopySimpleIcon, TerminalWindowIcon } from '@phosphor-icons/react';
import { createContext, useCallback, useContext, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

import { MarketingButton } from '@/features/marketing/kit/marketing-button';

/**
 * The coding agents the dialog names, each with the command that starts it in
 * a terminal. Each command is the `bin` of the agent's npm package, checked
 * 2026-11-18: @anthropic-ai/claude-code → claude, @openai/codex → codex,
 * opencode-ai → opencode, @mariozechner/pi-coding-agent → pi. "Other" covers
 * any agent with a shell (Cursor among them), without a command we cannot vouch for.
 */
const AGENTS = [
  { id: 'claude', name: 'Claude Code', command: 'claude' },
  { id: 'codex', name: 'Codex', command: 'codex' },
  { id: 'opencode', name: 'OpenCode', command: 'opencode' },
  { id: 'pi', name: 'pi', command: 'pi' },
  { id: 'other', name: 'Other', command: null },
] as const;
type AgentId = (typeof AGENTS)[number]['id'];

/** The reader's last pick, so the dialog opens on their agent next time. */
const AGENT_KEY = 'loopmaxxing.agent';

function readAgent(): AgentId {
  try {
    const stored = window.localStorage.getItem(AGENT_KEY);
    return AGENTS.find((agent) => agent.id === stored)?.id ?? 'claude';
  } catch {
    return 'claude';
  }
}

function saveAgent(id: AgentId) {
  try {
    window.localStorage.setItem(AGENT_KEY, id);
  } catch {
    // A private window or blocked storage: the pick lasts until the page closes.
  }
}

const noSubscription = () => () => {};

/** ⌘ on a Mac, Ctrl elsewhere: the key that pastes. */
function usePasteModifier(): string {
  return useSyncExternalStore(noSubscription, () => (/Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl'), () => '⌘');
}

/** True on a touch-first device: the prompt runs on a computer, not here. */
function useTouchFirst(): boolean {
  return useSyncExternalStore(noSubscription, () => window.matchMedia('(pointer: coarse)').matches, () => false);
}

type CopyGuide = { open: (text: string) => void };

const CopyGuideContext = createContext<CopyGuide | null>(null);

/** Opens the "what now" dialog after a copy. Null outside the provider: the button then only copies. */
export function useCopyGuide(): CopyGuide | null {
  return useContext(CopyGuideContext);
}

/** Set on the dialog while it is open: the page's C key does not copy again under it. */
export const COPY_GUIDE_ATTR = 'data-copy-guide';

/**
 * The page's guide after every Copy prompt: the prompt is on the clipboard,
 * then three steps to run it in the reader's coding agent. One dialog for the
 * whole page; each button opens it with the text it copied. Closing it puts
 * focus back on the button that opened it.
 */
export function CopyGuideProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const open = useCallback((copied: string) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setText(copied);
  }, []);
  const close = () => {
    setText(null);
    // After the close animation starts, so the dialog's own focus handling does not take it back.
    requestAnimationFrame(() => opener.current?.focus());
  };
  return (
    <CopyGuideContext.Provider value={{ open }}>
      {children}
      <Modal open={text !== null} onOpenChange={(next) => !next && close()}>
        <ModalContent {...{ [COPY_GUIDE_ATTR]: '' }} className="sm:max-w-md">
          {text !== null ? <GuideBody text={text} onDone={close} /> : null}
        </ModalContent>
      </Modal>
    </CopyGuideContext.Provider>
  );
}

function GuideBody({ text, onDone }: { text: string; onDone: () => void }) {
  const [agentId, setAgentId] = useState<AgentId>(readAgent);
  const agent = AGENTS.find((item) => item.id === agentId)!;
  const paste = usePasteModifier();
  const touch = useTouchFirst();
  const pick = (id: AgentId) => {
    setAgentId(id);
    saveAgent(id);
  };
  return (
    <>
      <ModalHeader>
        <ModalTitle className="inline-flex items-center gap-2">
          <SolidCheckIcon aria-hidden className="size-4.5" />
          Prompt copied
        </ModalTitle>
        <ModalDescription>Run it in your coding agent, inside your repo.</ModalDescription>
      </ModalHeader>
      <div className="flex flex-col gap-5 px-6 pb-2">
        <div role="radiogroup" aria-label="Your coding agent" className="bg-muted/60 flex flex-wrap gap-1 rounded-lg p-1">
          {AGENTS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={item.id === agentId}
              onClick={() => pick(item.id)}
              className={cn(
                'duration-fast inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm whitespace-nowrap transition-colors',
                item.id === agentId ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <AgentGlyph id={item.id} />
              {item.name}
            </button>
          ))}
        </div>
        <ol className="flex flex-col gap-4 text-sm">
          <Step n={1}>
            {touch ? (
              <span>Open this page on your computer. The prompt runs there, in a terminal.</span>
            ) : agent.command ? (
              <>
                <span>Open a terminal in your repo and start {agent.name}.</span>
                <CommandLine command={agent.command} />
              </>
            ) : (
              <span>Open your coding agent in your repo. Any agent that can run shell commands works.</span>
            )}
          </Step>
          <Step n={2}>
            <span className="inline-flex flex-wrap items-center gap-1.5">
              Paste the prompt with
              <Kbd>{paste}</Kbd>
              <Kbd>V</Kbd>
              and press
              <Kbd>Enter</Kbd>
            </span>
          </Step>
          <Step n={3}>
            <span>It sets up the factory with you and ends with one real run.</span>
          </Step>
        </ol>
      </div>
      <ModalFooter className="sm:justify-between">
        <CopyAgain text={text} />
        <MarketingButton type="button" variant="primary" size="md" onClick={onDone}>
          Done
        </MarketingButton>
      </ModalFooter>
    </>
  );
}

function AgentGlyph({ id }: { id: AgentId }) {
  if (id === 'claude') return <Claude aria-hidden className="size-3.5 shrink-0" />;
  if (id === 'codex') return <Codex aria-hidden className="size-3.5 shrink-0" />;
  return null;
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="border-border text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full border text-xs tabular-nums">{n}</span>
      <div className="text-foreground flex min-w-0 flex-1 flex-col gap-2 pt-0.5">{children}</div>
    </li>
  );
}

/** The command that starts the agent, with its own copy button. */
function CommandLine({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="border-border bg-background flex items-center gap-2 rounded-md border py-1.5 pr-1.5 pl-3 font-mono text-xs">
      <TerminalWindowIcon aria-hidden className="text-muted-foreground size-3.5 shrink-0" />
      <span className="text-foreground flex-1">{command}</span>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={copied ? 'Copied' : `Copy ${command}`}
        className="text-muted-foreground hover:text-foreground hover:bg-accent duration-fast inline-flex size-7 items-center justify-center rounded-sm transition-colors"
      >
        {copied ? <SolidCheckIcon className="size-3.5" /> : <CopySimpleIcon className="size-3.5" />}
      </button>
    </div>
  );
}

/** Copies the prompt again: a later copy elsewhere may have replaced it on the clipboard. */
function CopyAgain({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <MarketingButton type="button" variant="secondary" size="md" onClick={() => void copy()}>
      {copied ? 'Copied' : 'Copy again'}
    </MarketingButton>
  );
}
