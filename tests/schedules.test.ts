import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {  convexTest } from 'convex-test'
import schema from '../convex/schema'
import { api, internal } from '../convex/_generated/api'
import type {TestConvex} from 'convex-test';
import type { Id } from '../convex/_generated/dataModel'

const modules = import.meta.glob('../convex/**/*.ts')
const now = Date.UTC(2026, 8, 7, 12)

type TestBackend = TestConvex<typeof schema>

async function insertUser(
  t: TestBackend,
  email: string,
): Promise<Id<'users'>> {
  return await t.run(async (ctx) =>
    ctx.db.insert('users', {
      providerAccountId: `google:${email}`,
      email,
      name: email.split('@')[0],
    }),
  )
}

function asUser(t: TestBackend, id: Id<'users'>, email: string) {
  return t.withIdentity({
    subject: id,
    tokenIdentifier: `https://test.invalid|${id}`,
    email,
  })
}

function scheduleInput(
  visibility: 'public' | 'invited',
  inviteEmails: Array<string> = [],
) {
  return {
    title: 'Community planning session',
    visibility,
    timezone: 'Asia/Kuala_Lumpur',
    durationMinutes: 60,
    votingClosesAt: now + 86_400_000,
    options: [
      {
        startAt: now + 172_800_000,
        endAt: now + 176_400_000,
        source: 'exact' as const,
      },
      {
        startAt: now + 259_200_000,
        endAt: now + 262_800_000,
        source: 'range' as const,
      },
    ],
    inviteEmails,
  }
}

describe('scheduling and voting', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('enforces invite access, complete ballots, and host-only finalization', async () => {
    const t = convexTest(schema, modules)
    const hostId = await insertUser(t, 'host@example.test')
    const inviteeId = await insertUser(t, 'guest@example.test')
    const outsiderId = await insertUser(t, 'outsider@example.test')
    const host = asUser(t, hostId, 'host@example.test')
    const invitee = asUser(t, inviteeId, 'guest@example.test')
    const outsider = asUser(t, outsiderId, 'outsider@example.test')

    await expect(t.mutation(api.schedules.create, scheduleInput('public')))
      .rejects.toThrow(/signed in/i)

    const created = await host.mutation(
      api.schedules.create,
      scheduleInput('invited', ['Guest@Example.Test']),
    )
    const hostView = await host.query(api.schedules.getBySlug, {
      slug: created.slug,
      now,
    })
    expect(hostView).not.toBeNull()
    const optionIds = hostView!.options.map((option) => option.id)

    await expect(
      outsider.query(api.schedules.getBySlug, { slug: created.slug, now }),
    ).rejects.toThrow(/invited guests/i)
    await expect(
      outsider.mutation(api.schedules.submitVote, {
        scheduleId: created.id,
        responses: optionIds.map((optionId) => ({ optionId, available: true })),
      }),
    ).rejects.toThrow(/not invited/i)
    await expect(
      invitee.mutation(api.schedules.submitVote, {
        scheduleId: created.id,
        responses: [{ optionId: optionIds[0], available: true }],
      }),
    ).rejects.toThrow(/every candidate/i)

    await invitee.mutation(api.schedules.submitVote, {
      scheduleId: created.id,
      responses: [
        { optionId: optionIds[0], available: true },
        { optionId: optionIds[1], available: false },
      ],
    })

    const awaiting = await host.query(api.schedules.getBySlug, {
      slug: created.slug,
      now,
    })
    expect(awaiting).toMatchObject({
      status: 'awaiting_confirmation',
      participantCount: 1,
      recommendedOptionId: optionIds[0],
    })
    expect(awaiting!.options.map((option) => option.availableCount)).toEqual([
      1, 0,
    ])
    const finalRunsBeforeChoice = await t.run(async (ctx) =>
      ctx.db
        .query('notificationRuns')
        .withIndex('by_schedule_and_kind', (q) =>
          q.eq('scheduleId', created.id).eq('kind', 'finalized'),
        )
        .collect(),
    )
    expect(finalRunsBeforeChoice).toHaveLength(0)
    await expect(
      outsider.mutation(api.schedules.chooseFinal, {
        scheduleId: created.id,
        optionId: optionIds[0],
      }),
    ).rejects.toThrow(/only the host/i)

    await host.mutation(api.schedules.chooseFinal, {
      scheduleId: created.id,
      optionId: optionIds[0],
    })
    const finalized = await host.query(api.schedules.getBySlug, {
      slug: created.slug,
      now,
    })
    expect(finalized).toMatchObject({
      status: 'finalized',
      selectedOptionId: optionIds[0],
    })
    const finalRunsAfterChoice = await t.run(async (ctx) =>
      ctx.db
        .query('notificationRuns')
        .withIndex('by_schedule_and_kind', (q) =>
          q.eq('scheduleId', created.id).eq('kind', 'finalized'),
        )
        .collect(),
    )
    expect(finalRunsAfterChoice).toHaveLength(1)
  })

  it('allows any signed-in user on public links and uses earliest-time ties', async () => {
    const t = convexTest(schema, modules)
    const hostId = await insertUser(t, 'host@example.test')
    const voterId = await insertUser(t, 'voter@example.test')
    const otherHostId = await insertUser(t, 'other@example.test')
    const host = asUser(t, hostId, 'host@example.test')
    const voter = asUser(t, voterId, 'voter@example.test')
    const otherHost = asUser(t, otherHostId, 'other@example.test')

    const created = await host.mutation(
      api.schedules.create,
      scheduleInput('public'),
    )
    await otherHost.mutation(api.schedules.create, {
      ...scheduleInput('public'),
      title: 'A different host schedule',
    })
    const view = await voter.query(api.schedules.getBySlug, {
      slug: created.slug,
      now,
    })
    expect(view!.recommendedOptionId).toBe(view!.options[0].id)
    await expect(
      t.query(api.schedules.getBySlug, { slug: created.slug, now }),
    ).rejects.toThrow(/signed in/i)
    await expect(
      host.mutation(api.schedules.chooseFinal, {
        scheduleId: created.id,
        optionId: view!.options[0].id,
      }),
    ).rejects.toThrow(/voting must close/i)

    await voter.mutation(api.schedules.submitVote, {
      scheduleId: created.id,
      responses: view!.options.map((option) => ({
        optionId: option.id,
        available: true,
      })),
    })
    const mine = await host.query(api.schedules.listMine, {})
    expect(mine).toHaveLength(1)
    expect(mine[0].id).toBe(created.id)

    await t.mutation(internal.schedules.closeVoting, {
      scheduleId: created.id,
    })
    await expect(
      voter.mutation(api.schedules.chooseFinal, {
        scheduleId: created.id,
        optionId: view!.options[0].id,
      }),
    ).rejects.toThrow(/only the host/i)
    await host.mutation(api.schedules.chooseFinal, {
      scheduleId: created.id,
      optionId: view!.options[0].id,
    })
  })

  it('rejects candidate IDs from another schedule', async () => {
    const t = convexTest(schema, modules)
    const hostId = await insertUser(t, 'host@example.test')
    const voterId = await insertUser(t, 'voter@example.test')
    const host = asUser(t, hostId, 'host@example.test')
    const voter = asUser(t, voterId, 'voter@example.test')
    const first = await host.mutation(api.schedules.create, scheduleInput('public'))
    const second = await host.mutation(api.schedules.create, {
      ...scheduleInput('public'),
      title: 'Second schedule',
    })
    const firstView = await voter.query(api.schedules.getBySlug, {
      slug: first.slug,
      now,
    })
    const secondView = await voter.query(api.schedules.getBySlug, {
      slug: second.slug,
      now,
    })

    await expect(
      voter.mutation(api.schedules.submitVote, {
        scheduleId: first.id,
        responses: [
          { optionId: firstView!.options[0].id, available: true },
          { optionId: secondView!.options[0].id, available: true },
        ],
      }),
    ).rejects.toThrow(/does not belong/i)
  })
})
