# Hackathon log

- **Project:** JRNY Select
- **Event:** Convex All Gas Hackathon
- **What it does:** Helps signed-in groups propose exact times or broad ranges, vote on availability, and let the host confirm the best event time.
- **Live app:** https://flippant-bat-602.convex.site
- **Repo:** https://github.com/cylim/supreme-dollop
- **Frontend:** Convex static hosting
- **Convex deployment:** https://flippant-bat-602.convex.cloud
- **Components:** @convex-dev/auth, @convex-dev/static-hosting
- **Convex features:** schema, indexes, queries, mutations, actions, HTTP actions, scheduled functions, realtime queries
- **Auth:** Convex Auth
- **AI models:** none
- **Started:** 2026-09-05T11:58:05Z
- **Last updated:** 2026-09-07T06:41:49Z

## Log

### 2026-09-05 - 32ce2d1
Created the project README. No application behavior is documented yet.
(`README.md`)

### 2026-09-05 - working tree
Selected Convex static hosting for the frontend. The app is not configured or
deployed yet.

### 2026-09-07 - b0968ed
Built JRNY Select with TanStack Start and StyleX: authenticated public and
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

### 2026-09-07 - working tree
Added gated test-only password accounts and Playwright coverage for three-user
invite-only and public scheduling flows. Both browser scenarios now pass through
schedule creation, voting, and live best-overlap ranking; the invited flow also
verifies host confirmation. Fixed a reactive schedule query that repeatedly
changed its time argument and never left the loading state. AgentMail now skips
configured test recipients before creating the delivery client, with policy
tests covering suppression (`e2e/scheduling.spec.ts`, `src/routes/s.$slug.tsx`,
`convex/auth.ts`, `convex/notifications.ts`).
