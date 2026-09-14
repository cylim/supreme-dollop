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
  optionKey,
} from '../shared/decisionDraft'
import { internal } from './_generated/api'
import { requireDecisionAccess } from './decisionAccess'
import type {
  AttachedDecisionDraftInput,
  NormalizedAttachedDecisionDraft,
  NormalizedStandaloneDecisionDraft,
  StandaloneDecisionDraftInput,
} from '../shared/decisionDraft'
import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'

function newSlug() {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 16)
}

export async function createStandaloneDecision(
  ctx: MutationCtx,
  host: Doc<'users'>,
  input: StandaloneDecisionDraftInput,
  now = Date.now(),
): Promise<{ id: Id<'decisions'>; slug: string }> {
  return insertStandalone(
    ctx,
    host,
    normalizeStandaloneDecisionDraft(input, now),
  )
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
  return insertAttached(ctx, host, schedule._id, draft)
}

export async function createAttachedFromDraft(
  ctx: MutationCtx,
  host: Doc<'users'>,
  scheduleId: Id<'schedules'>,
  draft: NormalizedAttachedDecisionDraft,
): Promise<{ id: Id<'decisions'>; slug: string }> {
  return insertAttached(ctx, host, scheduleId, draft)
}

async function insertStandalone(
  ctx: MutationCtx,
  host: Doc<'users'>,
  draft: NormalizedStandaloneDecisionDraft,
) {
  const created = await insertDecisionRows(
    ctx,
    {
      hostId: host._id,
      title: draft.title,
      description: draft.description,
      visibility: draft.visibility,
      selectMode: draft.selectMode,
      closesAt: draft.closesAt,
    },
    draft.options,
  )
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
) {
  const created = await insertDecisionRows(
    ctx,
    {
      hostId: host._id,
      title: draft.title,
      description: draft.description,
      scheduleId,
      selectMode: draft.selectMode,
      closesAt: draft.closesAt,
    },
    draft.options,
  )
  await scheduleClose(ctx, created.id, draft.closesAt)
  return created
}

async function insertDecisionRows(
  ctx: MutationCtx,
  decision:
    | {
        hostId: Id<'users'>
        title: string
        description?: string
        visibility: 'public' | 'invited'
        selectMode: 'single' | 'multi'
        closesAt?: number
      }
    | {
        hostId: Id<'users'>
        title: string
        description?: string
        scheduleId: Id<'schedules'>
        selectMode: 'single' | 'multi'
        closesAt?: number
      },
  options: Array<string>,
) {
  const slug = newSlug()
  const decisionId = await ctx.db.insert('decisions', {
    ...decision,
    slug,
    status: 'open',
    participantCount: 0,
  })
  for (const [index, label] of options.entries()) {
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

export async function submitDecisionBallot(
  ctx: MutationCtx,
  args: {
    decisionId: Id<'decisions'>
    optionIds: Array<Id<'decisionOptions'>>
  },
  user: Doc<'users'>,
  now = Date.now(),
): Promise<void> {
  const decision = await requireDecision(ctx, args.decisionId)
  if (
    decision.status !== 'open' ||
    (decision.closesAt !== undefined && decision.closesAt <= now)
  ) {
    throw new Error('This decision is closed.')
  }
  const isHost = decision.hostId === user._id
  await requireDecisionAccess(
    ctx,
    decision,
    user,
    isHost,
    'You do not have an invitation.',
  )
  const uniqueIds = Array.from(new Set(args.optionIds))
  if (uniqueIds.length !== args.optionIds.length) {
    throw new Error('Each option may be selected once.')
  }
  if (uniqueIds.length === 0) {
    await replaceSelections(ctx, decision, user, [], now)
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
  await replaceSelections(ctx, decision, user, uniqueIds, now)
}

async function replaceSelections(
  ctx: MutationCtx,
  decision: Doc<'decisions'>,
  user: Doc<'users'>,
  optionIds: Array<Id<'decisionOptions'>>,
  now: number,
) {
  const existing = await ctx.db
    .query('decisionSelections')
    .withIndex('by_decision_and_user', (query) =>
      query.eq('decisionId', decision._id).eq('userId', user._id),
    )
    .take(MAX_OPTIONS)
  for (const selection of existing) {
    const option = await ctx.db.get('decisionOptions', selection.optionId)
    if (option !== null) {
      await ctx.db.patch('decisionOptions', option._id, {
        selectionCount: Math.max(0, option.selectionCount - 1),
      })
    }
    await ctx.db.delete('decisionSelections', selection._id)
  }
  const participant = await ctx.db
    .query('decisionParticipants')
    .withIndex('by_decision_and_user', (query) =>
      query.eq('decisionId', decision._id).eq('userId', user._id),
    )
    .unique()
  if (optionIds.length === 0) {
    if (participant !== null) {
      await ctx.db.delete('decisionParticipants', participant._id)
      await ctx.db.patch('decisions', decision._id, {
        participantCount: Math.max(0, (decision.participantCount ?? 1) - 1),
      })
    }
    return
  }
  for (const optionId of optionIds) {
    const option = await ctx.db.get('decisionOptions', optionId)
    if (option === null) continue
    await ctx.db.insert('decisionSelections', {
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
      submittedAt: now,
    })
    await ctx.db.patch('decisions', decision._id, {
      participantCount: (decision.participantCount ?? 0) + 1,
    })
  } else {
    await ctx.db.patch('decisionParticipants', participant._id, {
      submittedAt: now,
    })
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
  const order =
    options.reduce((max, option) => Math.max(max, option.order), -1) + 1
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
    await ctx.db.patch('decisions', decision._id, {
      ...patch,
      closesAt: undefined,
    })
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
  if (decision.hostId !== user._id)
    throw new Error('Only the host can close this decision.')
  await closeDecision(ctx, decision._id, now)
}

async function requireDecision(ctx: MutationCtx, decisionId: Id<'decisions'>) {
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
  if (
    decision.status !== 'open' ||
    (decision.closesAt !== undefined && decision.closesAt <= Date.now())
  ) {
    throw new Error('This decision is closed.')
  }
  return decision
}

async function requireOwnedOption(
  ctx: MutationCtx,
  decisionId: Id<'decisions'>,
  optionId: Id<'decisionOptions'>,
) {
  const option = await ctx.db.get('decisionOptions', optionId)
  if (option === null || option.decisionId !== decisionId) {
    throw new Error('That option does not belong to this decision.')
  }
  return option
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
  await ctx.scheduler.runAfter(
    0,
    internal.notifications.sendDecisionInvitations,
    {
      decisionId,
      notificationRunId,
    },
  )
}
