# Testing implementation status

The repository now has executable merge, release, advisory, migration, and
production-check entry points. The local merge gate is green; credentialed
release and production checks run in protected GitHub environments.

## Implemented

- Vitest runs Convex, shared-domain, and React component tests.
- V8 coverage enforces 85% global line and branch coverage.
- A changed-code check enforces 90% statement and branch coverage against
  `origin/main`.
- The merge gate checks formatting of changed files, types, lint, secrets,
  high-severity dependency advisories, coverage, and the production build.
- Convex tests cover the main schedule and decision authorization and lifecycle
  paths, account queries, OAuth-state persistence, calendar actions and
  connection storage, notification delivery, inbound-request processing, and
  disconnect behavior.
- The release workflow recreates a clean Convex preview, seeds fixed public
  fixtures, publishes the matching frontend, and runs an additive migration
  rehearsal before browser tests.
- Release and nightly advisory jobs perform a real AgentMail round trip and a
  Google Calendar free/busy request with dedicated test credentials.
- Current backend/shared coverage is 96.97% lines and 89.20% branches. Changed
  code is 97.30% statements and 91.85% branches against `origin/main`.
- Playwright defines blocking desktop and mobile Chromium projects plus
  advisory Firefox and WebKit projects.
- Accessibility checks reject serious and critical WCAG findings on public
  fixtures.
- The production check signs in, installs a Convex WebSocket mutation guard,
  and loads only pre-provisioned schedule and decision fixtures.
- GitHub Actions workflows run merge, release, nightly advisory, and 15-minute
  production checks. Failed browser artifacts expire after seven days.

## Remaining operational gaps

- Add snapshot sanitization and preview import before the first destructive or
  narrowing production migration; this branch's schema change is additive and
  uses representative legacy fixtures.
- Add approved visual baselines, keyboard workflow tests, focus checks, and
  timezone/DST browser assertions.
- Capture performance baselines for document reads, bytes, writes, p50, and
  p95, then enforce the 20% regression budget.
- Configure protected GitHub environments, secrets, fixture URLs, branch
  protection, on-call alerting, flake accounting, and advisory-promotion state.
