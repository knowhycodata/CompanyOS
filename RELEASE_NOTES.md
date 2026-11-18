Loopmaxxing, Google apps through Kortix, desktop tabs and a calmer session view

### New
- **Loopmaxxing.** A new developer landing at loopmaxxing.sh: one prompt in Claude Code, Codex, Cursor, OpenCode or pi adds a Software Factory to your repository. The page shows real runs that integrations start (a Sentry alert, a pull request, a Slack message), the plans and the cloud computer pricing, and a full-screen guide after you copy the prompt, with a send-to-yourself option on phones.
- **Guided setup.** The setup guide offers the template that fits your repository, updates an older CLI instead of keeping it, offers Slack so teams can give agents work from Slack, and connects Linear with one sign-in. `kortix onboard` opens one setup page for every step a person must do and waits for it.
- **Your repository holds your Kortix setup.** Setup proves your dev environment by running it, sizes the agents' computer to your stack, and resizes it from measured peaks.
- **Gmail, Google Calendar, Drive, Docs and Sheets connect through Kortix** instead of a third-party connector service. The privacy policy states how Kortix handles Google user data.
- **Browser-style tabs in the desktop app.**
- **`kortix sessions usage`** shows tokens, cache and paid spend per session.
- **Reduce motion** switch in Settings ▸ Preferences.
- **Chat links to artifacts** show the artifact's title and details.
- **The model picker** shows each subscription in one line with a usage meter.
- **ActionBar:** one floating bar for a selection, unsaved edits and paste.
- **Session groups** in the sidebar sit below Pinned and gain New group and Collapse others. One promo card covers Kortix in ChatGPT and Claude, your computer, Chrome, and the desktop and phone apps.

### Improved
- **Sessions:** side panels dock, the results column is compact, and right-side panels keep the page, history and files correct. Chat keeps line breaks, @ finds repository files, toasts read clearly, one agent name shows throughout, and pins stay put.
- **Sign-in screens** are simpler: one legal line, cleaner type, and a code step that checks itself.
- **Workspace settings:** 22 fixes from an audit of every settings page. Settings pages stop loading hidden app previews, and a rate-limited request retries.
- **Templates** use the workspace layout, and a workspace's config gets its own repository. New workspaces no longer get a `.kortix` folder; the CLI link moves to git config.
- **Software Factory:** its agent is now called the engineer, tickets link the real session, and the first ticket starts intake once.
- **Desktop app:** the Review and Setup pages open as named tabs.
- **The terminal app** splits sessions the same way as the web app. Mobile session search and filters reach the server.
- **Faster:** sandbox health reads come from a warm git mirror, and spend per session is aggregated before it is joined.
- **Workspaces groundwork:** every record that points at a project now also points at its workspace, and permissions read workspace-level grants. No change to how you work today.

### Fixed
- A Stop no longer loses a queued message to the turn it ends, and prompts survive an extension's own run and a stalled billing check.
- A canceled plan no longer offers Cancel subscription, and it shows its remaining balance.
- Managers can refresh login usage.
- After `kortix projects rm`, the CLI moves its default off the deleted workspace.
- An agent call with no matching subagent type runs inline instead of failing.
- A shell command with a heredoc after `cd` no longer asks for permission.
- A git server's "not our ref" refusal is retried instead of failing the fetch.
- Parked sandbox removal with a dead provider credential answers a retryable error and alerts the team.
- iOS: the thread scrolls to the end of the last answer, the agent and model sheet shows its tabs, and the sidebar stays still under the page.
- A gated deployment serves the setup guide and the installer.
- Fewer false alerts: Android WebView bridge errors, expected not-ready responses, and client-fixable billing refusals no longer page.
- Get Kortix Usage no longer times out, and a script's calls draw once.
- The session panel's state words and resize handle are translated.
