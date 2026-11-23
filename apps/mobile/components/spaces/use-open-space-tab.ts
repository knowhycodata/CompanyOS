import { AppAccessDeniedError, openApp } from '@/lib/projects/apps';
import { createAppAccessSession, type ProjectSpace, type ProjectSpaceTab } from '@kortix/sdk';
import { useProjectApps } from '@kortix/sdk/react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useToast } from '@/components/kortix/toast-provider';
import { KORTIX_WEB_URL } from '@/lib/kortix-web';
import { spaceTabWebUrl } from '@/lib/projects/web-project-links';
import { openLink } from '@/lib/utils/open-link';
import { useArtifactViewerStore } from '@/stores/artifact-viewer-store';

/**
 * Open one of a space's tabs where mobile shows that kind: a link and an App
 * in the in-app browser, an artifact in the project's artifact viewer. A
 * Drive file or folder opens on web at that tab: mobile has no Drive browser.
 */
export function useOpenSpaceTab(projectId: string, space: Pick<ProjectSpace, 'kind' | 'slug'>) {
  const { t } = useTranslation();
  const toast = useToast();
  const apps = useProjectApps(projectId);
  const appList = apps.data;
  return useCallback(
    (tab: ProjectSpaceTab) => {
      const fail = (err: unknown) =>
        toast.error(err instanceof AppAccessDeniedError ? err.message : err instanceof Error ? err.message : t('spaces.tabs.openFailed'));
      switch (tab.kind) {
        case 'link':
          void openLink(tab.ref).catch(fail);
          return;
        case 'artifact':
          useArtifactViewerStore.getState().open({ projectId, artifactId: tab.ref, title: tab.title });
          return;
        case 'app': {
          const app = appList?.find((item) => item.slug === tab.ref);
          if (!app) {
            toast.error(t('spaces.tabs.missing'));
            return;
          }
          void openApp(app, { createSession: () => createAppAccessSession(projectId, app.app_id), openLink }).catch(fail);
          return;
        }
        case 'file':
        case 'folder':
          void openLink(spaceTabWebUrl(KORTIX_WEB_URL, projectId, space, tab.id)).catch(fail);
      }
    },
    [projectId, space, appList, toast, t],
  );
}
