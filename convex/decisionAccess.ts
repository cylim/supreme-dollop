import type { Doc } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'

type ReadCtx = QueryCtx | MutationCtx

export async function requireDecisionAccess(
  ctx: ReadCtx,
  decision: Doc<'decisions'>,
  user: Doc<'users'>,
  isHost: boolean,
  failureMessage: string,
) {
  if (isHost) return
  if ('scheduleId' in decision) {
    const schedule = await ctx.db.get('schedules', decision.scheduleId)
    if (schedule === null) throw new Error('Schedule not found.')
    await requireScheduleParticipantAccess(
      ctx,
      schedule,
      user,
      false,
      failureMessage,
    )
    return
  }
  if (decision.visibility === 'public') return
  const invitation = await ctx.db
    .query('decisionInvitations')
    .withIndex('by_decision_and_email', (query) =>
      query.eq('decisionId', decision._id).eq('email', user.email),
    )
    .unique()
  if (invitation === null) throw new Error(failureMessage)
}

export async function requireScheduleParticipantAccess(
  ctx: ReadCtx,
  schedule: Doc<'schedules'>,
  user: Doc<'users'>,
  isHost: boolean,
  failureMessage: string,
) {
  if (schedule.visibility === 'public' || isHost) return
  const invitation = await ctx.db
    .query('invitations')
    .withIndex('by_schedule_and_email', (query) =>
      query.eq('scheduleId', schedule._id).eq('email', user.email),
    )
    .unique()
  if (invitation === null) throw new Error(failureMessage)
}
