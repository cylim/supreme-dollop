'use node'

import { AgentMailClient } from 'agentmail'
import { v } from 'convex/values'
import { env, internalAction } from './_generated/server'
import { internal } from './_generated/api'
import { deliverInboundReply } from './notificationDelivery'

export const reply = internalAction({
  args: { requestId: v.id('inboundScheduleRequests') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const payload = await ctx.runQuery(
      internal.inboundScheduleModel.getReplyPayload,
      args,
    )
    if (payload === null || payload.status === 'pending') return null
    const appUrl = env.APP_URL?.replace(/\/$/, '')
    const text =
      payload.status === 'created' && payload.scheduleSlug && payload.scheduleTitle
        ? `Created: ${payload.scheduleTitle}\n\nOpen the schedule: ${appUrl ?? ''}/s/${payload.scheduleSlug}`
        : `Schedule request rejected: ${payload.errorMessage ?? 'The request was invalid.'}\n\nProtocol: ${appUrl ?? ''}/llms.txt`
    const apiKey = env.AGENTMAIL_API_KEY
    const client = apiKey ? new AgentMailClient({ apiKey }) : null
    const replyStatus = await deliverInboundReply(
      {
        recipient: payload.senderEmail,
        text,
        idempotencyKey: `inbound:${payload.eventId}:reply`,
        suppressedRecipients: env.E2E_TEST_EMAILS,
      },
      {
        ...(client
          ? {
              reply: async (message: { text: string; idempotencyKey: string }) => {
                await client.inboxes.messages.reply(
                  payload.inboxId,
                  payload.messageId,
                  { text: message.text },
                  { idempotencyKey: message.idempotencyKey },
                )
              },
            }
          : {}),
      },
    )
    await ctx.runMutation(internal.inboundScheduleModel.markReply, {
      requestId: args.requestId,
      replyStatus,
    })
    return null
  },
})
