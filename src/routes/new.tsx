import { useMemo, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import * as stylex from '@stylexjs/stylex'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { AppShell } from '../components/AppShell'
import { AuthGate } from '../components/AuthGate'
import type { FormEvent, KeyboardEvent } from 'react'

export const Route = createFileRoute('/new')({ component: NewSchedulePage })

type Candidate = {
  key: string
  startAt: number
  endAt: number
  source: 'exact' | 'range'
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

function NewSchedulePage() {
  return (
    <AppShell>
      <AuthGate>
        <ScheduleForm />
      </AuthGate>
    </AppShell>
  )
}

function ScheduleForm() {
  const createSchedule = useMutation(api.schedules.create)
  const navigate = useNavigate()
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'invited'>('public')
  const [durationMinutes, setDurationMinutes] = useState(60)
  const [deadline, setDeadline] = useState(initialDate(48))
  const [exactStart, setExactStart] = useState(initialDate(24))
  const [rangeStart, setRangeStart] = useState(initialDate(24))
  const [rangeEnd, setRangeEnd] = useState(initialDate(28))
  const [intervalMinutes, setIntervalMinutes] = useState(30)
  const [candidateMode, setCandidateMode] = useState<'exact' | 'range'>('exact')
  const [inviteEmails, setInviteEmails] = useState('')
  const [candidates, setCandidates] = useState<Array<Candidate>>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const sortedCandidates = useMemo(
    () => [...candidates].sort((a, b) => a.startAt - b.startAt),
    [candidates],
  )

  const addCandidate = (candidate: Candidate) => {
    setCandidates((current) => {
      if (current.some((item) => item.key === candidate.key)) return current
      return [...current, candidate].slice(0, 100)
    })
  }

  const addExact = () => {
    const startAt = new Date(exactStart).getTime()
    if (!Number.isFinite(startAt)) return setError('Choose a valid exact time.')
    const endAt = startAt + durationMinutes * 60_000
    addCandidate({
      key: `${startAt}:${endAt}`,
      startAt,
      endAt,
      source: 'exact',
    })
    setError(null)
  }

  const addRange = () => {
    const startAt = new Date(rangeStart).getTime()
    const rangeEndsAt = new Date(rangeEnd).getTime()
    if (
      !Number.isFinite(startAt) ||
      !Number.isFinite(rangeEndsAt) ||
      rangeEndsAt <= startAt
    ) {
      return setError('Choose a range with an end after its start.')
    }
    const duration = durationMinutes * 60_000
    const interval = intervalMinutes * 60_000
    const generated: Array<Candidate> = []
    for (
      let cursor = startAt;
      cursor + duration <= rangeEndsAt;
      cursor += interval
    ) {
      generated.push({
        key: `${cursor}:${cursor + duration}`,
        startAt: cursor,
        endAt: cursor + duration,
        source: 'range',
      })
      if (generated.length > 100) break
    }
    if (generated.length === 0)
      return setError('The range is shorter than the event duration.')
    if (generated.length > 100)
      return setError(
        'That range creates more than 100 choices. Narrow it or increase the step.',
      )
    setCandidates((current) => {
      const byKey = new Map(current.map((item) => [item.key, item]))
      for (const item of generated) byKey.set(item.key, item)
      return Array.from(byKey.values()).slice(0, 100)
    })
    setError(null)
  }

  const moveCandidateTab = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    const nextMode = candidateMode === 'exact' ? 'range' : 'exact'
    setCandidateMode(nextMode)
    document.getElementById(`candidate-${nextMode}-tab`)?.focus()
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (candidates.length < 2)
      return setError('Add at least two candidate times.')
    setSaving(true)
    try {
      const result = await createSchedule({
        title,
        ...(description.trim() ? { description } : {}),
        visibility,
        timezone,
        durationMinutes,
        votingClosesAt: new Date(deadline).getTime(),
        options: sortedCandidates.map(({ startAt, endAt, source }) => ({
          startAt,
          endAt,
          source,
        })),
        inviteEmails:
          visibility === 'invited'
            ? inviteEmails
                .split(/[\n,;]/)
                .map((email) => email.trim())
                .filter(Boolean)
            : [],
      })
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

  return (
    <main {...stylex.props(styles.main)}>
      <div {...stylex.props(styles.heading)}>
        <span {...stylex.props(styles.kicker)}>New schedule</span>
        <h1 {...stylex.props(styles.title)}>Give the group good options.</h1>
        <p {...stylex.props(styles.lead)}>
          Add precise starts one by one, or turn a broad window into voteable
          slots.
        </p>
      </div>
      <form
        {...stylex.props(styles.form)}
        onSubmit={(event) => void submit(event)}
      >
        <section {...stylex.props(styles.card)}>
          <span {...stylex.props(styles.step)}>01 · The occasion</span>
          <label {...stylex.props(styles.label)}>
            Event title
            <input
              {...stylex.props(styles.input)}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              maxLength={120}
              placeholder="Quarterly planning"
            />
          </label>
          <label {...stylex.props(styles.label)}>
            A little context{' '}
            <span {...stylex.props(styles.optional)}>optional</span>
            <textarea
              {...stylex.props(styles.textarea)}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={1000}
              placeholder="What should people know before voting?"
            />
          </label>
          <div {...stylex.props(styles.twoColumns)}>
            <label {...stylex.props(styles.label)}>
              Duration
              <select
                {...stylex.props(styles.input)}
                value={durationMinutes}
                onChange={(event) =>
                  setDurationMinutes(Number(event.target.value))
                }
              >
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>1 hour</option>
                <option value={90}>1.5 hours</option>
                <option value={120}>2 hours</option>
              </select>
            </label>
            <label {...stylex.props(styles.label)}>
              Voting closes
              <input
                type="datetime-local"
                {...stylex.props(styles.input)}
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
                required
              />
            </label>
          </div>
          <p {...stylex.props(styles.hint)}>
            Times use {timezone} while you edit. Voters see their local
            timezone.
          </p>
        </section>

        <section {...stylex.props(styles.card)}>
          <span {...stylex.props(styles.step)}>02 · Candidate times</span>
          <div
            role="tablist"
            aria-label="Candidate time mode"
            {...stylex.props(styles.modeTabs)}
          >
            <button
              id="candidate-exact-tab"
              type="button"
              role="tab"
              aria-selected={candidateMode === 'exact'}
              aria-controls="candidate-exact-panel"
              tabIndex={candidateMode === 'exact' ? 0 : -1}
              {...stylex.props(
                styles.modeTab,
                candidateMode === 'exact' && styles.modeTabActive,
              )}
              onClick={() => setCandidateMode('exact')}
              onKeyDown={moveCandidateTab}
            >
              Exact time
            </button>
            <button
              id="candidate-range-tab"
              type="button"
              role="tab"
              aria-selected={candidateMode === 'range'}
              aria-controls="candidate-range-panel"
              tabIndex={candidateMode === 'range' ? 0 : -1}
              {...stylex.props(
                styles.modeTab,
                candidateMode === 'range' && styles.modeTabActive,
              )}
              onClick={() => setCandidateMode('range')}
              onKeyDown={moveCandidateTab}
            >
              Rough window
            </button>
          </div>
          {candidateMode === 'exact' ? (
            <div
              id="candidate-exact-panel"
              role="tabpanel"
              aria-labelledby="candidate-exact-tab"
              {...stylex.props(styles.modePanel)}
            >
              <h2 {...stylex.props(styles.modeTitle)}>Exact time</h2>
              <p {...stylex.props(styles.modeCopy)}>Add a specific start.</p>
              <input
                type="datetime-local"
                {...stylex.props(styles.input)}
                value={exactStart}
                onChange={(event) => setExactStart(event.target.value)}
              />
              <button
                type="button"
                {...stylex.props(styles.secondaryButton)}
                onClick={addExact}
              >
                Add exact time
              </button>
            </div>
          ) : (
            <div
              id="candidate-range-panel"
              role="tabpanel"
              aria-labelledby="candidate-range-tab"
              {...stylex.props(styles.modePanel)}
            >
              <h2 {...stylex.props(styles.modeTitle)}>Rough window</h2>
              <p {...stylex.props(styles.modeCopy)}>
                Generate options throughout a range.
              </p>
              <input
                type="datetime-local"
                {...stylex.props(styles.input)}
                value={rangeStart}
                onChange={(event) => setRangeStart(event.target.value)}
              />
              <input
                type="datetime-local"
                {...stylex.props(styles.input)}
                value={rangeEnd}
                onChange={(event) => setRangeEnd(event.target.value)}
              />
              <label {...stylex.props(styles.compactLabel)}>
                Start every
                <select
                  {...stylex.props(styles.compactSelect)}
                  value={intervalMinutes}
                  onChange={(event) =>
                    setIntervalMinutes(Number(event.target.value))
                  }
                >
                  <option value={15}>15 min</option>
                  <option value={30}>30 min</option>
                  <option value={60}>60 min</option>
                </select>
              </label>
              <button
                type="button"
                {...stylex.props(styles.secondaryButton)}
                onClick={addRange}
              >
                Generate from range
              </button>
            </div>
          )}
          <div {...stylex.props(styles.candidateList)}>
            <div {...stylex.props(styles.listHeader)}>
              <strong>{sortedCandidates.length} candidates</strong>
              <button
                type="button"
                {...stylex.props(styles.textButton)}
                onClick={() => setCandidates([])}
              >
                Clear
              </button>
            </div>
            {sortedCandidates.map((candidate) => (
              <div key={candidate.key} {...stylex.props(styles.candidate)}>
                <div>
                  <strong>{formatDate(candidate.startAt)}</strong>
                  <span>
                    {formatTime(candidate.startAt)}–
                    {formatTime(candidate.endAt)} · {candidate.source}
                  </span>
                </div>
                <button
                  type="button"
                  aria-label="Remove candidate"
                  {...stylex.props(styles.removeButton)}
                  onClick={() =>
                    setCandidates((current) =>
                      current.filter((item) => item.key !== candidate.key),
                    )
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </section>

        <section {...stylex.props(styles.card)}>
          <span {...stylex.props(styles.step)}>03 · Who can vote</span>
          <div {...stylex.props(styles.choiceRow)}>
            <button
              type="button"
              {...stylex.props(
                styles.choice,
                visibility === 'public' && styles.choiceActive,
              )}
              onClick={() => setVisibility('public')}
            >
              <strong>Public link</strong>
              <span>Any signed-in user with the link</span>
            </button>
            <button
              type="button"
              {...stylex.props(
                styles.choice,
                visibility === 'invited' && styles.choiceActive,
              )}
              onClick={() => setVisibility('invited')}
            >
              <strong>Invite only</strong>
              <span>Restricted to listed Google emails</span>
            </button>
          </div>
          {visibility === 'invited' && (
            <label {...stylex.props(styles.label)}>
              Guest emails
              <textarea
                {...stylex.props(styles.textarea)}
                value={inviteEmails}
                onChange={(event) => setInviteEmails(event.target.value)}
                placeholder={'alex@example.com\njamie@example.com'}
              />
            </label>
          )}
        </section>

        {error && (
          <p role="alert" {...stylex.props(styles.error)}>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={saving}
          {...stylex.props(styles.submitButton)}
        >
          {saving ? 'Creating…' : 'Open voting'}
        </button>
      </form>
    </main>
  )
}

function formatDate(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(value)
}
function formatTime(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(value)
}

const styles = stylex.create({
  main: {
    width: '100%',
    maxWidth: 880,
    marginInline: 'auto',
    paddingInline: 24,
    paddingBlock: 42,
  },
  heading: { maxWidth: 680, marginBottom: 34 },
  kicker: {
    color: '#28704a',
    fontSize: 11,
    fontWeight: 850,
    letterSpacing: '0.13em',
    textTransform: 'uppercase',
  },
  title: {
    marginBlock: 10,
    color: '#18231c',
    fontSize: { default: 48, '@media (max-width: 600px)': 38 },
    letterSpacing: '-0.055em',
    lineHeight: 1,
  },
  lead: { color: '#59675e', fontSize: 17, lineHeight: 1.6 },
  form: { display: 'flex', flexDirection: 'column', gap: 18 },
  card: {
    padding: { default: 30, '@media (max-width: 600px)': 20 },
    borderRadius: 22,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#c7d0c7',
    backgroundColor: '#fffdf8',
  },
  step: {
    display: 'block',
    marginBottom: 22,
    color: '#31734e',
    fontSize: 11,
    fontWeight: 850,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginTop: 16,
    color: '#29372e',
    fontSize: 13,
    fontWeight: 700,
  },
  optional: { color: '#7b877e', fontSize: 11, fontWeight: 500 },
  input: {
    width: '100%',
    minHeight: 45,
    paddingInline: 13,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: { default: '#aeb9b0', ':focus': '#267049' },
    borderRadius: 11,
    outline: 'none',
    color: '#1f2b23',
    backgroundColor: '#fbfcf9',
  },
  textarea: {
    width: '100%',
    minHeight: 96,
    padding: 13,
    resize: 'vertical',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: { default: '#aeb9b0', ':focus': '#267049' },
    borderRadius: 11,
    outline: 'none',
    color: '#1f2b23',
    backgroundColor: '#fbfcf9',
  },
  twoColumns: {
    display: 'grid',
    gridTemplateColumns: {
      default: '1fr 1fr',
      '@media (max-width: 600px)': '1fr',
    },
    gap: 14,
  },
  hint: { color: '#718077', fontSize: 12 },
  modeTabs: {
    padding: 4,
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 4,
    borderRadius: 13,
    backgroundColor: '#e3e9e2',
  },
  modeTab: {
    minHeight: 42,
    paddingInline: 12,
    borderWidth: 0,
    borderRadius: 10,
    color: '#59675e',
    backgroundColor: { default: 'transparent', ':hover': '#edf2ec' },
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 750,
  },
  modeTabActive: {
    color: '#174f30',
    backgroundColor: '#fffdf8',
    boxShadow: '0 2px 9px rgba(37, 67, 46, 0.12)',
  },
  modePanel: {
    marginTop: 12,
    padding: { default: 22, '@media (max-width: 600px)': 18 },
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    borderRadius: 16,
    backgroundColor: '#eff3ed',
  },
  modeTitle: { margin: 0, color: '#223129', fontSize: 17 },
  modeCopy: { margin: 0, color: '#68766d', fontSize: 12 },
  compactLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: '#55645a',
    fontSize: 12,
  },
  compactSelect: {
    padding: 6,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#abb6ad',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  secondaryButton: {
    marginTop: 3,
    padding: 10,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#43815a',
    borderRadius: 10,
    color: '#185331',
    backgroundColor: { default: '#f7fff9', ':hover': '#fff' },
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 750,
  },
  candidateList: {
    marginTop: 22,
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
  },
  listHeader: {
    paddingBottom: 8,
    display: 'flex',
    justifyContent: 'space-between',
    color: '#4c5a51',
    fontSize: 12,
  },
  textButton: {
    borderWidth: 0,
    color: '#276946',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    fontSize: 12,
  },
  candidate: {
    padding: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 11,
    backgroundColor: '#f3f3ee',
    color: '#2b382f',
    fontSize: 12,
  },
  removeButton: {
    width: 30,
    height: 30,
    borderWidth: 0,
    borderRadius: 9,
    color: '#7e3931',
    backgroundColor: { default: '#fbe9e6', ':hover': '#f6d8d3' },
    cursor: 'pointer',
    fontSize: 20,
  },
  choiceRow: {
    display: 'grid',
    gridTemplateColumns: {
      default: '1fr 1fr',
      '@media (max-width: 600px)': '1fr',
    },
    gap: 12,
  },
  choice: {
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'start',
    gap: 4,
    textAlign: 'left',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#b4beb6',
    borderRadius: 14,
    color: '#455249',
    backgroundColor: '#f8f8f4',
    cursor: 'pointer',
    fontSize: 12,
  },
  choiceActive: {
    borderColor: '#2a7650',
    color: '#174e30',
    backgroundColor: '#e9f5ec',
    boxShadow: 'inset 0 0 0 1px #2a7650',
  },
  error: {
    margin: 0,
    padding: 13,
    borderRadius: 12,
    color: '#8a2d25',
    backgroundColor: '#ffebe8',
    fontSize: 13,
  },
  submitButton: {
    padding: 15,
    borderWidth: 0,
    borderRadius: 13,
    color: '#fff',
    backgroundColor: {
      default: '#17633a',
      ':hover': '#104f2d',
      ':disabled': '#8ea697',
    },
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: 15,
  },
})
