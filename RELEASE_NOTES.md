Website logins for agents, dictation and artifact folders

### New
- Agents sign in to websites with a login they never see. An agent asks for a website login with a link, the person fills it in, and the sandbox browser types it into the sign-in page. A login works only on the sites it names. (#13048)
- Dictate a message on web, desktop and mobile. Dictation costs credits per minute of audio, billed per second. (#13043)
- Organize artifacts in nested folders in the gallery. (#13030)
- A connected app can reach all of a person's workspaces and create new ones. "All my workspaces" is the default reach on the consent screen. (#13022, #13025)
- The sign-in page has a split layout with a product story pane. (#13026)
- Weekly changelog pages have cover images. (#11688)
- Review: swipe through Needs you as cards, behind the `review_swipe` flag. (#13015)

### Improved
- Every agent writes direct, concise, warm and professional answers. (#13044)
- Kortix in Chrome and Network-Enforced Secrets are on in every workspace. Their feature flags are gone. (#13032, #13033)
- Stateless sandboxes are the default on every deployment, self-host included. (#13023)
- Agents without repository access still get the workspace's AGENTS.md and pi extensions. (#13024)
- In a shared session, the agent knows which person wrote each message. (#13037)
- The session side panel has calmer sections and a Background tasks section. Colleague rows stay in view and name the agent and the reason. (#13010, #12981)
- The model switch history is a readable tree. (#13056)
- Change requests are one click away in the desktop sidebar. (#13034)
- Kortix in Chrome highlights only the element the agent acts on, and Stop clears the highlight. (#13053)
- Drives can run on shared (live) volumes, including a drive converted in place. New drives stay on block volumes, which keep version history, until an operator sets `KORTIX_SHARED_DRIVES`. (#13000, #13066)
- Saved session history comes from the stored session log, through one endpoint. Replies stay on screen when a sandbox stalls or the log lags. (#12576, #13050, #13040)
- The privacy policy covers how Kortix uses Google user data. (#13013)
- The home page calls Kortix the operating system for the AI-native company. Platinum mentions in docs and posts link to platinum.dev. (#13041, #13051)

### Fixed
- A member without admin rights can connect their own app account. (#13036)
- A merge that changes connectors needs connector write permission, and a merge with a hard-coded key is refused. (#13035)
- My Kortix can read the automation sessions its person can open. (#13042)
- Mobile: a failed send stays where it was sent, not under later turns. (#13038)
- A Claude subscription turn after a settings change runs in Claude Code again. (#13020)
- Self-host: a regional `PLATINUM_API_URL` reaches the volumes of its own region. (#13018)
- Google connector calls keep their deadlines. (#13002)
- An attachment upload retries a gateway failure once. (#13011)
- Opening setup from the home banner no longer halves the home. (#13012)
- Slack-style Spaces are back in the feature flags list. (#13029)
- Creating a volume checks its retention setting. (#13031)
- The audit log names the artifact folder, website login and dictation requests in words. The Chinese and Japanese dictation price shows the right number. (#13061)

### API changes
- `GET …/sessions/:id/transcript` is removed. Read `GET …/sessions/:id/log`. (#12576)

### Internal
- The unused prod and staging ECS frontends are removed, and staging is right-sized. (#13052)
- Mobile uses i18next 26.4.2 (GHSA-6jcc-5g8w-32mx). (#13061)
- Local Supabase starts without PostgREST. (#13027)
- Refactors and cleanups (#13001, #13003, #13004, #13007, #13014, #13039, #13046, #13058), GitHub IP ranges (#13006), docs and learnings (#12982, #13021, #13049).
