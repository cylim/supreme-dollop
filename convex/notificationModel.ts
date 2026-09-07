import { v } from 'convex/values'
import { internalMutation, internalQuery } from './_generated/server'

export const getPayload = internalQuery({
  args: {
    scheduleId: v.id('schedules'),
    kind: v.union(v.literal('invitation'), v.literal('finalized')),
  },
  returns: v.union(
    v.object({
      slug: v.string(),
      title: v.string(),
      timezone: v.string(),
      recipients: v.array(v.string()),
      selectedStartAt: v.union(v.number(), v.null()),
      selectedEndAt: v.union(v.number(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get('schedules', args.scheduleId)
    if (schedule === null) return null
    let recipients: Array<string> = []
    if (schedule.visibility === 'invited') {
      const invitations = await ctx.db
        .query('invitations')
        .withIndex('by_schedule_and_status', (q) =>
          q.eq('scheduleId', schedule._id),
        )
        .take(100)
      recipients = invitations.map((item) => item.email)
    } else if (args.kind === 'finalized') {
      const participants = await ctx.db
        .query('scheduleParticipants')
        .withIndex('by_schedule', (q) => q.eq('scheduleId', schedule._id))
        .take(250)
      const users = await Promise.all(
        participants.map((participant) =>
          ctx.db.get('users', participant.userId),
        ),
      )
      recipients = users.flatMap((user) => (user ? [user.email] : []))
    }
    const selected = schedule.selectedOptionId
      ? await ctx.db.get('scheduleOptions', schedule.selectedOptionId)
      : null
    return {
      slug: schedule.slug,
      title: schedule.title,
      timezone: schedule.timezone,
      recipients: Array.from(new Set(recipients)),
      selectedStartAt: selected?.startAt ?? null,
      selectedEndAt: selected?.endAt ?? null,
    }
  },
})

export const markRun = internalMutation({
  args: {
    notificationRunId: v.id('notificationRuns'),
    status: v.union(
      v.literal('sent'),
      v.literal('failed'),
      v.literal('skipped'),
    ),
    errorCode: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get('notificationRuns', args.notificationRunId)
    if (run !== null) {
      await ctx.db.patch('notificationRuns', run._id, {
        status: args.status,
        attemptedAt: Date.now(),
        ...(args.errorCode ? { errorCode: args.errorCode } : {}),
      })
    }
    return null
  },
})
