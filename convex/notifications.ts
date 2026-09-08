'use node'

import { AgentMailClient } from 'agentmail'
import { v } from 'convex/values'
import { env, internalAction } from './_generated/server'
import { internal } from './_generated/api'
import { deliverScheduleNotification } from './notificationDelivery'
import type { ActionCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import type { NotificationOutcome } from './notificationDelivery'

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
  const apiKey = env.AGENTMAIL_API_KEY
  const inboxId = env.AGENTMAIL_INBOX_ID
  const client = apiKey && inboxId ? new AgentMailClient({ apiKey }) : null

  await deliverScheduleNotification(
    {
      kind,
      payload,
      notificationRunId: args.notificationRunId,
      publicAppUrl: env.APP_URL,
      suppressedRecipients: env.E2E_TEST_EMAILS,
    },
    {
      ...(client && inboxId
        ? {
            send: async (message) => {
              await client.inboxes.messages.send(
                inboxId,
                {
                  to: message.recipient,
                  subject: message.subject,
                  text: message.text,
                },
                { idempotencyKey: message.idempotencyKey },
              )
            },
          }
        : {}),
      record: async (outcome: NotificationOutcome) => {
        await ctx.runMutation(internal.notificationModel.markRun, {
          notificationRunId: args.notificationRunId,
          ...outcome,
        })
      },
      reportSuppressed: (count) =>
        console.info(`Suppressed ${count} test notification recipient(s)`),
    },
  )
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

export const sendDecisionInvitations = internalAction({
  args: {
    decisionId: v.id('decisions'),
    notificationRunId: v.id('notificationRuns'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const payload = await ctx.runQuery(
      internal.notificationModel.getDecisionPayload,
      { decisionId: args.decisionId },
    )
    const apiKey = env.AGENTMAIL_API_KEY
    const inboxId = env.AGENTMAIL_INBOX_ID
    const client = apiKey && inboxId ? new AgentMailClient({ apiKey }) : null
    await deliverScheduleNotification(
      {
        kind: 'decision_invitation',
        payload,
        notificationRunId: args.notificationRunId,
        publicAppUrl: env.APP_URL,
        suppressedRecipients: env.E2E_TEST_EMAILS,
      },
      {
        ...(client && inboxId
          ? {
              send: async (message) => {
                await client.inboxes.messages.send(
                  inboxId,
                  {
                    to: message.recipient,
                    subject: message.subject,
                    text: message.text,
                  },
                  { idempotencyKey: message.idempotencyKey },
                )
              },
            }
          : {}),
        record: async (outcome: NotificationOutcome) => {
          await ctx.runMutation(internal.notificationModel.markRun, {
            notificationRunId: args.notificationRunId,
            ...outcome,
          })
        },
        reportSuppressed: (count) =>
          console.info(`Suppressed ${count} test notification recipient(s)`),
      },
    )
    return null
  },
})
