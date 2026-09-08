import { env, httpAction } from './_generated/server'

export const llmsTxt = httpAction(() =>
  Promise.resolve(
    new Response(buildLlmsText(env.AGENTMAIL_INBOX_ID), {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    }),
  ),
)

export function buildLlmsText(destination: string | undefined): string {
  return `# JRNY Plan

JRNY Plan creates group scheduling links and collects complete availability ballots.

## Create a schedule by email

Email destination: ${destination ?? 'Email scheduling is not configured for this deployment.'}
Subject: Create schedule
Content-Type: text/plain

The sender must already have a verified JRNY Plan account with the same email address. Send exactly one JSON object between the protocol markers. A valid request creates the schedule immediately. Completion is a reply containing the schedule URL. A rejected request creates nothing and returns a validation message.

Timestamps must be ISO 8601 strings ending in Z or an explicit UTC offset. Provide the timezone separately as an IANA name. Never infer either value.

### Exact candidate times

JRNY_SELECT_REQUEST_V1
{
  "title": "Community planning session",
  "description": "Optional context for participants",
  "visibility": "public",
  "timezone": "Asia/Kuala_Lumpur",
  "durationMinutes": 60,
  "votingClosesAt": "2026-09-20T12:00:00+08:00",
  "candidates": {
    "exact": [
      "2026-09-21T10:00:00+08:00",
      "2026-09-21T14:00:00+08:00"
    ]
  }
}
END_JRNY_SELECT_REQUEST

### Candidate range

Replace candidates with:

"candidates": {
  "range": {
    "startAt": "2026-09-21T10:00:00+08:00",
    "endAt": "2026-09-21T16:00:00+08:00",
    "intervalMinutes": 30
  }
}

Each generated candidate uses durationMinutes and must fit entirely inside the range. A request may use exact or range, never both.

### Invited schedule

Set visibility to invited and add:

"inviteEmails": ["participant@example.com", "second@example.com"]

Public schedules omit inviteEmails. Every participant signs in before voting.

## Retry behavior

AgentMail event IDs are idempotent. Retrying the same delivered email does not create another schedule. Send a new email for a new schedule request.
`
}
