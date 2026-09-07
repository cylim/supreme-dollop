'use node'

import { AgentMailClient } from 'agentmail'
import { v } from 'convex/values'
import { env, internalAction } from './_generated/server'
import { internal } from './_generated/api'
import { partitionNotificationRecipients } from './notificationPolicy'
import type { ActionCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'

const notificationArgs = {
  scheduleId: v.id('schedules'),
  notificationRunId: v.id('notificationRuns'),
}

async function deliver(
  ctx: ActionCtx,
  args: {
    scheduleId: Id<'schedules'>
    notificationRunId: Id<'notificationRuns'>
  },
  kind: 'invitation' | 'finalized',
): Promise<null> {
  const payload = await ctx.runQuery(internal.notificationModel.getPayload, {
    scheduleId: args.scheduleId,
    kind,
  })
  if (payload === null) return null

  const { deliverable, suppressedCount } = partitionNotificationRecipients(
    payload.recipients,
    env.E2E_TEST_EMAILS,
  )
  if (suppressedCount > 0) {
    console.info(`Suppressed ${suppressedCount} test notification recipient(s)`)
  }
  if (deliverable.length === 0) {
    await ctx.runMutation(internal.notificationModel.markRun, {
      notificationRunId: args.notificationRunId,
      status: 'skipped',
      errorCode: 'test_recipient_suppressed',
    })
    return null
  }

  const apiKey = env.AGENTMAIL_API_KEY
  const inboxId = env.AGENTMAIL_INBOX_ID
  const publicAppUrl = env.APP_URL
  if (!apiKey || !inboxId || !publicAppUrl) {
    await ctx.runMutation(internal.notificationModel.markRun, {
      notificationRunId: args.notificationRunId,
      status: 'failed',
      errorCode: 'integration_not_configured',
    })
    return null
  }

  const client = new AgentMailClient({ apiKey })
  const scheduleUrl = `${publicAppUrl.replace(/\/$/, '')}/s/${payload.slug}`
  try {
    for (let index = 0; index < deliverable.length; index += 5) {
      const batch = deliverable.slice(index, index + 5)
      await Promise.all(
        batch.map((recipient: string) => {
          const finalizedTime =
            payload.selectedStartAt === null || payload.selectedEndAt === null
              ? ''
              : `\n\nChosen time: ${new Date(payload.selectedStartAt).toISOString()} to ${new Date(payload.selectedEndAt).toISOString()} (${payload.timezone})`
          return client.inboxes.messages.send(
            inboxId,
            {
              to: recipient,
              subject:
                kind === 'invitation'
                  ? `Choose a time for ${payload.title}`
                  : `Confirmed: ${payload.title}`,
              text:
                kind === 'invitation'
                  ? `You have been invited to vote on a time for ${payload.title}.\n\nOpen the schedule: ${scheduleUrl}`
                  : `The host has confirmed the time for ${payload.title}.${finalizedTime}\n\nView the schedule: ${scheduleUrl}`,
            },
            { idempotencyKey: `${args.notificationRunId}:${recipient}` },
          )
        }),
      )
    }
    await ctx.runMutation(internal.notificationModel.markRun, {
      notificationRunId: args.notificationRunId,
      status: 'sent',
    })
  } catch (error) {
    console.error('AgentMail delivery failed', error)
    await ctx.runMutation(internal.notificationModel.markRun, {
      notificationRunId: args.notificationRunId,
      status: 'failed',
      errorCode: 'provider_error',
    })
  }
  return null
}

export const sendInvitations = internalAction({
  args: notificationArgs,
  returns: v.null(),
  handler: async (ctx, args) => deliver(ctx, args, 'invitation'),
})

export const sendFinalized = internalAction({
  args: notificationArgs,
  returns: v.null(),
  handler: async (ctx, args) => deliver(ctx, args, 'finalized'),
})
