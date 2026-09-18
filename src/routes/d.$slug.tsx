import { createFileRoute } from '@tanstack/react-router'
import * as stylex from '@stylexjs/stylex'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { AppShell } from '../components/AppShell'
import { AuthGate } from '../components/AuthGate'
import { DecisionPanel } from '../components/DecisionPanel'

export const Route = createFileRoute('/d/$slug')({ component: DecisionPage })

function DecisionPage() {
  return (
    <AppShell>
      <AuthGate>
        <Decision />
      </AuthGate>
    </AppShell>
  )
}

function Decision() {
  const { slug } = Route.useParams()
  const decision = useQuery(api.decisions.getBySlug, { slug })

  if (decision === undefined) {
    return <main {...stylex.props(styles.center)}>Loading the decision…</main>
  }
  if (decision === null) {
    return (
      <main {...stylex.props(styles.center)}>
        This decision does not exist.
      </main>
    )
  }

  return (
    <main {...stylex.props(styles.main)}>
      <header {...stylex.props(styles.header)}>
        <div>
          <div {...stylex.props(styles.badgeRow)}>
            <span {...stylex.props(styles.badge)}>
              {decision.visibility ?? 'attached'}
            </span>
            <span {...stylex.props(styles.badge, styles.statusBadge)}>
              {decision.status}
            </span>
          </div>
          <h1 {...stylex.props(styles.title)}>{decision.title}</h1>
          {decision.description && (
            <p {...stylex.props(styles.description)}>{decision.description}</p>
          )}
          <p {...stylex.props(styles.meta)}>
            {decision.selectMode === 'single'
              ? 'Single select'
              : 'Multi select'}
            {decision.closesAt
              ? ` · closes ${new Intl.DateTimeFormat(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                }).format(decision.closesAt)}`
              : ''}
          </p>
        </div>
        <button
          type="button"
          {...stylex.props(styles.copyButton)}
          onClick={() =>
            void navigator.clipboard.writeText(window.location.href)
          }
        >
          Copy link
        </button>
      </header>
      <DecisionPanel decision={decision} />
    </main>
  )
}

const styles = stylex.create({
  center: {
    minHeight: '60vh',
    display: 'grid',
    placeItems: 'center',
    color: '#627067',
  },
  main: {
    width: '100%',
    maxWidth: 880,
    marginInline: 'auto',
    paddingInline: 24,
    paddingBlock: 38,
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'start',
    gap: 24,
  },
  badgeRow: { display: 'flex', gap: 7 },
  badge: {
    paddingInline: 9,
    paddingBlock: 5,
    borderRadius: 999,
    color: '#24623d',
    backgroundColor: '#dcecdf',
    fontSize: 10,
    fontWeight: 850,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  statusBadge: { color: '#5a5540', backgroundColor: '#eee9d8' },
  title: {
    maxWidth: 760,
    marginTop: 15,
    marginBottom: 10,
    color: '#17231b',
    fontSize: { default: 48, '@media (max-width: 600px)': 36 },
    letterSpacing: '-0.055em',
    lineHeight: 1.05,
  },
  description: { maxWidth: 680, color: '#536159', lineHeight: 1.6 },
  meta: { color: '#536159', fontSize: 12 },
  copyButton: {
    paddingInline: 14,
    paddingBlock: 9,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#aeb9b0',
    borderRadius: 11,
    color: '#31513d',
    backgroundColor: { default: '#fffdf8', ':hover': '#fff' },
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
})
