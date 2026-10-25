# Make My Marriage

Environment note (user-confirmed October 24, 2026): local development currently connects to the production database. Do not create QA accounts/fixtures, run application migrations or perform test mutations against that database. Use an explicitly isolated development/test environment for state-changing verification; signed-in browser layout checks against the current configuration must be read-only.

Work in this existing repository root. Read README.md, docs/Wedding-Decision-Record.md, docs/Wedding-Project-Status.md and docs/Wedding-Implementation-Status.md before implementing a feature. Follow the documented Architecture/Database/API boundaries and keep completion evidence and remaining work current. Add feature directories only with implementation. Homepage/login designs require the supplied Stitch exports.

Maintain docs/Wedding-Project-Status.md as the ongoing major-feature progress log. Whenever a major feature is built or materially changed, add or update its entry in the same delivery with the date, status, completed scope, verification summary and remaining work. Preserve milestone history and distinguish implemented, verified and user-approved work. Keep this concise overview consistent with detailed evidence in docs/Wedding-Implementation-Status.md; link to that evidence instead of duplicating it. Never mark planned functionality or static previews as completed business features.

Follow the Clean implementation requirement in docs/Wedding-Development-Plan.md for every phase. Avoid unused files/dependencies, duplicate code, speculative abstractions, endpoint stubs and fake feature completion. Remove temporary task artifacts, review the diff, run appropriate checks and update existing progress records before delivery. Preserve required security and reliability controls.

<!-- postman-cli:installation:start -->
Postman CLI is installed on this device, and can be used for API Engineering work.
<!-- postman-cli:installation:end -->

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
