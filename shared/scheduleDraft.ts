export const MIN_CANDIDATE_TIMES = 2
export const MAX_CANDIDATE_TIMES = 100
export const MAX_INVITATIONS = 100

export type ScheduleVisibility = 'public' | 'invited'
export type CandidateSource = 'exact' | 'range'

export type CandidateTime = {
  startAt: number
  endAt: number
  source: CandidateSource
}

export type ScheduleDraftInput = {
  title: string
  description?: string
  visibility: ScheduleVisibility
  timezone: string
  durationMinutes: number
  votingClosesAt: number
  options: Array<CandidateTime>
  inviteEmails: Array<string>
}

export type NormalizedScheduleDraft = Omit<ScheduleDraftInput, 'description'> & {
  description?: string
}

export function candidateKey(candidate: Pick<CandidateTime, 'startAt' | 'endAt'>) {
  return `${candidate.startAt}:${candidate.endAt}`
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function parseInviteEmails(value: string): Array<string> {
  return value
    .split(/[\n,;]/)
    .map(normalizeEmail)
    .filter(Boolean)
}

export function generateRangeCandidates(args: {
  startAt: number
  endAt: number
  durationMinutes: number
  intervalMinutes: number
}): Array<CandidateTime> {
  assertTimestamp(args.startAt, 'Range start')
  assertTimestamp(args.endAt, 'Range end')
  assertDuration(args.durationMinutes)
  if (!Number.isInteger(args.intervalMinutes) || args.intervalMinutes < 5) {
    throw new Error('The range step must be at least 5 minutes.')
  }
  if (args.endAt <= args.startAt) {
    throw new Error('Choose a range with an end after its start.')
  }

  const duration = args.durationMinutes * 60_000
  const interval = args.intervalMinutes * 60_000
  const candidates: Array<CandidateTime> = []
  for (
    let cursor = args.startAt;
    cursor + duration <= args.endAt;
    cursor += interval
  ) {
    candidates.push({
      startAt: cursor,
      endAt: cursor + duration,
      source: 'range',
    })
    if (candidates.length > MAX_CANDIDATE_TIMES) {
      throw new Error(
        'That range creates more than 100 choices. Narrow it or increase the step.',
      )
    }
  }
  if (candidates.length === 0) {
    throw new Error('The range is shorter than the event duration.')
  }
  return candidates
}

export function mergeCandidateTimes(
  current: Array<CandidateTime>,
  additions: Array<CandidateTime>,
): Array<CandidateTime> {
  const byKey = new Map(current.map((candidate) => [candidateKey(candidate), candidate]))
  for (const candidate of additions) byKey.set(candidateKey(candidate), candidate)
  return Array.from(byKey.values())
    .sort((left, right) => left.startAt - right.startAt)
    .slice(0, MAX_CANDIDATE_TIMES)
}

export function normalizeScheduleDraft(
  input: ScheduleDraftInput,
  now = Date.now(),
): NormalizedScheduleDraft {
  const title = input.title.trim()
  if (title.length < 3 || title.length > 120) {
    throw new Error('Use a title between 3 and 120 characters.')
  }
  assertDuration(input.durationMinutes)
  assertTimestamp(input.votingClosesAt, 'Voting deadline')
  if (input.votingClosesAt <= now + 60_000) {
    throw new Error('Voting must stay open for at least one minute.')
  }
  const timezone = input.timezone.trim()
  if (timezone.length === 0 || timezone.length > 80) {
    throw new Error('Use a valid time zone.')
  }
  if (
    input.options.length < MIN_CANDIDATE_TIMES ||
    input.options.length > MAX_CANDIDATE_TIMES
  ) {
    throw new Error('Add between 2 and 100 candidate times.')
  }

  const seen = new Set<string>()
  const options = input.options
    .map((option) => {
      assertTimestamp(option.startAt, 'Candidate start')
      assertTimestamp(option.endAt, 'Candidate end')
      if (option.endAt <= option.startAt) {
        throw new Error('Each candidate must end after it starts.')
      }
      const key = candidateKey(option)
      if (seen.has(key)) throw new Error('Candidate times must be unique.')
      seen.add(key)
      return { ...option }
    })
    .sort((left, right) => left.startAt - right.startAt)

  const inviteEmails = Array.from(
    new Set(input.inviteEmails.map(normalizeEmail).filter(Boolean)),
  )
  if (inviteEmails.length > MAX_INVITATIONS) {
    throw new Error('A schedule can invite at most 100 people.')
  }
  if (input.visibility === 'invited' && inviteEmails.length === 0) {
    throw new Error('Invited schedules need at least one email.')
  }

  const description = input.description?.trim()
  return {
    title,
    ...(description ? { description: description.slice(0, 1_000) } : {}),
    visibility: input.visibility,
    timezone,
    durationMinutes: input.durationMinutes,
    votingClosesAt: input.votingClosesAt,
    options,
    inviteEmails,
  }
}

function assertTimestamp(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 8_640_000_000_000_000) {
    throw new Error(`${label} is invalid.`)
  }
}

function assertDuration(value: number): void {
  if (!Number.isInteger(value) || value < 15 || value > 480) {
    throw new Error('Duration must be between 15 minutes and 8 hours.')
  }
}
