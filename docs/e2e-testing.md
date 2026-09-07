# End-to-end testing

The browser suite uses three test identities: one host and two voters. It runs
multi-user invited and public workflows. Invite-access rejection is covered at
the backend level.

The browser suite uses Convex Auth's username/password provider with
email-shaped usernames. These are test-only accounts: they do not verify email,
do not link to Google accounts, and cannot exercise Google Calendar OAuth.

## Enable the dev deployment

Use reserved `.test` identities. On the Convex development deployment, set:

```bash
npx convex env set E2E_PASSWORD_AUTH_ENABLED true
npx convex env set E2E_TEST_EMAILS 'host@example.test,guest@example.test,guest-two@example.test'
```

Do not set these variables on production. The backend rejects password sign-up
and sign-in unless both the feature flag and exact identity allowlist match.

## Configure the local runner

Copy `.env.e2e.example` to `.env.e2e.local`, then replace both password values.
Passwords must contain 10 to 100 characters. The second voter reuses the guest
password because these accounts exist only on the allowlisted test deployment.
The local file is ignored by Git. Keep the emails synchronized with the Convex
allowlist.

Sync the development backend, then run the browser suite. Playwright starts and
stops the local Vite server itself:

```bash
npx convex dev --once
npm run test:e2e
```

The first run creates the three allowlisted test accounts. Later runs sign into
the same accounts and create a uniquely named schedule.

The invited scenario covers two voters through host confirmation. The public
scenario covers two voters and verifies the live recommendation while voting
remains open. Deterministic backend tests cover public deadline closure and
host confirmation without making the browser suite wait for a real deadline.

## Email safety

AgentMail delivery is suppressed before its client is created for:

- every address in `E2E_TEST_EMAILS`
- all addresses ending in `.test` or `.invalid`

If every recipient is suppressed, the notification run is recorded as
`skipped`. Logs contain only the number of suppressed recipients, not their
addresses.

## Google Calendar coverage

The schedule, invite, voting, recommendation, and host-confirmation flow needs
no Google accounts. A true Calendar OAuth test requires one separate Google
test account and a manually created Playwright authenticated state. Google login
itself should remain outside unattended automation.

## Disable test sign-in

After testing, remove the feature flag from the development deployment:

```bash
npx convex env remove E2E_PASSWORD_AUTH_ENABLED
```

Leaving `E2E_TEST_EMAILS` set continues to suppress AgentMail for those test
recipients even while password sign-in is disabled.
