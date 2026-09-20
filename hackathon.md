# Hackathon log

- **Project:** JRNY Plan
- **Event:** Convex All Gas Hackathon
- **What it does:** Helps signed-in groups choose event times and answer labeled decisions in the app or by structured email.
- **Live app:** https://flippant-bat-602.convex.site
- **Repo:** https://github.com/cylim/supreme-dollop
- **Frontend:** Convex static hosting
- **Convex deployment:** https://flippant-bat-602.convex.cloud
- **Components:** @convex-dev/auth, @convex-dev/static-hosting
- **Convex features:** schema, indexes, queries, mutations, actions, HTTP actions, scheduled functions, realtime queries
- **Auth:** Convex Auth
- **AI models:** none
- **Started:** 2026-09-05T11:58:05Z
- **Last updated:** 2026-09-18T11:36:27Z

## Log

### 2026-09-05 - 32ce2d1

Created the project README. No application behavior is documented yet.
(`README.md`)

### 2026-09-05 - working tree

Selected Convex static hosting for the frontend. The app is not configured or
deployed yet.

### 2026-09-07 - b0968ed

Built JRNY Plan with TanStack Start and StyleX: authenticated public and
invite-only schedules, exact-time and range-generated candidates, realtime
availability voting, best-overlap recommendations, and host-approved
finalization. Added Google Calendar busy-time checks and queued AgentMail
invitations and confirmations (`src/routes`, `convex/schema.ts`,
`convex/schedules.ts`, `convex/calendar.ts`, `convex/notifications.ts`).
Configured Convex Auth and Static Hosting components and verified the backend
on a development deployment. Typecheck, lint, three multi-user backend tests,
production build, and production dependency audit pass. Published the verified
artifact to the development Static Hosting deployment and confirmed the live
root, SPA fallback, generated assets, and Google OAuth start flow. Reworked the
public landing page to share the authenticated dashboard's hero, overlap card,
panel grid, and responsive visual language, with a prominent Google sign-in
call to action. Refined candidate entry into accessible Exact time and Rough
window tabs, and added a second schedule-creation call to action before the
landing footer (`src/routes/new.tsx`, `src/routes/index.tsx`,
`src/components/AuthGate.tsx`).

### 2026-09-07 - ee2f924

Added gated test-only password accounts and Playwright coverage for three-user
invite-only and public scheduling flows. Both browser scenarios now pass through
schedule creation, voting, and live best-overlap ranking; the invited flow also
verifies host confirmation. Fixed a reactive schedule query that repeatedly
changed its time argument and never left the loading state. AgentMail now skips
configured test recipients before creating the delivery client, with policy
tests covering suppression (`e2e/scheduling.spec.ts`, `src/routes/s.$slug.tsx`,
`convex/auth.ts`, `convex/notifications.ts`).

### 2026-09-08 - 2fdfdda

Refactored schedule lifecycle, draft generation, AgentMail delivery, and Google
Calendar token handling into deeper tested modules. Added idempotent schedule
creation from signed AgentMail webhooks, a deterministic `/llms.txt` email
protocol, and reply suppression for test recipients. Typecheck, lint, production
build, 20 unit/integration tests, and both three-user browser flows pass locally
(`convex`, `shared`, `src/scheduling`, `tests`, `public/llms.txt`).

### 2026-09-08 - 656f67c

Renamed the product to JRNY Plan and introduced a route-inspired brand mark
across the app shell, landing page, favicons, install icons, and web manifest.
Removed the mark's background for use in the interface and added a complete
README covering features, setup, configuration, architecture, testing, email
scheduling, and deployment (`README.md`, `src/components/AppShell.tsx`,
`public/jrny-plan-mark.png`, `public/site.webmanifest`).

### 2026-09-14 - 887b197

Added standalone and schedule-attached decisions with invitations, deadlines,
single or multiple selection, option editing, and host-controlled close. Split
decision access, lifecycle, and read behavior into tested Convex modules. The
local suite passes 87 tests with 96.97% line coverage
(`convex/decisions.ts`, `convex/decisionAccess.ts`,
`convex/decisionReadModel.ts`).

### 2026-09-18 - a5b0faf

Kept verification local by removing the GitHub merge, release, advisory, and
production gates and their helper scripts. Pinned development to Node 26 and
limited Playwright to one worker to avoid concurrent sign-ins with shared test
accounts (`README.md`, `.nvmrc`, `package.json`, `playwright.config.ts`).

### 2026-09-18 - 5ba1eb6

Fixed rapid multi-select voting with an optimistic Convex update so consecutive
choices preserve the whole ballot. Reused cached browser auth with rate-limit
retries, enabled full E2E recording, tightened selectors, and corrected
low-contrast text. All 10 desktop and mobile E2E scenarios pass with no skips;
87 unit and backend tests, typecheck, lint, and production build also pass
(`src/components/DecisionPanel.tsx`, `e2e`, `src/routes`).
