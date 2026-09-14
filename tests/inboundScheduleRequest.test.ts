import { describe, expect, it } from 'vitest'
import {
  parseInboundRequest,
  parseInboundScheduleRequest,
  scheduleRequestMarkers,
} from '../shared/inboundScheduleRequest'

const now = Date.UTC(2026, 8, 8, 0)

function request(value: unknown) {
  return `${scheduleRequestMarkers.start}\n${JSON.stringify(value)}\n${scheduleRequestMarkers.end}`
}

describe('inbound schedule request protocol', () => {
  it('parses an exact-time request', () => {
    const result = parseInboundScheduleRequest(
      request({
        kind: 'schedule',
        title: 'Community planning session',
        visibility: 'public',
        timezone: 'Asia/Kuala_Lumpur',
        durationMinutes: 60,
        votingClosesAt: '2026-09-09T12:00:00+08:00',
        candidates: {
          exact: ['2026-09-10T10:00:00+08:00', '2026-09-10T14:00:00+08:00'],
        },
      }),
      now,
    )
    expect(result.options).toHaveLength(2)
    expect(result.options[0].endAt - result.options[0].startAt).toBe(3_600_000)
  })

  it('requires explicit timestamp offsets and protocol markers', () => {
    expect(() =>
      parseInboundScheduleRequest(
        request({
          kind: 'schedule',
          title: 'Community planning session',
          visibility: 'public',
          timezone: 'Asia/Kuala_Lumpur',
          durationMinutes: 60,
          votingClosesAt: '2026-09-09T12:00:00',
          candidates: { exact: ['2026-09-10T10:00:00+08:00'] },
        }),
        now,
      ),
    ).toThrow(/explicit UTC offset/i)
    expect(() => parseInboundScheduleRequest('{}', now)).toThrow(
      /Wrap the JSON/i,
    )
  })

  it('parses a standalone decision and a schedule with attached decisions', () => {
    const decision = parseInboundRequest(
      request({
        kind: 'decision',
        title: 'Beach or park?',
        visibility: 'public',
        selectMode: 'single',
        options: ['Beach', 'Park'],
      }),
      now,
    )
    expect(decision).toMatchObject({
      kind: 'decision',
      decision: { title: 'Beach or park?', selectMode: 'single' },
    })
    const combined = parseInboundRequest(
      request({
        kind: 'schedule',
        title: 'Saturday dinner',
        visibility: 'public',
        timezone: 'Asia/Kuala_Lumpur',
        durationMinutes: 90,
        votingClosesAt: '2026-09-09T12:00:00+08:00',
        candidates: {
          exact: ['2026-09-10T19:00:00+08:00', '2026-09-10T20:00:00+08:00'],
        },
        decisions: [
          {
            title: 'What do we eat?',
            selectMode: 'single',
            options: ['Thai', 'Pizza'],
          },
        ],
      }),
      now,
    )
    expect(combined.kind).toBe('schedule')
    if (combined.kind !== 'schedule') return
    expect(combined.decisions).toHaveLength(1)
    expect(combined.decisions[0].title).toBe('What do we eat?')
  })

  it('rejects attached decisions that set their own access', () => {
    expect(() =>
      parseInboundRequest(
        request({
          kind: 'schedule',
          title: 'Saturday dinner',
          visibility: 'public',
          timezone: 'Asia/Kuala_Lumpur',
          durationMinutes: 60,
          votingClosesAt: '2026-09-09T12:00:00+08:00',
          candidates: {
            exact: ['2026-09-10T19:00:00+08:00', '2026-09-10T20:00:00+08:00'],
          },
          decisions: [
            {
              title: 'What do we eat?',
              selectMode: 'single',
              options: ['Thai', 'Pizza'],
              visibility: 'public',
            },
          ],
        }),
        now,
      ),
    ).toThrow(/inherits access/i)
  })

  it('rejects malformed envelopes, JSON values, and kinds', () => {
    expect(() =>
      parseInboundRequest(
        `${scheduleRequestMarkers.start}\n{bad\n${scheduleRequestMarkers.end}`,
        now,
      ),
    ).toThrow(/invalid JSON/i)
    for (const value of [null, [], 'text', 1]) {
      expect(() => parseInboundRequest(request(value), now)).toThrow(
        /JSON object/i,
      )
    }
    for (const value of [{}, { kind: 'poll' }]) {
      expect(() => parseInboundRequest(request(value), now)).toThrow(
        /kind must be schedule or decision/i,
      )
    }
    expect(() =>
      parseInboundScheduleRequest(
        request({
          kind: 'decision',
          title: 'Where should we go?',
          visibility: 'public',
          selectMode: 'single',
          options: ['Beach', 'Park'],
        }),
        now,
      ),
    ).toThrow(/kind must be schedule/i)
  })

  it('validates decision-only fields and optional deadline parsing', () => {
    expect(() =>
      parseInboundRequest(
        request({
          kind: 'decision',
          title: 'Where should we go?',
          visibility: 'public',
          selectMode: 'single',
          options: ['Beach', 'Park'],
          candidates: {},
        }),
        now,
      ),
    ).toThrow(/cannot include candidates/i)
    expect(
      parseInboundRequest(
        request({
          kind: 'decision',
          title: 'Where should we go?',
          description: 'Context',
          visibility: 'invited',
          selectMode: 'multi',
          options: ['Beach', 'Park'],
          inviteEmails: ['person@example.com'],
          closesAt: '2026-09-10T12:00:00Z',
        }),
        now,
      ),
    ).toMatchObject({
      kind: 'decision',
      decision: { description: 'Context', visibility: 'invited' },
    })
  })

  it('validates attached-decision collection shape and access inheritance', () => {
    const base = {
      kind: 'schedule',
      title: 'Saturday dinner',
      visibility: 'public',
      timezone: 'UTC',
      durationMinutes: 60,
      votingClosesAt: '2026-09-09T12:00:00Z',
      candidates: {
        exact: ['2026-09-10T19:00:00Z', '2026-09-10T20:00:00Z'],
      },
    }
    expect(() =>
      parseInboundRequest(request({ ...base, decisions: {} }), now),
    ).toThrow(/must be an array/i)
    expect(() =>
      parseInboundRequest(
        request({ ...base, decisions: Array.from({ length: 21 }, () => ({})) }),
        now,
      ),
    ).toThrow(/at most 20/i)
    expect(() =>
      parseInboundRequest(request({ ...base, decisions: [null] }), now),
    ).toThrow(/must be an object/i)
    expect(() =>
      parseInboundRequest(
        request({
          ...base,
          decisions: [
            {
              title: 'Food?',
              selectMode: 'single',
              options: ['Thai', 'Pizza'],
              inviteEmails: [],
            },
          ],
        }),
        now,
      ),
    ).toThrow(/inherits access/i)
    expect(
      parseInboundRequest(
        request({
          ...base,
          decisions: [
            {
              title: 'Food?',
              description: 'Dinner',
              selectMode: 'single',
              options: ['Thai', 'Pizza'],
              closesAt: '2026-09-10T12:00:00Z',
            },
          ],
        }),
        now,
      ),
    ).toMatchObject({ kind: 'schedule' })
  })

  it('validates schedule scalar and candidate-mode fields', () => {
    const base = {
      kind: 'schedule',
      title: 'Planning session',
      visibility: 'public',
      timezone: 'UTC',
      durationMinutes: 60,
      votingClosesAt: '2026-09-09T12:00:00Z',
      candidates: {
        exact: ['2026-09-10T10:00:00Z', '2026-09-10T11:00:00Z'],
      },
    }
    const malformed = [
      { ...base, title: 3 },
      { ...base, title: ' ' },
      { ...base, description: 3 },
      { ...base, visibility: 'private' },
      { ...base, timezone: undefined },
      { ...base, durationMinutes: '60' },
      { ...base, inviteEmails: 'person@example.com' },
      { ...base, inviteEmails: [3] },
      { ...base, candidates: null },
      { ...base, candidates: {} },
      { ...base, candidates: { exact: [], range: {} } },
      { ...base, candidates: { exact: [3] } },
      { ...base, candidates: { exact: ['not-a-dateZ'] } },
    ]
    for (const value of malformed) {
      expect(() => parseInboundRequest(request(value), now)).toThrow()
    }
  })

  it('parses range candidates and rejects malformed range fields', () => {
    const base = {
      kind: 'schedule',
      title: 'Planning session',
      visibility: 'public',
      timezone: 'UTC',
      durationMinutes: 60,
      votingClosesAt: '2026-09-09T12:00:00Z',
    }
    const parsed = parseInboundRequest(
      request({
        ...base,
        candidates: {
          range: {
            startAt: '2026-09-10T10:00:00Z',
            endAt: '2026-09-10T14:00:00Z',
            intervalMinutes: 60,
          },
        },
      }),
      now,
    )
    expect(parsed).toMatchObject({ kind: 'schedule' })
    expect(() =>
      parseInboundRequest(
        request({
          ...base,
          candidates: {
            range: {
              startAt: 3,
              endAt: '2026-09-10T14:00:00Z',
              intervalMinutes: 60,
            },
          },
        }),
        now,
      ),
    ).toThrow(/startAt must be a non-empty string/i)
  })
})
