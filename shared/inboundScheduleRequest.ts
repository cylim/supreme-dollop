import {
  generateRangeCandidates,
  normalizeScheduleDraft,
} from './scheduleDraft'
import type {
  CandidateTime,
  NormalizedScheduleDraft,
  ScheduleVisibility,
} from './scheduleDraft'

const requestStart = 'JRNY_SELECT_REQUEST_V1'
const requestEnd = 'END_JRNY_SELECT_REQUEST'
const explicitOffset = /(Z|[+-]\d{2}:\d{2})$/

export const scheduleRequestMarkers = { start: requestStart, end: requestEnd }

export function parseInboundScheduleRequest(
  body: string,
  now = Date.now(),
): NormalizedScheduleDraft {
  const json = extractRequestJson(body)
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    throw new Error('The schedule request contains invalid JSON.')
  }
  if (!isRecord(value))
    throw new Error('The schedule request must be a JSON object.')

  const title = requiredString(value, 'title')
  const description = optionalString(value, 'description')
  const visibility = parseVisibility(value.visibility)
  const timezone = requiredString(value, 'timezone')
  const durationMinutes = requiredNumber(value, 'durationMinutes')
  const votingClosesAt = parseTimestamp(
    requiredString(value, 'votingClosesAt'),
    'votingClosesAt',
  )
  const inviteEmails = optionalStringArray(value, 'inviteEmails')
  const options = parseCandidates(value.candidates, durationMinutes)

  return normalizeScheduleDraft(
    {
      title,
      ...(description ? { description } : {}),
      visibility,
      timezone,
      durationMinutes,
      votingClosesAt,
      options,
      inviteEmails,
    },
    now,
  )
}

function extractRequestJson(body: string): string {
  const start = body.indexOf(requestStart)
  const end = body.indexOf(requestEnd)
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`Wrap the JSON between ${requestStart} and ${requestEnd}.`)
  }
  return body.slice(start + requestStart.length, end).trim()
}

function parseCandidates(
  value: unknown,
  durationMinutes: number,
): Array<CandidateTime> {
  if (!isRecord(value)) throw new Error('candidates must be an object.')
  const hasExact = Array.isArray(value.exact)
  const hasRange = isRecord(value.range)
  if (hasExact === hasRange) {
    throw new Error('Use exactly one candidates mode: exact or range.')
  }
  if (hasExact) {
    return (value.exact as Array<unknown>).map((item, index) => {
      if (typeof item !== 'string') {
        throw new Error(`candidates.exact[${index}] must be a timestamp.`)
      }
      const startAt = parseTimestamp(item, `candidates.exact[${index}]`)
      return {
        startAt,
        endAt: startAt + durationMinutes * 60_000,
        source: 'exact',
      }
    })
  }
  const range = value.range as Record<string, unknown>
  return generateRangeCandidates({
    startAt: parseTimestamp(requiredString(range, 'startAt'), 'range.startAt'),
    endAt: parseTimestamp(requiredString(range, 'endAt'), 'range.endAt'),
    durationMinutes,
    intervalMinutes: requiredNumber(range, 'intervalMinutes'),
  })
}

function parseTimestamp(value: string, field: string): number {
  if (!explicitOffset.test(value)) {
    throw new Error(`${field} must include Z or an explicit UTC offset.`)
  }
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) throw new Error(`${field} is invalid.`)
  return timestamp
}

function parseVisibility(value: unknown): ScheduleVisibility {
  if (value !== 'public' && value !== 'invited') {
    throw new Error('visibility must be public or invited.')
  }
  return value
}

function requiredString(value: Record<string, unknown>, field: string): string {
  const item = value[field]
  if (typeof item !== 'string' || item.trim() === '') {
    throw new Error(`${field} must be a non-empty string.`)
  }
  return item
}

function optionalString(value: Record<string, unknown>, field: string) {
  const item = value[field]
  if (item === undefined) return undefined
  if (typeof item !== 'string') throw new Error(`${field} must be a string.`)
  return item
}

function requiredNumber(value: Record<string, unknown>, field: string): number {
  const item = value[field]
  if (typeof item !== 'number') throw new Error(`${field} must be a number.`)
  return item
}

function optionalStringArray(
  value: Record<string, unknown>,
  field: string,
): Array<string> {
  const item = value[field]
  if (item === undefined) return []
  if (!Array.isArray(item) || item.some((entry) => typeof entry !== 'string')) {
    throw new Error(`${field} must be an array of strings.`)
  }
  return item as Array<string>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
