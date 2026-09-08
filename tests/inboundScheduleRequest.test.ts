import { describe, expect, it } from 'vitest'
import {
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
})
