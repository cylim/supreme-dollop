import { v } from 'convex/values'
import { internalMutation } from './_generated/server'

export const seedReleaseFixtures = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const existing = await ctx.db
      .query('schedules')
      .withIndex('by_slug', (query) => query.eq('slug', 'release-schedule'))
      .unique()
    if (existing !== null) return null

    const hostId = await ctx.db.insert('users', {
      providerAccountId: 'release-fixture-host',
      email: 'release-fixture@example.test',
      name: 'Release Fixture',
    })
    const scheduleId = await ctx.db.insert('schedules', {
      hostId,
      slug: 'release-schedule',
      title: 'Release schedule fixture',
      visibility: 'public',
      timezone: 'UTC',
      durationMinutes: 60,
      votingClosesAt: Date.now() + 24 * 60 * 60_000,
      status: 'open',
    })
    for (const startAt of [
      Date.now() + 48 * 60 * 60_000,
      Date.now() + 72 * 60 * 60_000,
    ]) {
      await ctx.db.insert('scheduleOptions', {
        scheduleId,
        startAt,
        endAt: startAt + 60 * 60_000,
        source: 'exact',
        availableCount: 0,
      })
    }

    const decisionId = await ctx.db.insert('decisions', {
      hostId,
      slug: 'release-decision',
      title: 'Release decision fixture',
      visibility: 'public',
      selectMode: 'single',
      status: 'open',
      participantCount: 0,
    })
    for (const [order, label] of ['One', 'Two'].entries()) {
      await ctx.db.insert('decisionOptions', {
        decisionId,
        label,
        order,
        selectionCount: 0,
      })
    }
    return null
  },
})
