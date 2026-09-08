import { describe, expect, it } from 'vitest'
import {
  generateRangeCandidates,
  mergeCandidateTimes,
  normalizeScheduleDraft,
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
    const earlier = { startAt: now + 2, endAt: now + 3, source: 'exact' as const }
    const source = [later]
    expect(mergeCandidateTimes(source, [earlier, later])).toEqual([earlier, later])
    expect(source).toEqual([later])
  })

  it('normalizes invitations and rejects invalid lifecycle input', () => {
    const options = [
      { startAt: now + 3_600_000, endAt: now + 7_200_000, source: 'exact' as const },
      { startAt: now + 10_800_000, endAt: now + 14_400_000, source: 'exact' as const },
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
})
