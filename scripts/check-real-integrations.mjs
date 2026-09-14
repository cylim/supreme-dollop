import { AgentMailClient } from 'agentmail'

const required = [
  'AGENTMAIL_API_KEY',
  'AGENTMAIL_INBOX_ID',
  'AGENTMAIL_TEST_RECIPIENT',
  'AGENTMAIL_TEST_RECIPIENT_INBOX_ID',
  'AUTH_GOOGLE_CLIENT_ID',
  'AUTH_GOOGLE_CLIENT_SECRET',
  'GOOGLE_CALENDAR_TEST_REFRESH_TOKEN',
]
const missing = required.filter((name) => !process.env[name])
if (missing.length > 0) {
  console.error(`Integration checks require: ${missing.join(', ')}`)
  process.exit(2)
}

const timeoutMs = 20_000

async function withTimeout(promise, label) {
  let timeout
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs}ms.`)),
          timeoutMs,
        )
      }),
    ])
  } finally {
    clearTimeout(timeout)
  }
}

async function checkAgentMail() {
  const client = new AgentMailClient({ apiKey: process.env.AGENTMAIL_API_KEY })
  const subject = `JRNY release check ${crypto.randomUUID()}`
  await withTimeout(
    client.inboxes.messages.send(
      process.env.AGENTMAIL_INBOX_ID,
      {
        to: process.env.AGENTMAIL_TEST_RECIPIENT,
        subject,
        text: 'Automated JRNY Plan release-gate delivery check.',
      },
      { idempotencyKey: `release:${subject}` },
    ),
    'AgentMail send',
  )

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await withTimeout(
      client.inboxes.messages.list(
        process.env.AGENTMAIL_TEST_RECIPIENT_INBOX_ID,
        { subject: [subject], limit: 10 },
      ),
      'AgentMail receive',
    )
    const delivered = result.messages.find(
      (message) => message.subject === subject,
    )
    if (delivered) {
      await client.inboxes.messages.delete(
        process.env.AGENTMAIL_TEST_RECIPIENT_INBOX_ID,
        delivered.messageId,
      )
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  throw new Error('AgentMail round trip did not arrive before the deadline.')
}

async function checkGoogleCalendar() {
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_CLIENT_ID,
      client_secret: process.env.AUTH_GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_CALENDAR_TEST_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!tokenResponse.ok) {
    throw new Error(`Google token refresh failed with ${tokenResponse.status}.`)
  }
  const token = await tokenResponse.json()
  if (typeof token.access_token !== 'string') {
    throw new Error('Google token response omitted access_token.')
  }

  const timeMin = new Date().toISOString()
  const timeMax = new Date(Date.now() + 60 * 60_000).toISOString()
  const response = await fetch(
    'https://www.googleapis.com/calendar/v3/freeBusy',
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token.access_token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        timeMin,
        timeMax,
        items: [{ id: process.env.GOOGLE_CALENDAR_TEST_ID ?? 'primary' }],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    },
  )
  if (!response.ok) {
    throw new Error(`Google free/busy failed with ${response.status}.`)
  }
  const payload = await response.json()
  if (!payload.calendars || typeof payload.calendars !== 'object') {
    throw new Error('Google free/busy response omitted calendars.')
  }
}

await checkAgentMail()
await checkGoogleCalendar()
console.log('Real AgentMail and Google Calendar checks passed.')
