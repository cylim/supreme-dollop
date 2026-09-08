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
          exact: [
            '2026-09-10T10:00:00+08:00',
            '2026-09-10T14:00:00+08:00',
          ],
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
    expect(() => parseInboundScheduleRequest('{}', now)).toThrow(/Wrap the JSON/i)
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
        candidates: { exact: ['2026-09-10T19:00:00+08:00', '2026-09-10T20:00:00+08:00'] },
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
          candidates: { exact: ['2026-09-10T19:00:00+08:00', '2026-09-10T20:00:00+08:00'] },
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
})
