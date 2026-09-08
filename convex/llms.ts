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

JRNY Plan creates group scheduling links, collects complete availability ballots, and collects opinion on labeled decisions.

## Create by email

Email destination: ${destination ?? 'Email scheduling is not configured for this deployment.'}
Subject: Create schedule
Alternate subject: Create decision
Content-Type: text/plain

The sender must already have a verified JRNY Plan account with the same email address. Send exactly one JSON object between the protocol markers. The JSON requires "kind": "schedule" or "kind": "decision". A valid request creates the objects immediately. Completion is a reply containing the URLs. A rejected request creates nothing and returns a validation message. The parser ignores the subject line.

Timestamps must be ISO 8601 strings ending in Z or an explicit UTC offset. Provide the timezone separately as an IANA name. Never infer either value. Every participant signs in before voting.

### Schedule

JRNY_SELECT_REQUEST_V1
{
  "kind": "schedule",
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

Public schedules omit inviteEmails.

### Schedule with attached decisions

Add a decisions array. Attached decisions inherit the schedule access mode and invitations. Do not set visibility or inviteEmails on attached decisions. selectMode is required: "single" or "multi". At most 20 attached decisions.

"decisions": [
  {
    "title": "What do we eat?",
    "selectMode": "single",
    "options": ["Thai", "Pizza", "Sushi"]
  }
]

### Standalone decision

JRNY_SELECT_REQUEST_V1
{
  "kind": "decision",
  "title": "Beach or park?",
  "visibility": "public",
  "selectMode": "single",
  "options": ["Beach", "Park"]
}
END_JRNY_SELECT_REQUEST

Invited standalone decisions require inviteEmails. closesAt is an optional ISO 8601 deadline.

## Retry behavior

AgentMail event IDs are idempotent. Retrying the same delivered email does not create another schedule or decision. Send a new email for a new request. If any nested decision is invalid, nothing is created.
`
}
