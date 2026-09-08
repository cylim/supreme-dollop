import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { convexTest } from 'convex-test'
import { Webhook } from 'svix'
import schema from '../convex/schema'
import { scheduleRequestMarkers } from '../shared/inboundScheduleRequest'

const modules = import.meta.glob('../convex/**/*.ts')
const now = Date.UTC(2026, 8, 8, 4)
const secret = `whsec_${btoa('b'.repeat(32))}`

function scheduleBody() {
  return `${scheduleRequestMarkers.start}\n${JSON.stringify({
    title: 'Created from inbound email',
    visibility: 'public',
    timezone: 'Asia/Kuala_Lumpur',
    durationMinutes: 60,
    votingClosesAt: '2026-09-09T12:00:00+08:00',
    candidates: {
      exact: [
        '2026-09-10T10:00:00+08:00',
        '2026-09-10T14:00:00+08:00',
      ],
    },
  })}\n${scheduleRequestMarkers.end}`
}

function request(eventId = 'event-inbound-1') {
  const rawBody = JSON.stringify({
    type: 'event',
    event_type: 'message.received',
    event_id: eventId,
    message: {
      inbox_id: 'schedule@agentmail.test',
      message_id: 'message-inbound-1',
      from: 'Host <host@example.test>',
      text: scheduleBody(),
    },
  })
  const id = `delivery-${eventId}`
  const timestamp = new Date(now)
  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'svix-id': id,
      'svix-timestamp': String(Math.floor(timestamp.getTime() / 1_000)),
      'svix-signature': new Webhook(secret).sign(id, timestamp, rawBody),
    },
    body: rawBody,
  }
}

describe('inbound scheduling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    vi.stubEnv('AGENTMAIL_WEBHOOK_SECRET', secret)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('receives a signed email, creates one schedule, and suppresses the test reply', async () => {
    const t = convexTest(schema, modules)
    await t.run(async (ctx) => {
      await ctx.db.insert('users', {
        providerAccountId: 'google:host@example.test',
        email: 'host@example.test',
      })
    })

    expect((await t.fetch('/agentmail/webhook', request())).status).toBe(200)
    expect((await t.fetch('/agentmail/webhook', request())).status).toBe(200)
    await t.finishAllScheduledFunctions(vi.runOnlyPendingTimers)

    const result = await t.run(async (ctx) => {
      const schedules = await ctx.db.query('schedules').take(10)
      const requests = await ctx.db.query('inboundScheduleRequests').take(10)
      const candidates = await ctx.db
        .query('scheduleOptions')
        .withIndex('by_schedule_and_start_at', (query) =>
          query.eq('scheduleId', schedules[0]._id),
        )
        .take(100)
      return { schedules, requests, candidates }
    })
    expect(result.schedules).toHaveLength(1)
    expect(result.schedules[0].title).toBe('Created from inbound email')
    expect(result.candidates).toHaveLength(2)
    expect(result.requests).toHaveLength(1)
    expect(result.requests[0]).toMatchObject({
      status: 'created',
      replyStatus: 'skipped',
    })
    expect(result.requests[0].body).toBeUndefined()
  })

  it('rejects unsigned webhook requests before writing data', async () => {
    const t = convexTest(schema, modules)
    const unsigned = request('event-unsigned')
    unsigned.headers['svix-signature'] = 'v1,invalid'
    expect((await t.fetch('/agentmail/webhook', unsigned)).status).toBe(400)
    expect(
      await t.run(async (ctx) =>
        ctx.db.query('inboundScheduleRequests').take(10),
      ),
    ).toHaveLength(0)
  })
})
