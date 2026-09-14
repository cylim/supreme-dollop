/// <reference types="vite/client" />

import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { internal } from './_generated/api'
import schema from './schema'
import type { TestConvex } from 'convex-test'
import type { Id } from './_generated/dataModel'

const modules = import.meta.glob('./**/*.ts')
type TestBackend = TestConvex<typeof schema>

async function seedSchedule(t: TestBackend, visibility: 'public' | 'invited') {
  return await t.run(async (ctx) => {
    const hostId = await ctx.db.insert('users', {
      providerAccountId: 'host',
      email: 'host@example.com',
    })
    const scheduleId = await ctx.db.insert('schedules', {
      hostId,
      slug: `${visibility}-schedule`,
      title: 'Planning session',
      visibility,
      timezone: 'Asia/Kuala_Lumpur',
      durationMinutes: 60,
      votingClosesAt: Date.now() + 60_000,
      status: 'open',
    })
    const optionId = await ctx.db.insert('scheduleOptions', {
      scheduleId,
      startAt: 100,
      endAt: 200,
      source: 'exact',
      availableCount: 0,
    })
    return { hostId, scheduleId, optionId }
  })
}

async function insertRun(
  t: TestBackend,
  scheduleId: Id<'schedules'>,
  kind: 'invitation' | 'finalized',
) {
  return await t.run(async (ctx) =>
    ctx.db.insert('notificationRuns', {
      scheduleId,
      kind,
      status: 'pending',
    }),
  )
}

describe('notification persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('returns null for missing schedule and decision payloads', async () => {
    const t = convexTest(schema, modules)
    const { scheduleId } = await seedSchedule(t, 'public')
    const decisionId = await t.run(async (ctx) =>
      ctx.db.insert('decisions', {
        hostId: (await ctx.db.get('schedules', scheduleId))!.hostId,
        slug: 'temporary',
        title: 'Temporary',
        visibility: 'public',
        selectMode: 'single',
        status: 'open',
        participantCount: 0,
      }),
    )
    await t.run(async (ctx) => {
      await ctx.db.delete('schedules', scheduleId)
      await ctx.db.delete('decisions', decisionId)
    })
    expect(
      await t.query(internal.notificationModel.getPayload, {
        scheduleId,
        kind: 'invitation',
      }),
    ).toBeNull()
    expect(
      await t.query(internal.notificationModel.getDecisionPayload, {
        decisionId,
      }),
    ).toBeNull()
  })

  it('loads invited recipients and a selected final time without duplicates', async () => {
    const t = convexTest(schema, modules)
    const { scheduleId, optionId } = await seedSchedule(t, 'invited')
    await t.run(async (ctx) => {
      for (const email of [
        'one@example.com',
        'one@example.com',
        'two@example.com',
      ]) {
        await ctx.db.insert('invitations', {
          scheduleId,
          email,
          status: 'pending',
        })
      }
      await ctx.db.patch('schedules', scheduleId, {
        selectedOptionId: optionId,
      })
    })
    expect(
      await t.query(internal.notificationModel.getPayload, {
        scheduleId,
        kind: 'finalized',
      }),
    ).toEqual({
      slug: 'invited-schedule',
      title: 'Planning session',
      timezone: 'Asia/Kuala_Lumpur',
      recipients: ['one@example.com', 'two@example.com'],
      selectedStartAt: 100,
      selectedEndAt: 200,
    })
  })

  it('loads public finalization recipients from schedule participants', async () => {
    const t = convexTest(schema, modules)
    const { scheduleId } = await seedSchedule(t, 'public')
    await t.run(async (ctx) => {
      for (const email of ['one@example.com', 'two@example.com']) {
        const userId = await ctx.db.insert('users', {
          providerAccountId: email,
          email,
        })
        await ctx.db.insert('scheduleParticipants', {
          scheduleId,
          userId,
          votedAt: 1_000,
        })
      }
    })
    const finalized = await t.query(internal.notificationModel.getPayload, {
      scheduleId,
      kind: 'finalized',
    })
    expect(finalized).toMatchObject({
      recipients: ['one@example.com', 'two@example.com'],
      selectedStartAt: null,
      selectedEndAt: null,
    })
    expect(
      await t.query(internal.notificationModel.getPayload, {
        scheduleId,
        kind: 'invitation',
      }),
    ).toMatchObject({ recipients: [] })
  })

  it('loads decision invitation recipients and records outcomes idempotently', async () => {
    const t = convexTest(schema, modules)
    const { hostId, scheduleId } = await seedSchedule(t, 'public')
    const decisionId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('decisions', {
        hostId,
        slug: 'decision',
        title: 'Where?',
        visibility: 'invited',
        selectMode: 'single',
        status: 'open',
        participantCount: 0,
      })
      await ctx.db.insert('decisionInvitations', {
        decisionId: id,
        email: 'person@example.com',
      })
      return id
    })
    expect(
      await t.query(internal.notificationModel.getDecisionPayload, {
        decisionId,
      }),
    ).toEqual({
      slug: 'decision',
      title: 'Where?',
      recipients: ['person@example.com'],
    })

    const runId = await insertRun(t, scheduleId, 'invitation')
    await t.mutation(internal.notificationModel.markRun, {
      notificationRunId: runId,
      status: 'failed',
      errorCode: 'provider_error',
    })
    expect(
      await t.run(async (ctx) => ctx.db.get('notificationRuns', runId)),
    ).toMatchObject({
      status: 'failed',
      attemptedAt: 1_000,
      errorCode: 'provider_error',
    })
    await t.run(async (ctx) => ctx.db.delete('notificationRuns', runId))
    await expect(
      t.mutation(internal.notificationModel.markRun, {
        notificationRunId: runId,
        status: 'sent',
      }),
    ).resolves.toBeNull()
  })

  it('runs notification actions through the missing-configuration path', async () => {
    vi.stubEnv('APP_URL', '')
    vi.stubEnv('AGENTMAIL_API_KEY', '')
    vi.stubEnv('AGENTMAIL_INBOX_ID', '')
    const t = convexTest(schema, modules)
    const { hostId, scheduleId } = await seedSchedule(t, 'invited')
    const invitationRunId = await insertRun(t, scheduleId, 'invitation')
    const finalRunId = await insertRun(t, scheduleId, 'finalized')
    const decision = await t.run(async (ctx) => {
      const decisionId = await ctx.db.insert('decisions', {
        hostId,
        slug: 'decision-action',
        title: 'Where?',
        visibility: 'invited',
        selectMode: 'single',
        status: 'open',
        participantCount: 0,
      })
      const notificationRunId = await ctx.db.insert('notificationRuns', {
        decisionId,
        kind: 'decision_invitation',
        status: 'pending',
      })
      await ctx.db.insert('decisionInvitations', {
        decisionId,
        email: 'person@example.com',
      })
      return { decisionId, notificationRunId }
    })

    await t.action(internal.notifications.sendInvitations, {
      scheduleId,
      notificationRunId: invitationRunId,
    })
    await t.action(internal.notifications.sendFinalized, {
      scheduleId,
      notificationRunId: finalRunId,
    })
    await t.action(internal.notifications.sendDecisionInvitations, decision)

    const runs = await t.run(async (ctx) =>
      ctx.db.query('notificationRuns').take(10),
    )
    expect(runs).toHaveLength(3)
    expect(runs.every((run) => run.status !== 'pending')).toBe(true)
  })
})
