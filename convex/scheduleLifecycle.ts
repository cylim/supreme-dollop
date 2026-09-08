import {  normalizeScheduleDraft } from '../shared/scheduleDraft'
import { internal } from './_generated/api'
import type {ScheduleDraftInput} from '../shared/scheduleDraft';
import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'

type ReadCtx = QueryCtx | MutationCtx

export async function createSchedule(
  ctx: MutationCtx,
  host: Doc<'users'>,
  input: ScheduleDraftInput,
  now = Date.now(),
): Promise<{ id: Id<'schedules'>; slug: string }> {
  const draft = normalizeScheduleDraft(input, now)
  const slug = crypto.randomUUID().replaceAll('-', '').slice(0, 16)
  const scheduleId = await ctx.db.insert('schedules', {
    hostId: host._id,
    slug,
    title: draft.title,
    ...(draft.description ? { description: draft.description } : {}),
    visibility: draft.visibility,
    timezone: draft.timezone,
    durationMinutes: draft.durationMinutes,
    votingClosesAt: draft.votingClosesAt,
    status: 'open',
  })
  for (const candidate of draft.options) {
    await ctx.db.insert('scheduleOptions', {
      scheduleId,
      ...candidate,
      availableCount: 0,
    })
  }
  if (draft.visibility === 'invited') {
    for (const email of draft.inviteEmails) {
      await ctx.db.insert('invitations', { scheduleId, email, status: 'pending' })
    }
    await queueNotification(ctx, scheduleId, 'invitation')
  }
  await ctx.scheduler.runAt(
    draft.votingClosesAt,
    internal.schedules.closeVoting,
    { scheduleId },
  )
  return { id: scheduleId, slug }
}

export async function readSchedule(
  ctx: QueryCtx,
  args: { slug: string; now: number },
  user: Doc<'users'>,
) {
  const schedule = await ctx.db
    .query('schedules')
    .withIndex('by_slug', (query) => query.eq('slug', args.slug))
    .unique()
  if (schedule === null) return null
  const isHost = schedule.hostId === user._id
  await requireAccess(
    ctx,
    schedule,
    user,
    isHost,
    'This schedule is limited to invited guests.',
  )

  const options = await ctx.db
    .query('scheduleOptions')
    .withIndex('by_schedule_and_start_at', (query) =>
      query.eq('scheduleId', schedule._id),
    )
    .take(100)
  const ballots = await ctx.db
    .query('votes')
    .withIndex('by_schedule_and_user', (query) =>
      query.eq('scheduleId', schedule._id).eq('userId', user._id),
    )
    .take(100)
  const ballotsByCandidate = new Map(
    ballots.map((ballot) => [ballot.optionId, ballot.available]),
  )
  const participants = await ctx.db
    .query('scheduleParticipants')
    .withIndex('by_schedule', (query) => query.eq('scheduleId', schedule._id))
    .take(250)
  const invitations = isHost
    ? await ctx.db
        .query('invitations')
        .withIndex('by_schedule_and_status', (query) =>
          query.eq('scheduleId', schedule._id),
        )
        .take(100)
    : []
  const recommended = options.reduce<(typeof options)[number] | null>(
    (best, candidate) =>
      best === null ||
      candidate.availableCount > best.availableCount ||
      (candidate.availableCount === best.availableCount &&
        candidate.startAt < best.startAt)
        ? candidate
        : best,
    null,
  )
  return {
    id: schedule._id,
    title: schedule.title,
    description: schedule.description ?? null,
    visibility: schedule.visibility,
    timezone: schedule.timezone,
    durationMinutes: schedule.durationMinutes,
    votingClosesAt: schedule.votingClosesAt,
    status: schedule.status,
    isHost,
    canVote: schedule.status === 'open' && schedule.votingClosesAt > args.now,
    selectedOptionId: schedule.selectedOptionId ?? null,
    recommendedOptionId: recommended?._id ?? null,
    options: options.map((candidate) => ({
      id: candidate._id,
      startAt: candidate.startAt,
      endAt: candidate.endAt,
      source: candidate.source,
      availableCount: candidate.availableCount,
      myVote: ballotsByCandidate.get(candidate._id) ?? null,
    })),
    invitations: invitations.map((invitation) => ({
      email: invitation.email,
      status: invitation.status,
    })),
    participantCount: participants.length,
  }
}

export async function submitBallot(
  ctx: MutationCtx,
  args: {
    scheduleId: Id<'schedules'>
    responses: Array<{ optionId: Id<'scheduleOptions'>; available: boolean }>
  },
  user: Doc<'users'>,
  now = Date.now(),
): Promise<void> {
  const schedule = await requireSchedule(ctx, args.scheduleId)
  if (schedule.status !== 'open' || schedule.votingClosesAt <= now) {
    if (schedule.status === 'open') await closeVoting(ctx, schedule._id, now)
    throw new Error('Voting has closed.')
  }
  if (args.responses.length > 100) throw new Error('Too many voting responses.')
  const isHost = schedule.hostId === user._id
  const invitation = await requireAccess(
    ctx,
    schedule,
    user,
    isHost,
    'You were not invited.',
  )
  const responses = new Map(
    args.responses.map((response) => [response.optionId, response.available]),
  )
  if (responses.size !== args.responses.length) {
    throw new Error('Each candidate may be voted on once.')
  }
  const candidates = await ctx.db
    .query('scheduleOptions')
    .withIndex('by_schedule_and_start_at', (query) =>
      query.eq('scheduleId', schedule._id),
    )
    .take(100)
  if (responses.size !== candidates.length) {
    throw new Error('Submit one response for every candidate time.')
  }
  const candidatesById = new Map(
    candidates.map((candidate) => [candidate._id, candidate]),
  )
  for (const [candidateId, available] of responses) {
    const candidate = candidatesById.get(candidateId)
    if (candidate === undefined) {
      throw new Error('A candidate does not belong to this schedule.')
    }
    const existing = await ctx.db
      .query('votes')
      .withIndex('by_option_and_user', (query) =>
        query.eq('optionId', candidateId).eq('userId', user._id),
      )
      .unique()
    if (existing === null) {
      await ctx.db.insert('votes', {
        scheduleId: schedule._id,
        optionId: candidateId,
        userId: user._id,
        available,
        updatedAt: now,
      })
      if (available) {
        await ctx.db.patch('scheduleOptions', candidateId, {
          availableCount: candidate.availableCount + 1,
        })
      }
    } else if (existing.available !== available) {
      await ctx.db.patch('votes', existing._id, { available, updatedAt: now })
      await ctx.db.patch('scheduleOptions', candidateId, {
        availableCount: Math.max(
          0,
          candidate.availableCount + (available ? 1 : -1),
        ),
      })
    }
  }
  const participant = await ctx.db
    .query('scheduleParticipants')
    .withIndex('by_schedule_and_user', (query) =>
      query.eq('scheduleId', schedule._id).eq('userId', user._id),
    )
    .unique()
  if (participant === null) {
    await ctx.db.insert('scheduleParticipants', {
      scheduleId: schedule._id,
      userId: user._id,
      votedAt: now,
    })
  } else {
    await ctx.db.patch('scheduleParticipants', participant._id, { votedAt: now })
  }
  if (invitation !== null && invitation.status !== 'voted') {
    await ctx.db.patch('invitations', invitation._id, { status: 'voted' })
    const pending = await ctx.db
      .query('invitations')
      .withIndex('by_schedule_and_status', (query) =>
        query.eq('scheduleId', schedule._id).eq('status', 'pending'),
      )
      .first()
    if (pending === null) await closeVoting(ctx, schedule._id, now)
  }
}

export async function finalizeSchedule(
  ctx: MutationCtx,
  args: { scheduleId: Id<'schedules'>; optionId: Id<'scheduleOptions'> },
  user: Doc<'users'>,
  now = Date.now(),
): Promise<void> {
  const schedule = await requireSchedule(ctx, args.scheduleId)
  if (schedule.hostId !== user._id) throw new Error('Only the host can choose.')
  if (schedule.status !== 'awaiting_confirmation') {
    throw new Error('Voting must close before choosing the final time.')
  }
  const candidate = await ctx.db.get('scheduleOptions', args.optionId)
  if (candidate === null || candidate.scheduleId !== schedule._id) {
    throw new Error('That candidate does not belong to this schedule.')
  }
  await ctx.db.patch('schedules', schedule._id, {
    selectedOptionId: candidate._id,
    status: 'finalized',
    finalizedAt: now,
  })
  await queueNotification(ctx, schedule._id, 'finalized')
}

export async function closeVoting(
  ctx: MutationCtx,
  scheduleId: Id<'schedules'>,
  now = Date.now(),
): Promise<void> {
  const schedule = await ctx.db.get('schedules', scheduleId)
  if (schedule !== null && schedule.status === 'open') {
    await ctx.db.patch('schedules', schedule._id, {
      status: 'awaiting_confirmation',
      closedAt: now,
    })
  }
}

async function requireSchedule(ctx: ReadCtx, scheduleId: Id<'schedules'>) {
  const schedule = await ctx.db.get('schedules', scheduleId)
  if (schedule === null) throw new Error('Schedule not found.')
  return schedule
}

async function requireAccess(
  ctx: ReadCtx,
  schedule: Doc<'schedules'>,
  user: Doc<'users'>,
  isHost: boolean,
  failureMessage: string,
): Promise<Doc<'invitations'> | null> {
  if (schedule.visibility === 'public' || isHost) return null
  const invitation = await ctx.db
    .query('invitations')
    .withIndex('by_schedule_and_email', (query) =>
      query.eq('scheduleId', schedule._id).eq('email', user.email),
    )
    .unique()
  if (invitation === null) {
    throw new Error(failureMessage)
  }
  return invitation
}

async function queueNotification(
  ctx: MutationCtx,
  scheduleId: Id<'schedules'>,
  kind: 'invitation' | 'finalized',
) {
  const notificationRunId = await ctx.db.insert('notificationRuns', {
    scheduleId,
    kind,
    status: 'pending',
  })
  await ctx.scheduler.runAfter(
    0,
    kind === 'invitation'
      ? internal.notifications.sendInvitations
      : internal.notifications.sendFinalized,
    { scheduleId, notificationRunId },
  )
}
