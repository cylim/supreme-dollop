import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import {
  candidateKey,
  generateRangeCandidates,
  mergeCandidateTimes,
  normalizeScheduleDraft,
  parseInviteEmails,
} from '../../shared/scheduleDraft'
import type {
  CandidateTime,
  ScheduleVisibility,
} from '../../shared/scheduleDraft'
import type { FormEvent } from 'react'

type CandidateMode = 'exact' | 'range'

type DraftFields = {
  title: string
  description: string
  visibility: ScheduleVisibility
  durationMinutes: number
  deadline: string
  exactStart: string
  rangeStart: string
  rangeEnd: string
  intervalMinutes: number
  candidateMode: CandidateMode
  inviteEmails: string
}

function toLocalInput(value: Date): string {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function initialDate(hoursAhead: number): string {
  const date = new Date(Date.now() + hoursAhead * 60 * 60 * 1_000)
  date.setMinutes(0, 0, 0)
  return toLocalInput(date)
}

export function useScheduleDraft() {
  const createSchedule = useMutation(api.schedules.create)
  const navigate = useNavigate()
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const [fields, setFields] = useState<DraftFields>(() => ({
    title: '',
    description: '',
    visibility: 'public',
    durationMinutes: 60,
    deadline: initialDate(48),
    exactStart: initialDate(24),
    rangeStart: initialDate(24),
    rangeEnd: initialDate(28),
    intervalMinutes: 30,
    candidateMode: 'exact',
    inviteEmails: '',
  }))
  const [candidates, setCandidates] = useState<Array<CandidateTime>>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const sortedCandidates = useMemo(
    () => [...candidates].sort((left, right) => left.startAt - right.startAt),
    [candidates],
  )

  function update<TField extends keyof DraftFields>(
    field: TField,
    value: DraftFields[TField],
  ) {
    setFields((current) => ({ ...current, [field]: value }))
  }

  function addExact() {
    const startAt = new Date(fields.exactStart).getTime()
    if (!Number.isFinite(startAt)) {
      setError('Choose a valid exact time.')
      return
    }
    const candidate = {
      startAt,
      endAt: startAt + fields.durationMinutes * 60_000,
      source: 'exact' as const,
    }
    setCandidates((current) => mergeCandidateTimes(current, [candidate]))
    setError(null)
  }

  function addRange() {
    try {
      const additions = generateRangeCandidates({
        startAt: new Date(fields.rangeStart).getTime(),
        endAt: new Date(fields.rangeEnd).getTime(),
        durationMinutes: fields.durationMinutes,
        intervalMinutes: fields.intervalMinutes,
      })
      setCandidates((current) => mergeCandidateTimes(current, additions))
      setError(null)
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not generate times.',
      )
    }
  }

  function removeCandidate(candidate: CandidateTime) {
    const key = candidateKey(candidate)
    setCandidates((current) =>
      current.filter((item) => candidateKey(item) !== key),
    )
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const draft = normalizeScheduleDraft({
        title: fields.title,
        ...(fields.description.trim()
          ? { description: fields.description }
          : {}),
        visibility: fields.visibility,
        timezone,
        durationMinutes: fields.durationMinutes,
        votingClosesAt: new Date(fields.deadline).getTime(),
        options: sortedCandidates,
        inviteEmails:
          fields.visibility === 'invited'
            ? parseInviteEmails(fields.inviteEmails)
            : [],
      })
      const result = await createSchedule(draft)
      await navigate({ to: '/s/$slug', params: { slug: result.slug } })
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not create the schedule.',
      )
      setSaving(false)
    }
  }

  return {
    fields,
    timezone,
    candidates: sortedCandidates,
    error,
    saving,
    update,
    addExact,
    addRange,
    removeCandidate,
    clearCandidates: () => setCandidates([]),
    submit,
  }
}
