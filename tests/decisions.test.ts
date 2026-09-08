import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { convexTest } from 'convex-test'
import schema from '../convex/schema'
import { api } from '../convex/_generated/api'
import type { TestConvex } from 'convex-test'
import type { Id } from '../convex/_generated/dataModel'

const modules = import.meta.glob('../convex/**/*.ts')
const now = Date.UTC(2026, 8, 8, 12)

type TestBackend = TestConvex<typeof schema>

async function insertUser(
  t: TestBackend,
  email: string,
  extra: { name?: string; picture?: string } = {},
): Promise<Id<'users'>> {
  return await t.run(async (ctx) =>
    ctx.db.insert('users', {
      providerAccountId: `google:${email}`,
      email,
      ...extra,
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

function standaloneInput(
  visibility: 'public' | 'invited',
  inviteEmails: Array<string> = [],
) {
  return {
    title: 'Beach or park?',
    visibility,
    selectMode: 'single' as const,
    options: ['Beach', 'Park'],
    inviteEmails,
  }
}

describe('decisions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lets any signed-in user ballot a public decision and shows live faces', async () => {
    const t = convexTest(schema, modules)
    const hostId = await insertUser(t, 'host@example.test', { name: 'Alex Host' })
    const voterId = await insertUser(t, 'maya@example.test', {
      name: 'Maya Guest',
      picture: 'https://example.test/maya.png',
    })
    const host = asUser(t, hostId, 'host@example.test')
    const voter = asUser(t, voterId, 'maya@example.test')

    await expect(t.mutation(api.decisions.create, standaloneInput('public')))
      .rejects.toThrow(/signed in/i)

    const created = await host.mutation(
      api.decisions.create,
      standaloneInput('public'),
    )
    const view = await voter.query(api.decisions.getBySlug, {
      slug: created.slug,
      now,
    })
    expect(view).toMatchObject({
      title: 'Beach or park?',
      selectMode: 'single',
      status: 'open',
      canVote: true,
      participantCount: 0,
    })
    const beach = view!.options.find((option) => option.label === 'Beach')!
    await voter.mutation(api.decisions.submitBallot, {
      decisionId: created.id,
      optionIds: [beach.id],
    })

    const after = await host.query(api.decisions.getBySlug, {
      slug: created.slug,
      now,
    })
    const beachAfter = after!.options.find((option) => option.label === 'Beach')!
    expect(beachAfter.selectionCount).toBe(1)
    expect(beachAfter.faces).toEqual([
      { picture: 'https://example.test/maya.png', initial: 'M' },
    ])
    expect(after!.participantCount).toBe(1)
    const mine = await host.query(api.decisions.listMine, {})
    expect(mine).toHaveLength(1)
    expect(mine[0].id).toBe(created.id)
  })

  it('rejects outsiders on invited decisions and queues invitation mail', async () => {
    const t = convexTest(schema, modules)
    const hostId = await insertUser(t, 'host@example.test')
    const inviteeId = await insertUser(t, 'guest@example.test')
    const outsiderId = await insertUser(t, 'outsider@example.test')
    const host = asUser(t, hostId, 'host@example.test')
    const invitee = asUser(t, inviteeId, 'guest@example.test')
    const outsider = asUser(t, outsiderId, 'outsider@example.test')

    const created = await host.mutation(
      api.decisions.create,
      standaloneInput('invited', ['Guest@Example.Test']),
    )
    await expect(
      outsider.query(api.decisions.getBySlug, { slug: created.slug, now }),
    ).rejects.toThrow(/invited/i)
    const inviteeView = await invitee.query(api.decisions.getBySlug, {
      slug: created.slug,
      now,
    })
    expect(inviteeView).not.toBeNull()
    const runs = await t.run(async (ctx) =>
      ctx.db
        .query('notificationRuns')
        .withIndex('by_decision_and_kind', (q) =>
          q.eq('decisionId', created.id).eq('kind', 'decision_invitation'),
        )
        .take(10),
    )
    expect(runs).toHaveLength(1)
  })

  it('supports multi select, retract, option edits, and final close', async () => {
    const t = convexTest(schema, modules)
    const hostId = await insertUser(t, 'host@example.test', { name: 'Alex' })
    const voterId = await insertUser(t, 'maya@example.test', { name: 'Maya' })
    const host = asUser(t, hostId, 'host@example.test')
    const voter = asUser(t, voterId, 'maya@example.test')

    const created = await host.mutation(api.decisions.create, {
      ...standaloneInput('public'),
      selectMode: 'multi',
      options: ['Thai', 'Pizza', 'Sushi'],
    })
    const view = await voter.query(api.decisions.getBySlug, {
      slug: created.slug,
      now,
    })
    const byLabel = Object.fromEntries(
      view!.options.map((option) => [option.label, option.id]),
    )
    await voter.mutation(api.decisions.submitBallot, {
      decisionId: created.id,
      optionIds: [byLabel.Thai, byLabel.Pizza],
    })
    await expect(
      host.mutation(api.decisions.removeOption, {
        decisionId: created.id,
        optionId: byLabel.Thai,
      }),
    ).rejects.toThrow(/has a selection/i)

    await host.mutation(api.decisions.addOption, {
      decisionId: created.id,
      label: 'Ramen',
    })
    await host.mutation(api.decisions.renameOption, {
      decisionId: created.id,
      optionId: byLabel.Sushi,
      label: 'Sushi roll',
    })

    await voter.mutation(api.decisions.submitBallot, {
      decisionId: created.id,
      optionIds: [byLabel.Pizza],
    })
    await host.mutation(api.decisions.removeOption, {
      decisionId: created.id,
      optionId: byLabel.Thai,
    })

    await voter.mutation(api.decisions.submitBallot, {
      decisionId: created.id,
      optionIds: [],
    })
    const retracted = await host.query(api.decisions.getBySlug, {
      slug: created.slug,
      now,
    })
    expect(retracted!.participantCount).toBe(0)
    expect(
      retracted!.options.every((option) => option.selectionCount === 0),
    ).toBe(true)

    await host.mutation(api.decisions.close, { decisionId: created.id })
    await expect(
      voter.mutation(api.decisions.submitBallot, {
        decisionId: created.id,
        optionIds: [byLabel.Pizza],
      }),
    ).rejects.toThrow(/closed/i)
    const closed = await voter.query(api.decisions.getBySlug, {
      slug: created.slug,
      now,
    })
    expect(closed).toMatchObject({ status: 'closed', canVote: false })
  })

  it('attaches decisions to a schedule and keeps them open after the final time', async () => {
    const t = convexTest(schema, modules)
    const hostId = await insertUser(t, 'host@example.test')
    const inviteeId = await insertUser(t, 'guest@example.test')
    const outsiderId = await insertUser(t, 'outsider@example.test')
    const host = asUser(t, hostId, 'host@example.test')
    const invitee = asUser(t, inviteeId, 'guest@example.test')
    const outsider = asUser(t, outsiderId, 'outsider@example.test')

    const schedule = await host.mutation(api.schedules.create, {
      title: 'Saturday dinner',
      visibility: 'invited',
      timezone: 'Asia/Kuala_Lumpur',
      durationMinutes: 60,
      votingClosesAt: now + 86_400_000,
      options: [
        {
          startAt: now + 172_800_000,
          endAt: now + 176_400_000,
          source: 'exact',
        },
        {
          startAt: now + 259_200_000,
          endAt: now + 262_800_000,
          source: 'exact',
        },
      ],
      inviteEmails: ['guest@example.test'],
    })

    await expect(
      invitee.mutation(api.decisions.createAttached, {
        scheduleId: schedule.id,
        title: 'What do we eat?',
        selectMode: 'single',
        options: ['Thai', 'Pizza'],
      }),
    ).rejects.toThrow(/host/i)

    const attached = await host.mutation(api.decisions.createAttached, {
      scheduleId: schedule.id,
      title: 'What do we eat?',
      selectMode: 'single',
      options: ['Thai', 'Pizza'],
    })
    await expect(
      outsider.query(api.decisions.getBySlug, { slug: attached.slug, now }),
    ).rejects.toThrow(/invited/i)
    const food = await invitee.query(api.decisions.getBySlug, {
      slug: attached.slug,
      now,
    })
    expect(food).toMatchObject({
      title: 'What do we eat?',
      scheduleId: schedule.id,
    })
    const thai = food!.options.find((option) => option.label === 'Thai')!
    await invitee.mutation(api.decisions.submitBallot, {
      decisionId: attached.id,
      optionIds: [thai.id],
    })

    const listed = await invitee.query(api.decisions.listAttached, {
      scheduleId: schedule.id,
      now,
    })
    expect(listed).toHaveLength(1)

    const scheduleView = await host.query(api.schedules.getBySlug, {
      slug: schedule.slug,
      now,
    })
    await invitee.mutation(api.schedules.submitVote, {
      scheduleId: schedule.id,
      responses: scheduleView!.options.map((option) => ({
        optionId: option.id,
        available: true,
      })),
    })
    const awaiting = await host.query(api.schedules.getBySlug, {
      slug: schedule.slug,
      now,
    })
    await host.mutation(api.schedules.chooseFinal, {
      scheduleId: schedule.id,
      optionId: awaiting!.options[0].id,
    })
    const stillOpen = await invitee.query(api.decisions.getBySlug, {
      slug: attached.slug,
      now,
    })
    expect(stillOpen).toMatchObject({ status: 'open', canVote: true })

    const mine = await host.query(api.decisions.listMine, {})
    expect(mine).toHaveLength(0)
  })
})
