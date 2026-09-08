import { Link, createFileRoute } from '@tanstack/react-router'
import * as stylex from '@stylexjs/stylex'
import { useAction, useConvexAuth, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { AppShell } from '../components/AppShell'
import { SignInAction } from '../components/AuthGate'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const { isAuthenticated } = useConvexAuth()
  return <AppShell>{isAuthenticated ? <Dashboard /> : <Landing />}</AppShell>
}

function Landing() {
  return (
    <main {...stylex.props(styles.main)}>
      <section {...stylex.props(styles.hero)}>
        <div {...stylex.props(styles.heroCopy)}>
          <span {...stylex.props(styles.kicker)}>
            Scheduling without the chase
          </span>
          <h1 {...stylex.props(styles.heroTitle)}>
            Find the time.
            <br />
            <span {...stylex.props(styles.heroAccent)}>Make the call.</span>
          </h1>
          <p {...stylex.props(styles.heroText)}>
            Offer exact times or a broad window. Everyone votes once, JRNY Plan
            ranks the overlap, and the host makes the final call.
          </p>
          <div id="get-started" {...stylex.props(styles.landingAction)}>
            <SignInAction label="Start scheduling with Google" />
            <span {...stylex.props(styles.actionNote)}>
              Calendar connection is optional. Your vote is not.
            </span>
          </div>
        </div>
        <OverlapCard />
      </section>

      <section id="how-it-works" {...stylex.props(styles.grid)}>
        <article {...stylex.props(styles.panel, styles.calendarPanel)}>
          <span {...stylex.props(styles.panelLabel)}>Calendar assist</span>
          <h2 {...stylex.props(styles.panelTitle)}>
            Bring only your busy times
          </h2>
          <p {...stylex.props(styles.panelText)}>
            Connect Google Calendar when you want help spotting conflicts. We
            never request event titles or descriptions.
          </p>
          <span {...stylex.props(styles.privacyPill)}>
            Free/busy access only
          </span>
        </article>

        <article {...stylex.props(styles.panel, styles.schedulesPanel)}>
          <span {...stylex.props(styles.panelLabel)}>How it works</span>
          <h2 {...stylex.props(styles.panelTitle)}>
            One link. One clear answer.
          </h2>
          <div {...stylex.props(styles.steps)}>
            <LandingStep
              number="01"
              copy="Propose exact starts or generate choices from a rough window."
            />
            <LandingStep
              number="02"
              copy="Invite specific people or open voting to anyone with the link."
            />
            <LandingStep
              number="03"
              copy="Review the best overlap and choose before confirmations go out."
            />
          </div>
        </article>
      </section>

      <section {...stylex.props(styles.closingCta)}>
        <div {...stylex.props(styles.closingCopy)}>
          <span {...stylex.props(styles.panelLabel)}>Ready when you are</span>
          <h2 {...stylex.props(styles.closingTitle)}>
            Turn everyone’s availability into one clear plan.
          </h2>
          <p {...stylex.props(styles.closingText)}>
            Create a schedule in minutes, share one link, and make the final
            call with confidence.
          </p>
        </div>
        <div {...stylex.props(styles.closingAction)}>
          <SignInAction label="Create your first schedule" />
        </div>
      </section>
    </main>
  )
}

function Dashboard() {
  const viewer = useQuery(api.users.viewer)
  const schedules = useQuery(api.schedules.listMine)
  const calendar = useQuery(api.users.calendarStatus)
  const startCalendarConnect = useAction(api.calendar.startConnect)

  const connectCalendar = async () => {
    const url = await startCalendarConnect({ returnPath: '/' })
    window.location.assign(url)
  }

  return (
    <main {...stylex.props(styles.main)}>
      <section {...stylex.props(styles.hero)}>
        <div {...stylex.props(styles.heroCopy)}>
          <span {...stylex.props(styles.kicker)}>
            Scheduling without the chase
          </span>
          <h1 {...stylex.props(styles.heroTitle)}>
            Find the time.
            <br />
            <span {...stylex.props(styles.heroAccent)}>Make the call.</span>
          </h1>
          <p {...stylex.props(styles.heroText)}>
            Offer exact times or a broad window. Everyone votes once, JRNY Plan
            ranks the overlap, and you choose the final plan.
          </p>
          <div {...stylex.props(styles.heroActions)}>
            <Link to="/new" {...stylex.props(styles.primaryLink)}>
              Create a schedule
            </Link>
            <span {...stylex.props(styles.signedIn)}>
              Signed in as {viewer?.email ?? '…'}
            </span>
          </div>
        </div>
        <OverlapCard />
      </section>

      <section {...stylex.props(styles.grid)}>
        <article {...stylex.props(styles.panel, styles.calendarPanel)}>
          <span {...stylex.props(styles.panelLabel)}>Calendar assist</span>
          <h2 {...stylex.props(styles.panelTitle)}>
            {calendar?.connected
              ? 'Google Calendar connected'
              : 'Bring your busy times'}
          </h2>
          <p {...stylex.props(styles.panelText)}>
            We only request free/busy access. Event titles and details never
            enter JRNY Plan.
          </p>
          {!calendar?.connected ? (
            <button
              type="button"
              {...stylex.props(styles.secondaryButton)}
              onClick={() => void connectCalendar()}
            >
              Connect Google Calendar
            </button>
          ) : (
            <span {...stylex.props(styles.connected)}>Connected</span>
          )}
        </article>

        <article {...stylex.props(styles.panel, styles.schedulesPanel)}>
          <div {...stylex.props(styles.panelHeader)}>
            <div>
              <span {...stylex.props(styles.panelLabel)}>Your schedules</span>
              <h2 {...stylex.props(styles.panelTitle)}>In motion</h2>
            </div>
            <Link to="/new" {...stylex.props(styles.smallLink)}>
              New
            </Link>
          </div>
          {schedules === undefined && <p>Loading schedules…</p>}
          {schedules?.length === 0 && (
            <div {...stylex.props(styles.empty)}>
              <span>No schedules yet.</span>
              <Link to="/new">Create the first one</Link>
            </div>
          )}
          <div {...stylex.props(styles.scheduleList)}>
            {schedules?.map((schedule) => (
              <Link
                key={schedule.id}
                to="/s/$slug"
                params={{ slug: schedule.slug }}
                {...stylex.props(styles.scheduleItem)}
              >
                <div {...stylex.props(styles.scheduleCopy)}>
                  <strong>{schedule.title}</strong>
                  <span>
                    Closes{' '}
                    {new Intl.DateTimeFormat(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    }).format(schedule.votingClosesAt)}
                  </span>
                </div>
                <span {...stylex.props(styles.status)}>
                  {schedule.status.replace('_', ' ')}
                </span>
              </Link>
            ))}
          </div>
        </article>
      </section>
    </main>
  )
}

function OverlapCard() {
  return (
    <div {...stylex.props(styles.scoreCard)} aria-hidden="true">
      <div {...stylex.props(styles.scoreTop)}>
        <span>Design review</span>
        <span {...stylex.props(styles.liveDot)}>Live</span>
      </div>
      <DemoDate label="Thu, 10 Sep" time="2:00–3:00 PM" score="8" winner />
      <DemoDate label="Fri, 11 Sep" time="10:30–11:30 AM" score="6" />
      <DemoDate label="Mon, 14 Sep" time="4:00–5:00 PM" score="4" />
      <div {...stylex.props(styles.recommendation)}>
        Best overlap found. Host confirmation needed.
      </div>
    </div>
  )
}

function LandingStep({ number, copy }: { number: string; copy: string }) {
  return (
    <div {...stylex.props(styles.step)}>
      <span {...stylex.props(styles.stepNumber)}>{number}</span>
      <p>{copy}</p>
    </div>
  )
}

function DemoDate({
  label,
  time,
  score,
  winner = false,
}: {
  label: string
  time: string
  score: string
  winner?: boolean
}) {
  return (
    <div {...stylex.props(styles.dateRow, winner && styles.dateWinner)}>
      <div {...stylex.props(styles.scheduleCopy)}>
        <strong>{label}</strong>
        <span>{time}</span>
      </div>
      <span {...stylex.props(winner ? styles.score : styles.scoreMuted)}>
        {score}
      </span>
    </div>
  )
}

const styles = stylex.create({
  main: {
    width: '100%',
    maxWidth: 1180,
    marginInline: 'auto',
    paddingInline: 24,
    paddingBottom: 48,
  },
  hero: {
    minHeight: 510,
    paddingBlock: 48,
    display: 'grid',
    alignItems: 'center',
    gap: 72,
    gridTemplateColumns: {
      default: '1.1fr 0.9fr',
      '@media (max-width: 800px)': '1fr',
    },
  },
  heroCopy: { maxWidth: 650 },
  kicker: {
    color: '#267049',
    fontSize: 12,
    fontWeight: 850,
    letterSpacing: '0.13em',
    textTransform: 'uppercase',
  },
  heroTitle: {
    marginTop: 18,
    marginBottom: 22,
    color: '#18231c',
    lineHeight: 0.98,
    fontSize: { default: 72, '@media (max-width: 600px)': 52 },
    letterSpacing: '-0.065em',
    fontWeight: 800,
  },
  heroAccent: { color: '#267049' },
  heroText: {
    maxWidth: 560,
    margin: 0,
    color: '#536158',
    fontSize: 18,
    lineHeight: 1.65,
  },
  heroActions: {
    marginTop: 32,
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 18,
  },
  landingAction: { width: '100%', maxWidth: 330, marginTop: 32 },
  actionNote: {
    display: 'block',
    marginTop: 10,
    color: '#78827b',
    fontSize: 11,
    textAlign: 'center',
  },
  primaryLink: {
    paddingInline: 20,
    paddingBlock: 13,
    borderRadius: 13,
    color: '#fff',
    backgroundColor: { default: '#17633a', ':hover': '#104f2d' },
    textDecoration: 'none',
    fontWeight: 750,
    boxShadow: '0 10px 24px rgba(23, 99, 58, 0.22)',
  },
  signedIn: { color: '#78827b', fontSize: 12 },
  scoreCard: {
    padding: 22,
    borderRadius: 25,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#bac7bc',
    backgroundColor: '#fffdf8',
    boxShadow: '0 30px 80px rgba(38, 58, 44, 0.14)',
    transform: {
      default: 'rotate(1.5deg)',
      '@media (max-width: 800px)': 'none',
    },
  },
  scoreTop: {
    display: 'flex',
    justifyContent: 'space-between',
    paddingInline: 4,
    paddingBottom: 18,
    color: '#29372e',
    fontWeight: 750,
  },
  liveDot: {
    paddingInline: 9,
    paddingBlock: 4,
    borderRadius: 999,
    color: '#1d663b',
    backgroundColor: '#dff5e6',
    fontSize: 11,
  },
  dateRow: {
    marginTop: 9,
    padding: 15,
    borderRadius: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#d3d9d3',
    color: '#2b372f',
  },
  dateWinner: { borderColor: '#3d8b5c', backgroundColor: '#edf9f0' },
  score: {
    width: 33,
    height: 33,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 10,
    color: '#fff',
    backgroundColor: '#267049',
    fontWeight: 800,
  },
  scoreMuted: {
    width: 33,
    height: 33,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 10,
    color: '#637069',
    backgroundColor: '#edf0ed',
    fontWeight: 800,
  },
  recommendation: {
    marginTop: 15,
    padding: 12,
    borderRadius: 12,
    color: '#346047',
    backgroundColor: '#e7f2e9',
    fontSize: 12,
    textAlign: 'center',
    fontWeight: 650,
  },
  grid: {
    display: 'grid',
    gap: 18,
    gridTemplateColumns: {
      default: '0.8fr 1.2fr',
      '@media (max-width: 760px)': '1fr',
    },
  },
  closingCta: {
    marginTop: 18,
    padding: { default: 34, '@media (max-width: 600px)': 24 },
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 28,
    flexWrap: 'wrap',
    borderRadius: 24,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#b9cabd',
    backgroundColor: '#edf5ee',
  },
  closingCopy: { maxWidth: 630 },
  closingTitle: {
    marginTop: 8,
    marginBottom: 8,
    color: '#18231c',
    fontSize: { default: 32, '@media (max-width: 600px)': 27 },
    lineHeight: 1.12,
    letterSpacing: '-0.04em',
  },
  closingText: {
    maxWidth: 560,
    margin: 0,
    color: '#526158',
    fontSize: 14,
    lineHeight: 1.6,
  },
  closingAction: {
    width: '100%',
    maxWidth: 280,
    marginTop: -26,
  },
  panel: {
    padding: 26,
    borderRadius: 22,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#c8d1c8',
  },
  calendarPanel: { backgroundColor: '#e5f0e8' },
  schedulesPanel: { backgroundColor: '#fffdf8' },
  panelLabel: {
    color: '#50705b',
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
  panelTitle: { marginTop: 8, marginBottom: 8, color: '#1c2920', fontSize: 23 },
  panelText: { color: '#526158', lineHeight: 1.55, fontSize: 14 },
  privacyPill: {
    display: 'inline-block',
    marginTop: 12,
    paddingInline: 11,
    paddingBlock: 6,
    borderRadius: 999,
    color: '#15532e',
    backgroundColor: '#c9efd5',
    fontSize: 11,
    fontWeight: 750,
  },
  steps: { marginTop: 20, display: 'flex', flexDirection: 'column' },
  step: {
    paddingBlock: 13,
    display: 'grid',
    gridTemplateColumns: '42px 1fr',
    alignItems: 'start',
    gap: 12,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: '#dde2dc',
    color: '#526158',
    fontSize: 13,
    lineHeight: 1.5,
  },
  stepNumber: {
    color: '#28704a',
    fontSize: 11,
    fontWeight: 850,
    letterSpacing: '0.08em',
  },
  secondaryButton: {
    marginTop: 12,
    paddingInline: 15,
    paddingBlock: 10,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#407454',
    borderRadius: 11,
    color: '#1d5735',
    backgroundColor: { default: '#f8fffa', ':hover': '#fff' },
    cursor: 'pointer',
    fontWeight: 700,
  },
  connected: {
    display: 'inline-block',
    marginTop: 12,
    paddingInline: 11,
    paddingBlock: 6,
    borderRadius: 999,
    color: '#15532e',
    backgroundColor: '#c9efd5',
    fontSize: 12,
    fontWeight: 750,
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'start',
  },
  smallLink: {
    color: '#1c6038',
    fontSize: 13,
    fontWeight: 750,
    textDecoration: 'none',
  },
  empty: {
    paddingBlock: 25,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    color: '#66736a',
    fontSize: 14,
  },
  scheduleList: { display: 'flex', flexDirection: 'column', gap: 8 },
  scheduleItem: {
    paddingBlock: 13,
    paddingInline: 14,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 14,
    borderRadius: 12,
    color: '#25352b',
    backgroundColor: { default: '#f1f3ef', ':hover': '#e7eee8' },
    textDecoration: 'none',
  },
  scheduleCopy: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: 13,
  },
  status: {
    color: '#3f6450',
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
})
