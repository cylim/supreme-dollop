/// <reference types="vite/client" />

import { convexTest } from 'convex-test'
import { makeFunctionReference } from 'convex/server'
import { describe, expect, it } from 'vitest'
import { api, internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const seedReleaseFixtures = makeFunctionReference<'mutation'>(
  'testing:seedReleaseFixtures',
)

describe('additive decision schema rehearsal', () => {
  it('loads representative pre-decision rows and supports the new feature', async () => {
    const t = convexTest(schema, modules)
    const fixture = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', {
        providerAccountId: 'google:legacy',
        email: 'legacy@example.test',
      })
      const scheduleId = await ctx.db.insert('schedules', {
        hostId: userId,
        slug: 'legacy-schedule',
        title: 'Legacy schedule',
        visibility: 'public',
        timezone: 'UTC',
        durationMinutes: 60,
        votingClosesAt: Date.now() + 120_000,
        status: 'open',
      })
      const notificationRunId = await ctx.db.insert('notificationRuns', {
        scheduleId,
        kind: 'invitation',
        status: 'pending',
      })
      const inboundRequestId = await ctx.db.insert('inboundScheduleRequests', {
        eventId: 'legacy-event',
        messageId: 'legacy-message',
        inboxId: 'legacy-inbox',
        senderEmail: 'legacy@example.test',
        status: 'created',
        scheduleId,
        receivedAt: Date.now(),
      })
      return { userId, scheduleId, notificationRunId, inboundRequestId }
    })
    const user = t.withIdentity({
      subject: fixture.userId,
      tokenIdentifier: `https://test.invalid|${fixture.userId}`,
    })

    expect(
      await t.query(internal.notificationModel.getPayload, {
        scheduleId: fixture.scheduleId,
        kind: 'invitation',
      }),
    ).toMatchObject({ title: 'Legacy schedule' })
    expect(
      await t.query(internal.inboundScheduleModel.getReplyPayload, {
        requestId: fixture.inboundRequestId,
      }),
    ).toMatchObject({ scheduleTitle: 'Legacy schedule' })
    await expect(
      t.mutation(internal.notificationModel.markRun, {
        notificationRunId: fixture.notificationRunId,
        status: 'skipped',
      }),
    ).resolves.toBeNull()

    const decision = await user.mutation(api.decisions.create, {
      title: 'New decision',
      visibility: 'public',
      selectMode: 'single',
      options: ['One', 'Two'],
      inviteEmails: [],
    })
    expect(
      await user.query(api.decisions.getBySlug, { slug: decision.slug }),
    ).toMatchObject({ title: 'New decision', status: 'open' })

    await t.mutation(seedReleaseFixtures, {})
    await t.mutation(seedReleaseFixtures, {})
    expect(
      await t.run(async (ctx) =>
        ctx.db
          .query('schedules')
          .withIndex('by_slug', (query) => query.eq('slug', 'release-schedule'))
          .unique(),
      ),
    ).toMatchObject({ title: 'Release schedule fixture' })
  })
})
