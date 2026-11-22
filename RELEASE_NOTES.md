Kortix in Chrome, colored wallpapers, and workspace setup from the CLI

### New
- Kortix in Chrome is public on the Chrome Web Store. "Add to Chrome" is in Settings › Kortix in Chrome, on the Apps and extensions card and on the download page. The setup guide is at /docs/connect/chrome. (#12977)
- Create a workspace while you sign in to the CLI, without leaving the authorization page. (#12964)
- Colored gradient wallpapers: choose the colors, finish and opacity of each wallpaper. (#12985)
- Configuration commits name the person or agent who made the change. (#12965)

### Improved
- Workspace setup opens in a modal, and a floating banner on the workspace home takes you back to it. (#12973)
- The Preferences sidebar matches Workspace settings: the same header, Back row, search and workspace list. (#12976)
- Settings › Repository shows one toolbar header and one sidebar button. (#12988)
- Claude subscription usage is recorded, and subscription tokens get a usage value. (#12956)
- The Kortix Capture installers build again and are attached to this release. (#12984)

### Fixed
- A configuration change that would make the workspace configuration invalid is refused with its validation errors, and nothing is committed. (#12966)
- Trigger validation checks the agents that trigger runs use. (#12967)
- When an agent's `show` call fails, the chat no longer shows an empty preview card. (#12770)
- Toasts sit in the bottom-right corner of the window again. (#12987)
- Sandboxes keep the bootstrap files they started with across configuration updates and daemon restarts. (#12971)

### Internal
- The mobile release no longer waits for the Kortix Capture and desktop installer builds. (#12984)
- Removed obsolete sandbox snapshot orchestration. (#12970)
- Replay tests cover hidden slash commands and their arguments; core test lanes reuse warm Supabase images. (#12950, #12963)
- Deploy Prod waits longer for the GitHub Release and retries the `:prod` tag move when Docker Hub rate-limits it. (#12991)
- Docs, release checks and the dev environment. (#12962, #12972, #12978, #12980, #12983, #12989, #12993, #12994)
- v0.16.3 shipped #12950, #12956, #12962, #12963, #12965 and #12967 without a release page; they are listed here.
