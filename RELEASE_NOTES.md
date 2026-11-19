Loopmaxxing launch, setup reminders, and connector setup fixes

### New
- kortix.com shows a "New: Loopmaxxing." bar above the navigation that links to Loopmaxxing. (#12874)
- The workspace home says "N setup steps are left" with a **Finish setup** link while the setup page still has open steps. (#12873)
- The Loopmaxxing landing page ends with a dithered rainbow that stretches into view as you scroll. (#12858)
- The careers page lists all three openings on one board, each with its own locations. (#12237)

### Improved
- Restored the Loopmaxxing colors, call to action, and landing footer. (#12849)
- Restored the Loopmaxxing copy takeover and removed the reel chat input. (#12861)
- The loopmaxxing.sh footer links to Privacy and Terms. (#12871)
- Search and answer engines read loopmaxxing.sh as its own site, with its own title, social card, sitemap and llms.txt. kortix.com/loopmaxxing redirects there. (#12877)

### Fixed
- Declared connectors appear on the setup page even before their first sync. (#12851)
- Restored the chat inputs in Loopmaxxing cards. (#12854)
- Setup sign-in stays in the person's hands: the agent no longer clicks on their behalf. (#12857)
- Sandbox image builds no longer fail when the template quota fills: superseded templates are cleaned up first. (#12869)
- Markdown link parsing stays linear on repeated malformed link delimiters. (#12862)

### Security
- Addressed the 11 CodeQL alerts raised by the v0.16.0 release candidate. (#12859)

### Internal
- Product analytics records session replays to show where new people get stuck. Every word of customer content is masked, and visitors who decline analytics are not recorded. The privacy policy describes it. (#12871)
- Kortix staff no longer count as customers in product analytics. (#12872, #12875, #12878)
- Fixed the three release-suite failures found during v0.16.0 preparation. (#12855)
- The test runner rejects focused tests. (#12868)
- Advanced the development version target to 0.16.1. (79dba49)
