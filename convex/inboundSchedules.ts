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
    const text = createdReply(payload, appUrl ?? '')
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
              reply: async (message: {
                text: string
                idempotencyKey: string
              }) => {
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

function createdReply(
  payload: {
    status: 'pending' | 'created' | 'rejected'
    scheduleSlug: string | null
    scheduleTitle: string | null
    decisionSlug: string | null
    decisionTitle: string | null
    attachedDecisions: Array<{ slug: string; title: string }>
    errorMessage: string | null
  },
  appUrl: string,
): string {
  if (payload.status !== 'created') {
    return `Request rejected: ${payload.errorMessage ?? 'The request was invalid.'}\n\nProtocol: ${appUrl}/llms.txt`
  }
  const lines: Array<string> = []
  if (payload.scheduleSlug && payload.scheduleTitle) {
    lines.push(`Created: ${payload.scheduleTitle}`)
    lines.push(`Open the schedule: ${appUrl}/s/${payload.scheduleSlug}`)
    for (const decision of payload.attachedDecisions) {
      lines.push(`${decision.title}: ${appUrl}/d/${decision.slug}`)
    }
  } else if (payload.decisionSlug && payload.decisionTitle) {
    lines.push(`Created: ${payload.decisionTitle}`)
    lines.push(`Open the decision: ${appUrl}/d/${payload.decisionSlug}`)
  } else {
    return `Created.\n\nProtocol: ${appUrl}/llms.txt`
  }
  return lines.join('\n\n')
}
