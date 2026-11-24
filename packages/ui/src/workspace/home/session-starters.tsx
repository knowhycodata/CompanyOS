'use client';

import { ArrowUpLeftIcon, CodeIcon, CompassIcon, ListChecksIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { useTranslations } from '../../i18n';
import { Button } from '../../primitives/button';

const STARTERS = [
  { key: 'build', icon: CodeIcon },
  { key: 'research', icon: MagnifyingGlassIcon },
  { key: 'review', icon: ListChecksIcon },
  { key: 'plan', icon: CompassIcon },
] as const;

/** Starting points fill the existing composer. They never start a session. */
export function SessionStarters({
  onPick,
  disabled = false,
}: {
  onPick: (prompt: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('sessionStart');
  return (
    <section aria-label={t('startersLabel')} className="@container/starters px-4">
      <div className="border-border grid grid-cols-1 gap-x-6 border-t pt-2 @md/starters:grid-cols-2">
        {STARTERS.map(({ key, icon: Icon }) => (
          <Button
            key={key}
            type="button"
            variant="ghost"
            disabled={disabled}
            onClick={() => onPick(t(`${key}.prompt`))}
            className="group/starter text-muted-foreground hover:bg-hover hover:text-foreground focus-visible:ring-ring h-auto min-w-0 cursor-pointer items-start gap-3 px-3 py-3 text-left font-normal whitespace-normal focus-visible:ring-2"
          >
            <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="text-foreground block text-sm">{t(`${key}.title`)}</span>
              <span className="mt-1 block text-xs text-pretty">{t(`${key}.description`)}</span>
            </span>
            <ArrowUpLeftIcon aria-hidden className="mt-0.5 size-3.5 shrink-0 opacity-0 group-hover/starter:opacity-100 group-focus-visible/starter:opacity-100" />
          </Button>
        ))}
      </div>
      <p className="text-muted-foreground px-3 pt-2 text-xs">{t('editHint')}</p>
    </section>
  );
}
