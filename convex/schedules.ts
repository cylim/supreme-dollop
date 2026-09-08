import { v } from 'convex/values'
import { internalMutation, mutation, query } from './_generated/server'
import { requireUser } from './model'
import {
  closeVoting as closeScheduleVoting,
  createSchedule,
  finalizeSchedule,
  readSchedule,
  submitBallot,
} from './scheduleLifecycle'

const optionInput = v.object({
  startAt: v.number(),
  endAt: v.number(),
  source: v.union(v.literal('exact'), v.literal('range')),
})
const optionView = v.object({
  id: v.id('scheduleOptions'),
  startAt: v.number(),
  endAt: v.number(),
  source: v.union(v.literal('exact'), v.literal('range')),
  availableCount: v.number(),
  myVote: v.union(v.boolean(), v.null()),
})
const status = v.union(
  v.literal('open'),
  v.literal('awaiting_confirmation'),
  v.literal('finalized'),
  v.literal('cancelled'),
)
const summary = v.object({
  id: v.id('schedules'),
  slug: v.string(),
  title: v.string(),
  visibility: v.union(v.literal('public'), v.literal('invited')),
  status,
  votingClosesAt: v.number(),
})
const invitationView = v.object({
  email: v.string(),
  status: v.union(v.literal('pending'), v.literal('voted')),
})

export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    visibility: v.union(v.literal('public'), v.literal('invited')),
    timezone: v.string(),
    durationMinutes: v.number(),
    votingClosesAt: v.number(),
    options: v.array(optionInput),
    inviteEmails: v.array(v.string()),
  },
  returns: v.object({ id: v.id('schedules'), slug: v.string() }),
  handler: async (ctx, args) => createSchedule(ctx, await requireUser(ctx), args),
})

export const listMine = query({
  args: {},
  returns: v.array(summary),
  handler: async (ctx) => {
    const user = await requireUser(ctx)
    const schedules = await ctx.db
      .query('schedules')
      .withIndex('by_host_and_status', (value) => value.eq('hostId', user._id))
      .order('desc')
      .take(50)
    return schedules.map((schedule) => ({
      id: schedule._id,
      slug: schedule.slug,
      title: schedule.title,
      visibility: schedule.visibility,
      status: schedule.status,
      votingClosesAt: schedule.votingClosesAt,
    }))
  },
})

export const getBySlug = query({
  args: { slug: v.string(), now: v.number() },
  returns: v.union(
    v.object({
      id: v.id('schedules'),
      title: v.string(),
      description: v.union(v.string(), v.null()),
      visibility: v.union(v.literal('public'), v.literal('invited')),
      timezone: v.string(),
      durationMinutes: v.number(),
      votingClosesAt: v.number(),
      status,
      isHost: v.boolean(),
      canVote: v.boolean(),
      selectedOptionId: v.union(v.id('scheduleOptions'), v.null()),
      recommendedOptionId: v.union(v.id('scheduleOptions'), v.null()),
      options: v.array(optionView),
      invitations: v.array(invitationView),
      participantCount: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => readSchedule(ctx, args, await requireUser(ctx)),
})

export const submitVote = mutation({
  args: {
    scheduleId: v.id('schedules'),
    responses: v.array(
      v.object({ optionId: v.id('scheduleOptions'), available: v.boolean() }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await submitBallot(ctx, args, await requireUser(ctx))
    return null
  },
})

export const chooseFinal = mutation({
  args: { scheduleId: v.id('schedules'), optionId: v.id('scheduleOptions') },
  returns: v.null(),
  handler: async (ctx, args) => {
    await finalizeSchedule(ctx, args, await requireUser(ctx))
    return null
  },
})

export const closeVoting = internalMutation({
  args: { scheduleId: v.id('schedules') },
  returns: v.null(),
  handler: async (ctx, args) => {
    await closeScheduleVoting(ctx, args.scheduleId)
    return null
  },
})
