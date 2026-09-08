import { v } from 'convex/values'
import { internalMutation, mutation, query } from './_generated/server'
import { requireUser } from './model'
import {
  addDecisionOption,
  closeDecisionIfDue,
  createAttachedDecision,
  createStandaloneDecision,
  hostCloseDecision,
  listAttachedDecisions,
  listHostedStandalone,
  readDecision,
  removeDecisionOption,
  renameDecisionOption,
  submitDecisionBallot,
  updateDecision,
} from './decisionLifecycle'

const selectMode = v.union(v.literal('single'), v.literal('multi'))
const status = v.union(v.literal('open'), v.literal('closed'))
const face = v.object({
  picture: v.union(v.string(), v.null()),
  initial: v.string(),
})
const optionView = v.object({
  id: v.id('decisionOptions'),
  label: v.string(),
  order: v.number(),
  selectionCount: v.number(),
  selected: v.boolean(),
  faces: v.array(face),
})
const decisionView = v.object({
  id: v.id('decisions'),
  slug: v.string(),
  title: v.string(),
  description: v.union(v.string(), v.null()),
  scheduleId: v.union(v.id('schedules'), v.null()),
  visibility: v.union(v.literal('public'), v.literal('invited'), v.null()),
  selectMode,
  closesAt: v.union(v.number(), v.null()),
  status,
  isHost: v.boolean(),
  canVote: v.boolean(),
  options: v.array(optionView),
  invitations: v.array(v.object({ email: v.string() })),
  participantCount: v.number(),
})
const summary = v.object({
  id: v.id('decisions'),
  slug: v.string(),
  title: v.string(),
  status,
  selectMode,
  closesAt: v.union(v.number(), v.null()),
})
const created = v.object({ id: v.id('decisions'), slug: v.string() })

export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    visibility: v.union(v.literal('public'), v.literal('invited')),
    selectMode,
    options: v.array(v.string()),
    inviteEmails: v.array(v.string()),
    closesAt: v.optional(v.number()),
  },
  returns: created,
  handler: async (ctx, args) =>
    createStandaloneDecision(ctx, await requireUser(ctx), args),
})

export const createAttached = mutation({
  args: {
    scheduleId: v.id('schedules'),
    title: v.string(),
    description: v.optional(v.string()),
    selectMode,
    options: v.array(v.string()),
    closesAt: v.optional(v.number()),
  },
  returns: created,
  handler: async (ctx, args) =>
    createAttachedDecision(ctx, await requireUser(ctx), args),
})

export const listMine = query({
  args: {},
  returns: v.array(summary),
  handler: async (ctx) => listHostedStandalone(ctx, (await requireUser(ctx))._id),
})

export const getBySlug = query({
  args: { slug: v.string(), now: v.number() },
  returns: v.union(decisionView, v.null()),
  handler: async (ctx, args) => readDecision(ctx, args, await requireUser(ctx)),
})

export const listAttached = query({
  args: { scheduleId: v.id('schedules'), now: v.number() },
  returns: v.array(decisionView),
  handler: async (ctx, args) =>
    listAttachedDecisions(ctx, args, await requireUser(ctx)),
})

export const submitBallot = mutation({
  args: {
    decisionId: v.id('decisions'),
    optionIds: v.array(v.id('decisionOptions')),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await submitDecisionBallot(ctx, args, await requireUser(ctx))
    return null
  },
})

export const addOption = mutation({
  args: { decisionId: v.id('decisions'), label: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await addDecisionOption(ctx, args, await requireUser(ctx))
    return null
  },
})

export const renameOption = mutation({
  args: {
    decisionId: v.id('decisions'),
    optionId: v.id('decisionOptions'),
    label: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await renameDecisionOption(ctx, args, await requireUser(ctx))
    return null
  },
})

export const removeOption = mutation({
  args: {
    decisionId: v.id('decisions'),
    optionId: v.id('decisionOptions'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await removeDecisionOption(ctx, args, await requireUser(ctx))
    return null
  },
})

export const update = mutation({
  args: {
    decisionId: v.id('decisions'),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    closesAt: v.optional(v.union(v.number(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await updateDecision(ctx, args, await requireUser(ctx))
    return null
  },
})

export const close = mutation({
  args: { decisionId: v.id('decisions') },
  returns: v.null(),
  handler: async (ctx, args) => {
    await hostCloseDecision(ctx, args.decisionId, await requireUser(ctx))
    return null
  },
})

export const closeIfDue = internalMutation({
  args: { decisionId: v.id('decisions') },
  returns: v.null(),
  handler: async (ctx, args) => {
    await closeDecisionIfDue(ctx, args.decisionId)
    return null
  },
})
