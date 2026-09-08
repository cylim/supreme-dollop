import { v } from 'convex/values'
import { parseInboundRequest } from '../shared/inboundScheduleRequest'
import { internalMutation, internalQuery } from './_generated/server'
import { internal } from './_generated/api'
import { createAttachedFromDraft, createStandaloneDecision } from './decisionLifecycle'
import { createSchedule } from './scheduleLifecycle'
import type { Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'

const requestStatus = v.union(
  v.literal('pending'),
  v.literal('created'),
  v.literal('rejected'),
)

export const accept = internalMutation({
  args: {
    eventId: v.string(),
    messageId: v.string(),
    inboxId: v.string(),
    senderEmail: v.string(),
    body: v.string(),
  },
  returns: v.object({ accepted: v.boolean() }),
  handler: async (ctx, args): Promise<{ accepted: boolean }> => {
    const existing = await ctx.db
      .query('inboundScheduleRequests')
      .withIndex('by_event_id', (query) => query.eq('eventId', args.eventId))
      .unique()
    if (existing !== null) return { accepted: false }
    const requestId = await ctx.db.insert('inboundScheduleRequests', {
      ...args,
      status: 'pending',
      receivedAt: Date.now(),
    })
    await ctx.scheduler.runAfter(0, internal.inboundScheduleModel.process, {
      requestId,
    })
    return { accepted: true }
  },
})

export const process = internalMutation({
  args: { requestId: v.id('inboundScheduleRequests') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const request = await ctx.db.get('inboundScheduleRequests', args.requestId)
    if (request === null || request.status !== 'pending' || !request.body)
      return null
    let parsed
    try {
      parsed = parseInboundRequest(request.body)
    } catch (error) {
      await ctx.db.patch('inboundScheduleRequests', request._id, {
        status: 'rejected',
        errorCode: 'invalid_request',
        errorMessage:
          error instanceof Error
            ? error.message.slice(0, 500)
            : 'Invalid request.',
        body: undefined,
        processedAt: Date.now(),
      })
      await scheduleReply(ctx, request._id)
      return null
    }
    const host = await ctx.db
      .query('users')
      .withIndex('by_email', (query) => query.eq('email', request.senderEmail))
      .unique()
    if (host === null) {
      await ctx.db.patch('inboundScheduleRequests', request._id, {
        status: 'rejected',
        errorCode: 'unknown_sender',
        errorMessage:
          'Create a JRNY Plan account with this email address first.',
        body: undefined,
        processedAt: Date.now(),
      })
      await scheduleReply(ctx, request._id)
      return null
    }
    if (parsed.kind === 'decision') {
      const decision = await createStandaloneDecision(ctx, host, parsed.decision)
      await ctx.db.patch('inboundScheduleRequests', request._id, {
        status: 'created',
        decisionId: decision.id,
        body: undefined,
        processedAt: Date.now(),
      })
    } else {
      const schedule = await createSchedule(ctx, host, parsed.schedule)
      for (const draft of parsed.decisions) {
        await createAttachedFromDraft(ctx, host, schedule.id, draft)
      }
      await ctx.db.patch('inboundScheduleRequests', request._id, {
        status: 'created',
        scheduleId: schedule.id,
        body: undefined,
        processedAt: Date.now(),
      })
    }
    await scheduleReply(ctx, request._id)
    return null
  },
})

export const getReplyPayload = internalQuery({
  args: { requestId: v.id('inboundScheduleRequests') },
  returns: v.union(
    v.object({
      eventId: v.string(),
      messageId: v.string(),
      inboxId: v.string(),
      senderEmail: v.string(),
      status: requestStatus,
      scheduleSlug: v.union(v.string(), v.null()),
      scheduleTitle: v.union(v.string(), v.null()),
      decisionSlug: v.union(v.string(), v.null()),
      decisionTitle: v.union(v.string(), v.null()),
      attachedDecisions: v.array(
        v.object({ slug: v.string(), title: v.string() }),
      ),
      errorMessage: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const request = await ctx.db.get('inboundScheduleRequests', args.requestId)
    if (request === null) return null
    const schedule = request.scheduleId
      ? await ctx.db.get('schedules', request.scheduleId)
      : null
    const decision = request.decisionId
      ? await ctx.db.get('decisions', request.decisionId)
      : null
    const attached = schedule
      ? await ctx.db
          .query('decisions')
          .withIndex('by_schedule', (query) => query.eq('scheduleId', schedule._id))
          .take(20)
      : []
    return {
      eventId: request.eventId,
      messageId: request.messageId,
      inboxId: request.inboxId,
      senderEmail: request.senderEmail,
      status: request.status,
      scheduleSlug: schedule?.slug ?? null,
      scheduleTitle: schedule?.title ?? null,
      decisionSlug: decision?.slug ?? null,
      decisionTitle: decision?.title ?? null,
      attachedDecisions: attached.map((item) => ({
        slug: item.slug,
        title: item.title,
      })),
      errorMessage: request.errorMessage ?? null,
    }
  },
})

export const markReply = internalMutation({
  args: {
    requestId: v.id('inboundScheduleRequests'),
    replyStatus: v.union(
      v.literal('sent'),
      v.literal('failed'),
      v.literal('skipped'),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const request = await ctx.db.get('inboundScheduleRequests', args.requestId)
    if (request !== null) {
      await ctx.db.patch('inboundScheduleRequests', request._id, {
        replyStatus: args.replyStatus,
      })
    }
    return null
  },
})

async function scheduleReply(
  ctx: MutationCtx,
  requestId: Id<'inboundScheduleRequests'>,
) {
  await ctx.scheduler.runAfter(0, internal.inboundSchedules.reply, {
    requestId,
  })
}
