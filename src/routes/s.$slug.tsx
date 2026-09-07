import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import * as stylex from '@stylexjs/stylex'
import { useAction, useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { AppShell } from '../components/AppShell'
import { AuthGate } from '../components/AuthGate'

export const Route = createFileRoute('/s/$slug')({ component: SchedulePage })

function SchedulePage() {
  return (
    <AppShell>
      <AuthGate><Schedule /></AuthGate>
    </AppShell>
  )
}

function Schedule() {
  const { slug } = Route.useParams()
  const schedule = useQuery(api.schedules.getBySlug, { slug, now: Date.now() })
  const calendar = useQuery(api.users.calendarStatus)
  const submitVote = useMutation(api.schedules.submitVote)
  const chooseFinal = useMutation(api.schedules.chooseFinal)
  const getBusyTimes = useAction(api.calendar.getBusyTimes)
  const [votes, setVotes] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<Array<{ startAt: number; endAt: number }>>([])
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [calendarLoading, setCalendarLoading] = useState(false)

  useEffect(() => {
    if (!schedule) return
    setVotes((current) => {
      const next = { ...current }
      for (const option of schedule.options) {
        if (!(option.id in next)) next[option.id] = option.myVote ?? false
      }
      return next
    })
  }, [schedule])

  const ranked = useMemo(
    () =>
      schedule
        ? [...schedule.options].sort(
            (a, b) => b.availableCount - a.availableCount || a.startAt - b.startAt,
          )
        : [],
    [schedule],
  )
  const recommendedId = schedule?.recommendedOptionId ?? undefined

  if (schedule === undefined) {
    return <main {...stylex.props(styles.center)}>Loading the schedule…</main>
  }
  if (schedule === null) {
    return <main {...stylex.props(styles.center)}>This schedule does not exist.</main>
  }

  const loadCalendar = async () => {
    if (schedule.options.length === 0) return
    setCalendarLoading(true)
    setMessage(null)
    try {
      const periods = await getBusyTimes({
        timeMin: Math.min(...schedule.options.map((option) => option.startAt)) - 60_000,
        timeMax: Math.max(...schedule.options.map((option) => option.endAt)) + 60_000,
      })
      setBusy(periods)
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Calendar lookup failed.')
    } finally {
      setCalendarLoading(false)
    }
  }

  const saveVote = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await submitVote({
        scheduleId: schedule.id,
        responses: schedule.options.map((option) => ({
          optionId: option.id,
          available: votes[option.id] ?? false,
        })),
      })
      setMessage('Your availability is saved.')
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Could not save your vote.')
    } finally {
      setSaving(false)
    }
  }

  const confirmOption = async (optionId: (typeof schedule.options)[number]['id']) => {
    setSaving(true)
    setMessage(null)
    try {
      await chooseFinal({ scheduleId: schedule.id, optionId })
      setMessage('The time is confirmed. Final notices are queued.')
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Could not confirm that time.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main {...stylex.props(styles.main)}>
      <header {...stylex.props(styles.scheduleHeader)}>
        <div>
          <div {...stylex.props(styles.badgeRow)}>
            <span {...stylex.props(styles.badge)}>{schedule.visibility}</span>
            <span {...stylex.props(styles.badge, styles.statusBadge)}>
              {schedule.status.replace('_', ' ')}
            </span>
          </div>
          <h1 {...stylex.props(styles.title)}>{schedule.title}</h1>
          {schedule.description && <p {...stylex.props(styles.description)}>{schedule.description}</p>}
          <p {...stylex.props(styles.meta)}>
            {schedule.durationMinutes} minutes · closes {formatFull(schedule.votingClosesAt)} · host timezone {schedule.timezone}
          </p>
        </div>
        <button type="button" {...stylex.props(styles.copyButton)} onClick={() => void navigator.clipboard.writeText(window.location.href)}>
          Copy link
        </button>
      </header>

      {schedule.status === 'finalized' && (
        <section {...stylex.props(styles.finalCard)}>
          <span {...stylex.props(styles.eyebrow)}>It’s decided</span>
          <h2 {...stylex.props(styles.finalTitle)}>
            {formatFull(schedule.options.find((option) => option.id === schedule.selectedOptionId)?.startAt ?? 0)}
          </h2>
          <p>The host chose this time and confirmation messages were queued.</p>
        </section>
      )}

      <div {...stylex.props(styles.layout)}>
        <section {...stylex.props(styles.optionsPanel)}>
          <div {...stylex.props(styles.panelHeading)}>
            <div>
              <span {...stylex.props(styles.eyebrow)}>
                {schedule.status === 'awaiting_confirmation' && schedule.isHost ? 'Choose the final time' : 'Your availability'}
              </span>
              <h2 {...stylex.props(styles.panelTitle)}>
                {schedule.options.length} possible times
              </h2>
            </div>
            {calendar?.connected && schedule.canVote && (
              <button type="button" {...stylex.props(styles.calendarButton)} onClick={() => void loadCalendar()} disabled={calendarLoading}>
                {calendarLoading ? 'Checking…' : 'Check conflicts'}
              </button>
            )}
          </div>

          <div {...stylex.props(styles.optionList)}>
            {ranked.map((option, index) => {
              const conflicts = busy.some((period) => option.startAt < period.endAt && option.endAt > period.startAt)
              const isSelected = schedule.selectedOptionId === option.id
              const canSelectFinal = schedule.isHost && schedule.status === 'awaiting_confirmation'
              return (
                <article key={option.id} {...stylex.props(styles.option, isSelected && styles.optionFinal, option.id === recommendedId && schedule.status === 'awaiting_confirmation' && styles.optionRecommended)}>
                  <div {...stylex.props(styles.rank)}>{index + 1}</div>
                  <div {...stylex.props(styles.optionCopy)}>
                    <strong>{formatDate(option.startAt)}</strong>
                    <span>{formatTime(option.startAt)}–{formatTime(option.endAt)}</span>
                    <div {...stylex.props(styles.tags)}>
                      <span>{option.availableCount} available</span>
                      {option.id === recommendedId && <span {...stylex.props(styles.recommended)}>Best overlap</span>}
                      {conflicts && <span {...stylex.props(styles.conflict)}>Calendar conflict</span>}
                    </div>
                  </div>
                  {schedule.canVote && (
                    <button
                      type="button"
                      aria-pressed={votes[option.id] ?? false}
                      {...stylex.props(styles.voteButton, votes[option.id] && styles.voteYes)}
                      onClick={() => setVotes((current) => ({ ...current, [option.id]: !(current[option.id] ?? false) }))}
                    >
                      {votes[option.id] ? 'Works for me' : 'Not selected'}
                    </button>
                  )}
                  {canSelectFinal && (
                    <button type="button" disabled={saving} {...stylex.props(styles.confirmButton)} onClick={() => void confirmOption(option.id)}>
                      Choose this time
                    </button>
                  )}
                </article>
              )
            })}
          </div>
          {schedule.canVote && (
            <button type="button" disabled={saving} {...stylex.props(styles.saveButton)} onClick={() => void saveVote()}>
              {saving ? 'Saving…' : 'Save my availability'}
            </button>
          )}
          {message && <p role="status" {...stylex.props(styles.message)}>{message}</p>}
        </section>

        <aside {...stylex.props(styles.side)}>
          <div {...stylex.props(styles.sideCard)}>
            <span {...stylex.props(styles.eyebrow)}>Participation</span>
            <strong {...stylex.props(styles.bigNumber)}>{schedule.participantCount}</strong>
            <span {...stylex.props(styles.smallText)}>people have voted</span>
          </div>
          {schedule.isHost && schedule.visibility === 'invited' && (
            <div {...stylex.props(styles.sideCard)}>
              <span {...stylex.props(styles.eyebrow)}>Invitations</span>
              <div {...stylex.props(styles.inviteList)}>
                {schedule.invitations.map((invitation) => (
                  <div key={invitation.email} {...stylex.props(styles.invite)}>
                    <span>{invitation.email}</span><strong>{invitation.status}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div {...stylex.props(styles.sideCard, styles.privacyCard)}>
            <strong>Calendar privacy</strong>
            <p>Conflict checks use only busy intervals. We never request event names or descriptions.</p>
          </div>
        </aside>
      </div>
    </main>
  )
}

function formatDate(value: number) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(value)
}
function formatTime(value: number) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(value)
}
function formatFull(value: number) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(value)
}

const styles = stylex.create({
  center: { minHeight: '60vh', display: 'grid', placeItems: 'center', color: '#627067' },
  main: { width: '100%', maxWidth: 1120, marginInline: 'auto', paddingInline: 24, paddingBlock: 38 },
  scheduleHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 24, paddingBottom: 32 },
  badgeRow: { display: 'flex', gap: 7 },
  badge: { paddingInline: 9, paddingBlock: 5, borderRadius: 999, color: '#24623d', backgroundColor: '#dcecdf', fontSize: 10, fontWeight: 850, letterSpacing: '0.08em', textTransform: 'uppercase' },
  statusBadge: { color: '#5a5540', backgroundColor: '#eee9d8' },
  title: { maxWidth: 760, marginTop: 15, marginBottom: 10, color: '#17231b', fontSize: { default: 48, '@media (max-width: 600px)': 36 }, letterSpacing: '-0.055em', lineHeight: 1.05 },
  description: { maxWidth: 680, color: '#536159', lineHeight: 1.6 },
  meta: { color: '#748078', fontSize: 12 },
  copyButton: { paddingInline: 14, paddingBlock: 9, borderWidth: 1, borderStyle: 'solid', borderColor: '#aeb9b0', borderRadius: 11, color: '#31513d', backgroundColor: { default: '#fffdf8', ':hover': '#fff' }, cursor: 'pointer', whiteSpace: 'nowrap' },
  finalCard: { marginBottom: 20, padding: 24, borderRadius: 18, color: '#174d2e', backgroundColor: '#dff2e4', borderWidth: 1, borderStyle: 'solid', borderColor: '#6ca57f' },
  finalTitle: { marginBlock: 8, fontSize: 27 },
  layout: { display: 'grid', gridTemplateColumns: { default: '1fr 300px', '@media (max-width: 850px)': '1fr' }, gap: 18, alignItems: 'start' },
  optionsPanel: { padding: { default: 28, '@media (max-width: 600px)': 16 }, borderRadius: 22, backgroundColor: '#fffdf8', borderWidth: 1, borderStyle: 'solid', borderColor: '#c7d0c7' },
  panelHeading: { display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 16, marginBottom: 20 },
  eyebrow: { color: '#2d724d', fontSize: 10, fontWeight: 850, letterSpacing: '0.11em', textTransform: 'uppercase' },
  panelTitle: { marginTop: 7, marginBottom: 0, color: '#203027', fontSize: 24 },
  calendarButton: { paddingInline: 12, paddingBlock: 8, borderWidth: 1, borderStyle: 'solid', borderColor: '#5b8268', borderRadius: 10, color: '#225a38', backgroundColor: '#eff8f1', cursor: 'pointer', fontSize: 12, fontWeight: 700 },
  optionList: { display: 'flex', flexDirection: 'column', gap: 9 },
  option: { padding: 14, display: 'grid', gridTemplateColumns: { default: '34px 1fr auto', '@media (max-width: 650px)': '30px 1fr' }, alignItems: 'center', gap: 12, borderWidth: 1, borderStyle: 'solid', borderColor: '#d2d8d2', borderRadius: 14, backgroundColor: '#f8f8f4' },
  optionRecommended: { borderColor: '#4b9165', backgroundColor: '#f0f8f1' },
  optionFinal: { borderColor: '#25704a', backgroundColor: '#dff2e4', boxShadow: 'inset 0 0 0 1px #25704a' },
  rank: { width: 30, height: 30, display: 'grid', placeItems: 'center', borderRadius: 9, color: '#637068', backgroundColor: '#e5e9e4', fontSize: 12, fontWeight: 800 },
  optionCopy: { display: 'flex', flexDirection: 'column', gap: 4, color: '#26342c', fontSize: 13 },
  tags: { display: 'flex', flexWrap: 'wrap', gap: 7, color: '#6a776f', fontSize: 10 },
  recommended: { color: '#1e633c', fontWeight: 800 },
  conflict: { color: '#9a3c2f', fontWeight: 800 },
  voteButton: { minWidth: 116, paddingInline: 12, paddingBlock: 9, borderWidth: 1, borderStyle: 'solid', borderColor: '#adb8af', borderRadius: 10, color: '#68756c', backgroundColor: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 750 },
  voteYes: { borderColor: '#267049', color: '#fff', backgroundColor: '#267049' },
  confirmButton: { paddingInline: 12, paddingBlock: 9, borderWidth: 0, borderRadius: 10, color: '#fff', backgroundColor: '#17633a', cursor: 'pointer', fontSize: 11, fontWeight: 750 },
  saveButton: { width: '100%', marginTop: 18, padding: 14, borderWidth: 0, borderRadius: 12, color: '#fff', backgroundColor: { default: '#17633a', ':hover': '#104f2d', ':disabled': '#90a598' }, cursor: 'pointer', fontWeight: 800 },
  message: { marginBottom: 0, padding: 12, borderRadius: 11, color: '#245b39', backgroundColor: '#e3f2e6', fontSize: 12 },
  side: { display: 'flex', flexDirection: 'column', gap: 12 },
  sideCard: { padding: 20, display: 'flex', flexDirection: 'column', borderRadius: 17, borderWidth: 1, borderStyle: 'solid', borderColor: '#c7d0c7', backgroundColor: '#fffdf8' },
  bigNumber: { marginTop: 8, color: '#1b5f38', fontSize: 44, lineHeight: 1 },
  smallText: { marginTop: 5, color: '#708078', fontSize: 11 },
  inviteList: { marginTop: 12, display: 'flex', flexDirection: 'column', gap: 7 },
  invite: { display: 'flex', justifyContent: 'space-between', gap: 8, color: '#5a685f', fontSize: 11 },
  privacyCard: { color: '#40584a', backgroundColor: '#e8f0e8', lineHeight: 1.5, fontSize: 12 },
})
