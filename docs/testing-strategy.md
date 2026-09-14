# Testing strategy

JRNY Plan uses three test gates. Each gate answers a different release question.

## Terms

**Merge gate**:
The deterministic checks that must pass before a change can merge. The gate targets a run time under eight minutes and supports a local subset under two minutes.

**Release gate**:
The checks against a real preview deployment that must pass before release. The gate may run for up to 20 minutes.

**Production check**:
A read-only check that confirms safe user paths still work after deployment.

**Advisory check**:
A check that reports a failure without blocking the current gate. Each advisory check has an owner and a date when the team will decide whether to make it blocking.

## Settled policy

The merge gate runs without a cloud deployment. It uses `convex-test` for backend behavior.

The release gate uses a fresh Convex preview deployment. Every object created by the browser suite includes a unique run ID. The test runner discards the preview deployment after the gate instead of calling production cleanup APIs.

The merge gate uses fake adapters for AgentMail and Google Calendar contract tests. The release gate performs one real AgentMail round trip and one real Google Calendar free/busy check. The Calendar check reuses encrypted browser state for a dedicated test account and does not automate the Google login screen.

Desktop Chromium and one mobile Chromium viewport block the release gate. Firefox, WebKit, and the full-site accessibility scan begin as advisory checks. They become blocking after two weeks without unexplained failures. Accessibility scans for core workflows block serious and critical findings from the start.

The production check uses a pre-provisioned synthetic account with read-only fixtures. It may sign in, load the dashboard, open one public schedule, and open one public decision. It may not create, edit, submit, close, or send mail.

Every schema-changing release requires a migration rehearsal. A rename, removal, or tighter field constraint uses a sanitized snapshot. An additive change uses representative fixtures.

Type checking, unit tests, authorization tests, migration rehearsal, Chromium workflows, and the production build are blocking checks. Cross-browser, accessibility, AgentMail, and Google Calendar checks may begin as advisory checks.

## Pass criteria

Backend and shared domain modules must maintain at least 85% line coverage and 85% branch coverage. Changed code must reach 90% coverage. Generated files and UI style declarations do not count toward these thresholds.

Every protected public Convex function needs tests for an unauthenticated caller, an allowed caller, and a signed-in caller without access. Host-only mutations also need tests for an invited participant and an unrelated user. Public resources still require sign-in.

The merge gate runs on every pull-request update. The release gate runs from the release branch before deployment approval. Advisory checks run nightly. The production check runs immediately after deployment and every 15 minutes.

Deterministic merge checks do not retry. Browser and external-service checks may retry once. The report retains the first failure and marks a check as flaky even when its retry passes. Three flaky results within seven days block the affected gate.

Failure tests cover provider timeouts, malformed responses, revoked credentials, duplicate webhook delivery, duplicate scheduled execution, and partial notification failure. Each test asserts stored state and retry behavior.

Backend limit tests use the maximum option and invitation counts plus representative participant volume. The initial test run records document reads and latency as the baseline. A change fails when it increases either measure by more than 20% or approaches a Convex transaction limit.

The merge gate also runs secret scanning, dependency auditing, and webhook tests for signatures, timestamps, replay, and payload size.

## Product risk coverage

Date and timezone tests cover UTC, Kuala Lumpur, New York's spring and fall daylight-saving transitions, and Adelaide's half-hour offset. Browser checks run in Kuala Lumpur and New York. Tests assert both the stored timestamp and the displayed local time.

Concurrency tests cover two participants selecting the same option, a participant replacing a ballot while the host closes, and two host edits to the same option. Each test compares stored selections with the reported selection counts.

The accessibility target is WCAG 2.2 AA. Serious and critical automated findings block release. Keyboard completion, visible focus, form labels, and status announcements are blocking requirements for each core workflow.

Visual regression baselines cover the landing page, dashboard, schedule states, standalone decision states, attached decisions, and both creation forms. The baselines use desktop Chromium and the blocking mobile viewport. Visual checks begin as advisory checks and become blocking after explicit baseline approval.

AgentMail and Google Calendar checks become blocking after ten consecutive successful daily runs and one verified failure alert. Before promotion, the release operator must acknowledge an integration failure before deployment.

Credential-entry traces stay disabled. Failed browser artifacts expire after seven days. Sanitized database snapshots expire after 24 hours. Test artifacts must not contain credentials, access tokens, refresh tokens, webhook secrets, or raw production email bodies.

The pull-request author owns merge-gate failures. The release operator owns release-gate failures. The on-call maintainer owns production-check failures. Each flaky advisory check has one named code owner and an expiry date.

`main` is the release branch. A pull request runs the merge gate. A successful merge to `main` creates a release candidate and runs the release gate before deployment approval.

## Automation

GitHub Actions owns the gates. Protected required checks enforce the merge gate. A protected GitHub environment holds release secrets and requires deployment approval.

Developers and CI use the same package scripts:

- `test:merge` runs the merge gate.
- `test:release` runs the release gate.
- `test:advisory` runs the advisory checks.
- `test:production` runs the production check.
- `test:unit`, `test:coverage`, `test:browser`, and `test:migration` run focused subsets.

Workflow files call package scripts instead of duplicating their commands.

React Testing Library with `jsdom` covers form validation, selection state, errors, deadline transitions, and disabled controls. Playwright covers routing, authentication, realtime updates, responsive layout, and complete workflows.

The implementation closes test gaps in this order:

1. Complete the authorization matrix for all public Convex functions.
2. Add lifecycle, idempotency, and failure tests.
3. Add UI component tests.
4. Expand browser workflows.
5. Add external integrations, migration rehearsal, performance checks, and production checks.

## Snapshot safety

Ordinary schema changes use synthetic fixtures. Renames, removals, and tighter constraints may use an encrypted production snapshot created by the release operator. A deterministic sanitizer removes emails, names, pictures, tokens, message bodies, and provider identifiers. An automated scan must confirm that these values are absent before CI receives the snapshot.

## Production safety

The production-check browser context blocks mutation requests and fails if the application attempts one. The synthetic account credentials live in the protected production-check environment and rotate every 90 days. Its fixtures are public and contain no personal data.

Production-check failures alert the on-call maintainer immediately. Merge failures use GitHub annotations. Release failures appear in the deployment summary. Repeated advisory failures update one tracking issue.

## Performance records

Versioned baseline files use fixed high-volume fixtures on a Convex preview deployment. Each named function records p50 and p95 latency, documents read, bytes read, and writes. An intentional change above the budget requires explicit baseline approval.
