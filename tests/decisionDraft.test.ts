import { describe, expect, it } from 'vitest'
import {
  normalizeAttachedDecisionDraft,
  normalizeClosesAt,
  normalizeDecisionDescription,
  normalizeDecisionTitle,
  normalizeOptionLabel,
  normalizeOptionLabels,
  normalizeSelectMode,
  normalizeStandaloneDecisionDraft,
} from '../shared/decisionDraft'

const now = Date.UTC(2026, 8, 8, 12)

describe('decision draft rules', () => {
  it('normalizes standalone drafts and rejects invalid options', () => {
    const draft = normalizeStandaloneDecisionDraft(
      {
        title: '  Beach or park?  ',
        visibility: 'invited',
        selectMode: 'single',
        options: ['Beach', 'Park'],
        inviteEmails: ['Maya@Example.Test', 'maya@example.test'],
      },
      now,
    )
    expect(draft.title).toBe('Beach or park?')
    expect(draft.options).toEqual(['Beach', 'Park'])
    expect(draft.inviteEmails).toEqual(['maya@example.test'])
    expect(() =>
      normalizeStandaloneDecisionDraft(
        {
          title: 'Beach or park?',
          visibility: 'invited',
          selectMode: 'single',
          options: ['Beach', 'Park', 'beach'],
          inviteEmails: ['maya@example.test'],
        },
        now,
      ),
    ).toThrow(/unique/i)
  })

  it('rejects invited drafts without emails and short titles', () => {
    expect(() =>
      normalizeStandaloneDecisionDraft(
        {
          title: 'Hi',
          visibility: 'public',
          selectMode: 'multi',
          options: ['A', 'B'],
          inviteEmails: [],
        },
        now,
      ),
    ).toThrow(/3 and 120/)
    expect(() =>
      normalizeStandaloneDecisionDraft(
        {
          title: 'What do we eat?',
          visibility: 'invited',
          selectMode: 'single',
          options: ['Thai', 'Pizza'],
          inviteEmails: [],
        },
        now,
      ),
    ).toThrow(/at least one email/)
  })

  it('normalizes attached drafts without invitations', () => {
    const draft = normalizeAttachedDecisionDraft(
      {
        title: 'What do we eat?',
        selectMode: 'multi',
        options: ['Thai', ' Pizza '],
        closesAt: now + 120_000,
      },
      now,
    )
    expect(draft.options).toEqual(['Thai', 'Pizza'])
    expect(draft.closesAt).toBe(now + 120_000)
  })

  it('validates labels, option counts, titles, modes, and deadlines', () => {
    for (const label of ['', 'x'.repeat(81)]) {
      expect(() => normalizeOptionLabel(label)).toThrow(/label/i)
    }
    for (const options of [
      ['only'],
      Array.from({ length: 101 }, (_, i) => `${i}`),
    ]) {
      expect(() => normalizeOptionLabels(options)).toThrow(/2 and 100/i)
    }
    expect(() => normalizeDecisionTitle('x'.repeat(121))).toThrow(/3 and 120/i)
    expect(() => normalizeSelectMode('ranked')).toThrow(/single or multi/i)
    expect(normalizeSelectMode('multi')).toBe('multi')
    expect(normalizeClosesAt(undefined, now)).toBeUndefined()
    for (const closesAt of [Number.NaN, -1]) {
      expect(() => normalizeClosesAt(closesAt, now)).toThrow(/invalid/i)
    }
    expect(() => normalizeClosesAt(now + 60_000, now)).toThrow(/one minute/i)
    expect(normalizeClosesAt(now + 60_001, now)).toBe(now + 60_001)
  })

  it('normalizes optional descriptions and invitation limits', () => {
    expect(normalizeDecisionDescription(undefined)).toBeUndefined()
    expect(normalizeDecisionDescription('   ')).toBeUndefined()
    expect(
      normalizeDecisionDescription(`  ${'x'.repeat(1_001)}  `),
    ).toHaveLength(1_000)
    const publicDraft = normalizeStandaloneDecisionDraft(
      {
        title: 'Public question',
        description: '   ',
        visibility: 'public',
        selectMode: 'multi',
        options: ['One', 'Two'],
        inviteEmails: [],
      },
      now,
    )
    expect(publicDraft).not.toHaveProperty('description')
    expect(publicDraft).not.toHaveProperty('closesAt')
    expect(() =>
      normalizeStandaloneDecisionDraft(
        {
          title: 'Too many invitations',
          visibility: 'invited',
          selectMode: 'single',
          options: ['One', 'Two'],
          inviteEmails: Array.from(
            { length: 101 },
            (_, index) => `${index}@example.com`,
          ),
        },
        now,
      ),
    ).toThrow(/at most 100/i)
    expect(
      normalizeAttachedDecisionDraft(
        {
          title: 'Attached question',
          description: ' context ',
          selectMode: 'single',
          options: ['One', 'Two'],
        },
        now,
      ),
    ).toMatchObject({ description: 'context' })
  })
})
