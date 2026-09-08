import {
  
  MAX_ATTACHED_DECISIONS,
  MAX_OPTIONS,
  MIN_OPTIONS,
  
  
  
  normalizeAttachedDecisionDraft,
  normalizeClosesAt,
  normalizeDecisionDescription,
  normalizeDecisionTitle,
  normalizeOptionLabel,
  normalizeStandaloneDecisionDraft,
  optionKey
} from '../shared/decisionDraft'
import { internal } from './_generated/api'
import type {AttachedDecisionDraftInput, NormalizedAttachedDecisionDraft, NormalizedStandaloneDecisionDraft, StandaloneDecisionDraftInput} from '../shared/decisionDraft';
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
  canVote: boolean
  options: Array<DecisionOptionView>
  invitations: Array<{ email: string }>
  participantCount: number
}

export function decisionFace(user: Doc<'users'>): DecisionFace {
  const source = user.name?.trim() || user.email.split('@')[0] || '?'
  const initial = Array.from(source)[0]?.toUpperCase() ?? '?'
  return { picture: user.picture ?? null, initial }
}

function newSlug() {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 16)
}

export async function createStandaloneDecision(
  ctx: MutationCtx,
  host: Doc<'users'>,
  input: StandaloneDecisionDraftInput,
  now = Date.now(),
): Promise<{ id: Id<'decisions'>; slug: string }> {
  return insertStandalone(ctx, host, normalizeStandaloneDecisionDraft(input, now), now)
}

export async function createAttachedDecision(
  ctx: MutationCtx,
  host: Doc<'users'>,
  input: AttachedDecisionDraftInput & { scheduleId: Id<'schedules'> },
  now = Date.now(),
): Promise<{ id: Id<'decisions'>; slug: string }> {
  const schedule = await ctx.db.get('schedules', input.scheduleId)
  if (schedule === null) throw new Error('Schedule not found.')
  if (schedule.hostId !== host._id) {
    throw new Error('Only the host can attach a decision.')
  }
  const existing = await ctx.db
    .query('decisions')
    .withIndex('by_schedule', (query) => query.eq('scheduleId', schedule._id))
    .take(MAX_ATTACHED_DECISIONS + 1)
  if (existing.length >= MAX_ATTACHED_DECISIONS) {
    throw new Error('A schedule can have at most 20 attached decisions.')
  }
  const draft = normalizeAttachedDecisionDraft(input, now)
  return insertAttached(ctx, host, schedule._id, draft, now)
}

export async function createAttachedFromDraft(
  ctx: MutationCtx,
  host: Doc<'users'>,
  scheduleId: Id<'schedules'>,
  draft: NormalizedAttachedDecisionDraft,
  now = Date.now(),
): Promise<{ id: Id<'decisions'>; slug: string }> {
  return insertAttached(ctx, host, scheduleId, draft, now)
}

async function insertStandalone(
  ctx: MutationCtx,
  host: Doc<'users'>,
  draft: NormalizedStandaloneDecisionDraft,
  now: number,
) {
  const created = await insertDecisionRows(ctx, {
    hostId: host._id,
    title: draft.title,
    description: draft.description,
    visibility: draft.visibility,
    selectMode: draft.selectMode,
    closesAt: draft.closesAt,
    options: draft.options,
    now,
  })
  if (draft.visibility === 'invited') {
    for (const email of draft.inviteEmails) {
      await ctx.db.insert('decisionInvitations', {
        decisionId: created.id,
        email,
      })
    }
    await queueDecisionInvitation(ctx, created.id)
  }
  await scheduleClose(ctx, created.id, draft.closesAt)
  return created
}

async function insertAttached(
  ctx: MutationCtx,
  host: Doc<'users'>,
  scheduleId: Id<'schedules'>,
  draft: NormalizedAttachedDecisionDraft,
  now: number,
) {
  const created = await insertDecisionRows(ctx, {
    hostId: host._id,
    title: draft.title,
    description: draft.description,
    scheduleId,
    selectMode: draft.selectMode,
    closesAt: draft.closesAt,
    options: draft.options,
    now,
  })
  await scheduleClose(ctx, created.id, draft.closesAt)
  return created
}

async function insertDecisionRows(
  ctx: MutationCtx,
  args: {
    hostId: Id<'users'>
    title: string
    description?: string
    scheduleId?: Id<'schedules'>
    visibility?: 'public' | 'invited'
    selectMode: 'single' | 'multi'
    closesAt?: number
    options: Array<string>
    now: number
  },
) {
  const slug = newSlug()
  const decisionId = await ctx.db.insert('decisions', {
    hostId: args.hostId,
    slug,
    title: args.title,
    ...(args.description ? { description: args.description } : {}),
    ...(args.scheduleId ? { scheduleId: args.scheduleId } : {}),
    ...(args.visibility ? { visibility: args.visibility } : {}),
    selectMode: args.selectMode,
    ...(args.closesAt !== undefined ? { closesAt: args.closesAt } : {}),
    status: 'open',
  })
  for (const [index, label] of args.options.entries()) {
    await ctx.db.insert('decisionOptions', {
      decisionId,
      label,
      order: index,
      selectionCount: 0,
    })
  }
  return { id: decisionId, slug }
}

async function scheduleClose(
  ctx: MutationCtx,
  decisionId: Id<'decisions'>,
  closesAt: number | undefined,
) {
  if (closesAt === undefined) return
  await ctx.scheduler.runAt(closesAt, internal.decisions.closeIfDue, {
    decisionId,
  })
}

export async function readDecision(
  ctx: QueryCtx,
  args: { slug: string; now: number },
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
    'This decision is limited to invited guests.',
  )
  return buildView(ctx, decision, user, isHost, args.now)
}

export async function listAttachedDecisions(
  ctx: QueryCtx,
  args: { scheduleId: Id<'schedules'>; now: number },
  user: Doc<'users'>,
): Promise<Array<DecisionView>> {
  const schedule = await ctx.db.get('schedules', args.scheduleId)
  if (schedule === null) throw new Error('Schedule not found.')
  const isScheduleHost = schedule.hostId === user._id
  await requireScheduleGuestAccess(
    ctx,
    schedule,
    user,
    isScheduleHost,
    'This schedule is limited to invited guests.',
  )
  const decisions = await ctx.db
    .query('decisions')
    .withIndex('by_schedule', (query) => query.eq('scheduleId', schedule._id))
    .take(MAX_ATTACHED_DECISIONS)
  const views: Array<DecisionView> = []
  for (const decision of decisions) {
    views.push(
      await buildView(ctx, decision, user, decision.hostId === user._id, args.now),
    )
  }
  return views
}

export async function listHostedStandalone(
  ctx: QueryCtx,
  hostId: Id<'users'>,
) {
  const decisions = await ctx.db
    .query('decisions')
    .withIndex('by_host', (query) => query.eq('hostId', hostId))
    .order('desc')
    .take(50)
  return decisions
    .filter((decision) => decision.scheduleId === undefined)
    .map((decision) => ({
      id: decision._id,
      slug: decision.slug,
      title: decision.title,
      status: decision.status,
      selectMode: decision.selectMode,
      closesAt: decision.closesAt ?? null,
    }))
}

async function buildView(
  ctx: ReadCtx,
  decision: Doc<'decisions'>,
  user: Doc<'users'>,
  isHost: boolean,
  now: number,
): Promise<DecisionView> {
  const options = await ctx.db
    .query('decisionOptions')
    .withIndex('by_decision_and_order', (query) =>
      query.eq('decisionId', decision._id),
    )
    .take(MAX_OPTIONS)
  const myVotes = await ctx.db
    .query('decisionVotes')
    .withIndex('by_decision_and_user', (query) =>
      query.eq('decisionId', decision._id).eq('userId', user._id),
    )
    .take(MAX_OPTIONS)
  const selectedIds = new Set(myVotes.map((vote) => vote.optionId))
  const participants = await ctx.db
    .query('decisionParticipants')
    .withIndex('by_decision', (query) => query.eq('decisionId', decision._id))
    .take(250)
  const invitations =
    isHost && decision.visibility === 'invited'
      ? await ctx.db
          .query('decisionInvitations')
          .withIndex('by_decision_and_email', (query) =>
            query.eq('decisionId', decision._id),
          )
          .take(100)
      : []

  const optionViews: Array<DecisionOptionView> = []
  for (const option of options) {
    const votes = await ctx.db
      .query('decisionVotes')
      .withIndex('by_option', (query) => query.eq('optionId', option._id))
      .take(250)
    votes.sort((left, right) => left.updatedAt - right.updatedAt)
    const faces: Array<DecisionFace> = []
    for (const vote of votes) {
      const voter = await ctx.db.get('users', vote.userId)
      if (voter !== null) faces.push(decisionFace(voter))
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

  const open =
    decision.status === 'open' &&
    (decision.closesAt === undefined || decision.closesAt > now)
  return {
    id: decision._id,
    slug: decision.slug,
    title: decision.title,
    description: decision.description ?? null,
    scheduleId: decision.scheduleId ?? null,
    visibility: decision.visibility ?? null,
    selectMode: decision.selectMode,
    closesAt: decision.closesAt ?? null,
    status: open ? 'open' : decision.status === 'closed' ? 'closed' : 'open',
    isHost,
    canVote: open,
    options: optionViews,
    invitations: invitations.map((invitation) => ({ email: invitation.email })),
    participantCount: participants.length,
  }
}

export async function submitDecisionBallot(
  ctx: MutationCtx,
  args: { decisionId: Id<'decisions'>; optionIds: Array<Id<'decisionOptions'>> },
  user: Doc<'users'>,
  now = Date.now(),
): Promise<void> {
  const decision = await requireDecision(ctx, args.decisionId)
  if (decision.status !== 'open' || (decision.closesAt !== undefined && decision.closesAt <= now)) {
    if (decision.status === 'open') await closeDecision(ctx, decision._id, now)
    throw new Error('This decision is closed.')
  }
  const isHost = decision.hostId === user._id
  await requireDecisionAccess(ctx, decision, user, isHost, 'You were not invited.')
  const uniqueIds = Array.from(new Set(args.optionIds))
  if (uniqueIds.length !== args.optionIds.length) {
    throw new Error('Each option may be selected once.')
  }
  if (uniqueIds.length === 0) {
    await replaceVotes(ctx, decision, user, [], now)
    return
  }
  if (decision.selectMode === 'single' && uniqueIds.length !== 1) {
    throw new Error('Pick one option.')
  }
  const options = await ctx.db
    .query('decisionOptions')
    .withIndex('by_decision_and_order', (query) =>
      query.eq('decisionId', decision._id),
    )
    .take(MAX_OPTIONS)
  const byId = new Map(options.map((option) => [option._id, option]))
  for (const optionId of uniqueIds) {
    const option = byId.get(optionId)
    if (option === undefined) {
      throw new Error('An option does not belong to this decision.')
    }
  }
  await replaceVotes(ctx, decision, user, uniqueIds, now)
}

async function replaceVotes(
  ctx: MutationCtx,
  decision: Doc<'decisions'>,
  user: Doc<'users'>,
  optionIds: Array<Id<'decisionOptions'>>,
  now: number,
) {
  const existing = await ctx.db
    .query('decisionVotes')
    .withIndex('by_decision_and_user', (query) =>
      query.eq('decisionId', decision._id).eq('userId', user._id),
    )
    .take(MAX_OPTIONS)
  for (const vote of existing) {
    const option = await ctx.db.get('decisionOptions', vote.optionId)
    if (option !== null) {
      await ctx.db.patch('decisionOptions', option._id, {
        selectionCount: Math.max(0, option.selectionCount - 1),
      })
    }
    await ctx.db.delete('decisionVotes', vote._id)
  }
  const participant = await ctx.db
    .query('decisionParticipants')
    .withIndex('by_decision_and_user', (query) =>
      query.eq('decisionId', decision._id).eq('userId', user._id),
    )
    .unique()
  if (optionIds.length === 0) {
    if (participant !== null) await ctx.db.delete('decisionParticipants', participant._id)
    return
  }
  for (const optionId of optionIds) {
    const option = await ctx.db.get('decisionOptions', optionId)
    if (option === null) continue
    await ctx.db.insert('decisionVotes', {
      decisionId: decision._id,
      optionId,
      userId: user._id,
      updatedAt: now,
    })
    await ctx.db.patch('decisionOptions', option._id, {
      selectionCount: option.selectionCount + 1,
    })
  }
  if (participant === null) {
    await ctx.db.insert('decisionParticipants', {
      decisionId: decision._id,
      userId: user._id,
      votedAt: now,
    })
  } else {
    await ctx.db.patch('decisionParticipants', participant._id, { votedAt: now })
  }
}

export async function addDecisionOption(
  ctx: MutationCtx,
  args: { decisionId: Id<'decisions'>; label: string },
  user: Doc<'users'>,
) {
  const decision = await requireOpenHost(ctx, args.decisionId, user)
  const options = await ctx.db
    .query('decisionOptions')
    .withIndex('by_decision_and_order', (query) =>
      query.eq('decisionId', decision._id),
    )
    .take(MAX_OPTIONS)
  if (options.length >= MAX_OPTIONS) {
    throw new Error('A decision can have at most 100 options.')
  }
  const label = normalizeOptionLabel(args.label)
  const key = optionKey(label)
  if (options.some((option) => optionKey(option.label) === key)) {
    throw new Error('Option labels must be unique.')
  }
  const order = options.reduce((max, option) => Math.max(max, option.order), -1) + 1
  await ctx.db.insert('decisionOptions', {
    decisionId: decision._id,
    label,
    order,
    selectionCount: 0,
  })
}

export async function renameDecisionOption(
  ctx: MutationCtx,
  args: {
    decisionId: Id<'decisions'>
    optionId: Id<'decisionOptions'>
    label: string
  },
  user: Doc<'users'>,
) {
  const decision = await requireOpenHost(ctx, args.decisionId, user)
  const option = await requireOwnedOption(ctx, decision._id, args.optionId)
  const label = normalizeOptionLabel(args.label)
  const key = optionKey(label)
  const options = await ctx.db
    .query('decisionOptions')
    .withIndex('by_decision_and_order', (query) =>
      query.eq('decisionId', decision._id),
    )
    .take(MAX_OPTIONS)
  if (
    options.some(
      (item) => item._id !== option._id && optionKey(item.label) === key,
    )
  ) {
    throw new Error('Option labels must be unique.')
  }
  await ctx.db.patch('decisionOptions', option._id, { label })
}

export async function removeDecisionOption(
  ctx: MutationCtx,
  args: { decisionId: Id<'decisions'>; optionId: Id<'decisionOptions'> },
  user: Doc<'users'>,
) {
  const decision = await requireOpenHost(ctx, args.decisionId, user)
  const option = await requireOwnedOption(ctx, decision._id, args.optionId)
  if (option.selectionCount > 0) {
    throw new Error('That option has a selection.')
  }
  const options = await ctx.db
    .query('decisionOptions')
    .withIndex('by_decision_and_order', (query) =>
      query.eq('decisionId', decision._id),
    )
    .take(MAX_OPTIONS)
  if (options.length <= MIN_OPTIONS) {
    throw new Error('A decision needs at least two options.')
  }
  await ctx.db.delete('decisionOptions', option._id)
}

export async function updateDecision(
  ctx: MutationCtx,
  args: {
    decisionId: Id<'decisions'>
    title?: string
    description?: string
    closesAt?: number | null
  },
  user: Doc<'users'>,
  now = Date.now(),
) {
  const decision = await requireOpenHost(ctx, args.decisionId, user)
  const patch: {
    title?: string
    description?: string
    closesAt?: number
  } = {}
  if (args.title !== undefined) patch.title = normalizeDecisionTitle(args.title)
  if (args.description !== undefined) {
    const description = normalizeDecisionDescription(args.description)
    if (description) patch.description = description
  }
  if (args.closesAt === null) {
    await ctx.db.patch('decisions', decision._id, { ...patch, closesAt: undefined })
    return
  }
  if (args.closesAt !== undefined) {
    patch.closesAt = normalizeClosesAt(args.closesAt, now)
  }
  await ctx.db.patch('decisions', decision._id, patch)
  if (patch.closesAt !== undefined) {
    await scheduleClose(ctx, decision._id, patch.closesAt)
  }
}

export async function closeDecision(
  ctx: MutationCtx,
  decisionId: Id<'decisions'>,
  now = Date.now(),
): Promise<void> {
  const decision = await ctx.db.get('decisions', decisionId)
  if (decision !== null && decision.status === 'open') {
    await ctx.db.patch('decisions', decision._id, {
      status: 'closed',
      closedAt: now,
    })
  }
}

export async function closeDecisionIfDue(
  ctx: MutationCtx,
  decisionId: Id<'decisions'>,
  now = Date.now(),
): Promise<void> {
  const decision = await ctx.db.get('decisions', decisionId)
  if (
    decision !== null &&
    decision.status === 'open' &&
    decision.closesAt !== undefined &&
    decision.closesAt <= now
  ) {
    await closeDecision(ctx, decision._id, now)
  }
}

export async function hostCloseDecision(
  ctx: MutationCtx,
  decisionId: Id<'decisions'>,
  user: Doc<'users'>,
  now = Date.now(),
) {
  const decision = await requireDecision(ctx, decisionId)
  if (decision.hostId !== user._id) throw new Error('Only the host can close this decision.')
  await closeDecision(ctx, decision._id, now)
}

async function requireDecision(ctx: ReadCtx, decisionId: Id<'decisions'>) {
  const decision = await ctx.db.get('decisions', decisionId)
  if (decision === null) throw new Error('Decision not found.')
  return decision
}

async function requireOpenHost(
  ctx: MutationCtx,
  decisionId: Id<'decisions'>,
  user: Doc<'users'>,
) {
  const decision = await requireDecision(ctx, decisionId)
  if (decision.hostId !== user._id) {
    throw new Error('Only the host can edit this decision.')
  }
  if (decision.status !== 'open') throw new Error('This decision is closed.')
  return decision
}

async function requireOwnedOption(
  ctx: ReadCtx,
  decisionId: Id<'decisions'>,
  optionId: Id<'decisionOptions'>,
) {
  const option = await ctx.db.get('decisionOptions', optionId)
  if (option === null || option.decisionId !== decisionId) {
    throw new Error('That option does not belong to this decision.')
  }
  return option
}

async function requireDecisionAccess(
  ctx: ReadCtx,
  decision: Doc<'decisions'>,
  user: Doc<'users'>,
  isHost: boolean,
  failureMessage: string,
) {
  if (isHost) return
  if (decision.scheduleId !== undefined) {
    const schedule = await ctx.db.get('schedules', decision.scheduleId)
    if (schedule === null) throw new Error('Schedule not found.')
    await requireScheduleGuestAccess(ctx, schedule, user, false, failureMessage)
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

async function requireScheduleGuestAccess(
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

async function queueDecisionInvitation(
  ctx: MutationCtx,
  decisionId: Id<'decisions'>,
) {
  const notificationRunId = await ctx.db.insert('notificationRuns', {
    decisionId,
    kind: 'decision_invitation',
    status: 'pending',
  })
  await ctx.scheduler.runAfter(0, internal.notifications.sendDecisionInvitations, {
    decisionId,
    notificationRunId,
  })
}
