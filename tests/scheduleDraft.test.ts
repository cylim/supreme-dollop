import { describe, expect, it } from 'vitest'
import {
  generateRangeCandidates,
  mergeCandidateTimes,
  normalizeScheduleDraft,
  parseInviteEmails,
} from '../shared/scheduleDraft'

const now = Date.UTC(2026, 8, 8, 0)

describe('schedule draft rules', () => {
  it('generates deterministic candidate times throughout a range', () => {
    const candidates = generateRangeCandidates({
      startAt: now + 3_600_000,
      endAt: now + 5 * 3_600_000,
      durationMinutes: 60,
      intervalMinutes: 30,
    })
    expect(candidates).toHaveLength(7)
    expect(candidates[0]).toEqual({
      startAt: now + 3_600_000,
      endAt: now + 2 * 3_600_000,
      source: 'range',
    })
  })

  it('deduplicates additions and sorts without mutating the source', () => {
    const later = { startAt: now + 4, endAt: now + 5, source: 'exact' as const }
    const earlier = {
      startAt: now + 2,
      endAt: now + 3,
      source: 'exact' as const,
    }
    const source = [later]
    expect(mergeCandidateTimes(source, [earlier, later])).toEqual([
      earlier,
      later,
    ])
    expect(source).toEqual([later])
  })

  it('normalizes invitations and rejects invalid lifecycle input', () => {
    const options = [
      {
        startAt: now + 3_600_000,
        endAt: now + 7_200_000,
        source: 'exact' as const,
      },
      {
        startAt: now + 10_800_000,
        endAt: now + 14_400_000,
        source: 'exact' as const,
      },
    ]
    expect(
      normalizeScheduleDraft(
        {
          title: '  Planning session  ',
          visibility: 'invited',
          timezone: 'Asia/Kuala_Lumpur',
          durationMinutes: 60,
          votingClosesAt: now + 120_000,
          options,
          inviteEmails: [' Guest@Example.Test ', 'guest@example.test'],
        },
        now,
      ),
    ).toMatchObject({
      title: 'Planning session',
      inviteEmails: ['guest@example.test'],
    })
    expect(() =>
      normalizeScheduleDraft(
        {
          title: 'Planning session',
          visibility: 'public',
          timezone: 'UTC',
          durationMinutes: 60,
          votingClosesAt: now,
          options,
          inviteEmails: [],
        },
        now,
      ),
    ).toThrow(/at least one minute/i)
  })

  it('normalizes invitation delimiters and validates range inputs', () => {
    expect(parseInviteEmails(' One@Example.com,\ntwo@example.com; ')).toEqual([
      'one@example.com',
      'two@example.com',
    ])
    const valid = {
      startAt: now,
      endAt: now + 3_600_000,
      durationMinutes: 60,
      intervalMinutes: 30,
    }
    for (const input of [
      { ...valid, startAt: Number.NaN },
      { ...valid, endAt: Number.POSITIVE_INFINITY },
      { ...valid, durationMinutes: 14 },
      { ...valid, durationMinutes: 481 },
      { ...valid, intervalMinutes: 4 },
      { ...valid, intervalMinutes: 5.5 },
      { ...valid, endAt: now },
    ]) {
      expect(() => generateRangeCandidates(input)).toThrow()
    }
    expect(() =>
      generateRangeCandidates({
        ...valid,
        endAt: now + 30_000,
      }),
    ).toThrow(/shorter/i)
    expect(() =>
      generateRangeCandidates({
        startAt: now,
        endAt: now + 103 * 5 * 60_000,
        durationMinutes: 15,
        intervalMinutes: 5,
      }),
    ).toThrow(/more than 100/i)
  })

  it('rejects every malformed schedule draft boundary', () => {
    const validOptions = [
      {
        startAt: now + 3_600_000,
        endAt: now + 7_200_000,
        source: 'exact' as const,
      },
      {
        startAt: now + 10_800_000,
        endAt: now + 14_400_000,
        source: 'exact' as const,
      },
    ]
    const valid = {
      title: 'Planning session',
      visibility: 'public' as const,
      timezone: 'UTC',
      durationMinutes: 60,
      votingClosesAt: now + 120_000,
      options: validOptions,
      inviteEmails: [],
    }
    const malformed = [
      { ...valid, title: 'x'.repeat(121) },
      { ...valid, durationMinutes: 15.5 },
      { ...valid, votingClosesAt: Number.NaN },
      { ...valid, timezone: '' },
      { ...valid, timezone: 'x'.repeat(81) },
      { ...valid, options: [validOptions[0]] },
      {
        ...valid,
        options: Array.from({ length: 101 }, (_, i) => ({
          startAt: i * 2 + 1,
          endAt: i * 2 + 2,
          source: 'exact' as const,
        })),
      },
      {
        ...valid,
        options: [{ ...validOptions[0], startAt: -1 }, validOptions[1]],
      },
      {
        ...valid,
        options: [
          { ...validOptions[0], endAt: validOptions[0].startAt },
          validOptions[1],
        ],
      },
      { ...valid, options: [validOptions[0], { ...validOptions[0] }] },
      { ...valid, visibility: 'invited' as const, inviteEmails: [] },
      {
        ...valid,
        inviteEmails: Array.from({ length: 101 }, (_, i) => `${i}@example.com`),
      },
    ]
    for (const input of malformed) {
      expect(() => normalizeScheduleDraft(input, now)).toThrow()
    }
    expect(
      normalizeScheduleDraft(
        { ...valid, description: ` ${'x'.repeat(1_001)} ` },
        now,
      ).description,
    ).toHaveLength(1_000)
  })
})
