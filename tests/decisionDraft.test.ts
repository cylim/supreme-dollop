import { describe, expect, it } from 'vitest'
import {
  normalizeAttachedDecisionDraft,
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
})
