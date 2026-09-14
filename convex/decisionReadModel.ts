import { MAX_ATTACHED_DECISIONS, MAX_OPTIONS } from '../shared/decisionDraft'
import {
  requireDecisionAccess,
  requireScheduleParticipantAccess,
} from './decisionAccess'
import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'

type ReadCtx = QueryCtx | MutationCtx

export type DecisionFace = { picture: string | null; initial: string }

export type DecisionOptionView = {
  id: Id<'decisionOptions'>
  label: string
  order: number
  selectionCount: number
  selected: boolean
  faces: Array<DecisionFace>
}

const MAX_FACES_PER_OPTION = 12

export type DecisionView = {
  id: Id<'decisions'>
  slug: string
  title: string
  description: string | null
  scheduleId: Id<'schedules'> | null
  visibility: 'public' | 'invited' | null
  selectMode: 'single' | 'multi'
  closesAt: number | null
  status: 'open' | 'closed'
  isHost: boolean
  canSubmitBallot: boolean
  options: Array<DecisionOptionView>
  invitations: Array<{ email: string }>
  participantCount: number
}

export function decisionFace(user: Doc<'users'>): DecisionFace {
  const source = user.name?.trim() || user.email.split('@')[0] || '?'
  const initial = Array.from(source)[0]?.toUpperCase() ?? '?'
  return { picture: user.picture ?? null, initial }
}

export async function readDecision(
  ctx: QueryCtx,
  args: { slug: string },
  user: Doc<'users'>,
): Promise<DecisionView | null> {
  const decision = await ctx.db
    .query('decisions')
    .withIndex('by_slug', (query) => query.eq('slug', args.slug))
    .unique()
  if (decision === null) return null
  const isHost = decision.hostId === user._id
  await requireDecisionAccess(
    ctx,
    decision,
    user,
    isHost,
    'This decision is limited to invited participants.',
  )
  return buildDecisionView(ctx, decision, user, isHost, true)
}

export async function listAttachedDecisions(
  ctx: QueryCtx,
  args: { scheduleId: Id<'schedules'> },
  user: Doc<'users'>,
): Promise<Array<DecisionView>> {
  const schedule = await ctx.db.get('schedules', args.scheduleId)
  if (schedule === null) throw new Error('Schedule not found.')
  const isScheduleHost = schedule.hostId === user._id
  await requireScheduleParticipantAccess(
    ctx,
    schedule,
    user,
    isScheduleHost,
    'This schedule is limited to invited participants.',
  )
  const decisions = await ctx.db
    .query('decisions')
    .withIndex('by_schedule', (query) => query.eq('scheduleId', schedule._id))
    .take(MAX_ATTACHED_DECISIONS)
  const views: Array<DecisionView> = []
  for (const decision of decisions) {
    views.push(
      await buildDecisionView(
        ctx,
        decision,
        user,
        decision.hostId === user._id,
        false,
      ),
    )
  }
  return views
}

export async function listHostedStandalone(ctx: QueryCtx, hostId: Id<'users'>) {
  const decisions = await ctx.db
    .query('decisions')
    .withIndex('by_host_and_schedule_id', (query) =>
      query.eq('hostId', hostId).eq('scheduleId', undefined),
    )
    .order('desc')
    .take(50)
  return decisions.map((decision) => ({
    id: decision._id,
    slug: decision.slug,
    title: decision.title,
    status: decision.status,
    selectMode: decision.selectMode,
    closesAt: decision.closesAt ?? null,
  }))
}

async function buildDecisionView(
  ctx: ReadCtx,
  decision: Doc<'decisions'>,
  user: Doc<'users'>,
  isHost: boolean,
  includeFaces: boolean,
): Promise<DecisionView> {
  const options = await ctx.db
    .query('decisionOptions')
    .withIndex('by_decision_and_order', (query) =>
      query.eq('decisionId', decision._id),
    )
    .take(MAX_OPTIONS)
  const mySelections = await ctx.db
    .query('decisionSelections')
    .withIndex('by_decision_and_user', (query) =>
      query.eq('decisionId', decision._id).eq('userId', user._id),
    )
    .take(MAX_OPTIONS)
  const selectedIds = new Set(
    mySelections.map((selection) => selection.optionId),
  )
  const legacyParticipants =
    decision.participantCount === undefined
      ? await ctx.db
          .query('decisionParticipants')
          .withIndex('by_decision', (query) =>
            query.eq('decisionId', decision._id),
          )
          .take(250)
      : []
  const invitations =
    isHost && 'visibility' in decision && decision.visibility === 'invited'
      ? await ctx.db
          .query('decisionInvitations')
          .withIndex('by_decision_and_email', (query) =>
            query.eq('decisionId', decision._id),
          )
          .take(100)
      : []

  const optionViews: Array<DecisionOptionView> = []
  for (const option of options) {
    const faces: Array<DecisionFace> = []
    if (includeFaces) {
      const selections = await ctx.db
        .query('decisionSelections')
        .withIndex('by_option', (query) => query.eq('optionId', option._id))
        .take(MAX_FACES_PER_OPTION)
      selections.sort((left, right) => left.updatedAt - right.updatedAt)
      for (const selection of selections) {
        const participant = await ctx.db.get('users', selection.userId)
        if (participant !== null) faces.push(decisionFace(participant))
      }
    }
    optionViews.push({
      id: option._id,
      label: option.label,
      order: option.order,
      selectionCount: option.selectionCount,
      selected: selectedIds.has(option._id),
      faces,
    })
  }
  optionViews.sort(
    (left, right) =>
      right.selectionCount - left.selectionCount || left.order - right.order,
  )

  const open = decision.status === 'open'
  return {
    id: decision._id,
    slug: decision.slug,
    title: decision.title,
    description: decision.description ?? null,
    scheduleId: 'scheduleId' in decision ? decision.scheduleId : null,
    visibility: 'visibility' in decision ? decision.visibility : null,
    selectMode: decision.selectMode,
    closesAt: decision.closesAt ?? null,
    status: open ? 'open' : 'closed',
    isHost,
    canSubmitBallot: open,
    options: optionViews,
    invitations: invitations.map((invitation) => ({ email: invitation.email })),
    participantCount: decision.participantCount ?? legacyParticipants.length,
  }
}
