import { Link } from '@tanstack/react-router'
import * as stylex from '@stylexjs/stylex'
import { useConvexAuth, useQuery } from 'convex/react'
import { useAuthActions } from '@convex-dev/auth/react'
import { api } from '../../convex/_generated/api'
import type { ReactNode } from 'react'

export function AppShell({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth()
  const viewer = useQuery(api.users.viewer, isAuthenticated ? {} : 'skip')
  const { signOut } = useAuthActions()

  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <Link to="/" {...stylex.props(styles.brand)}>
          <img
            src="/jrny-plan-mark.png"
            alt=""
            width="34"
            height="34"
            {...stylex.props(styles.mark)}
          />
          <span>JRNY Plan</span>
        </Link>
        <nav {...stylex.props(styles.nav)} aria-label="Primary navigation">
          {isAuthenticated && (
            <>
              <Link to="/new" {...stylex.props(styles.navLink)}>
                New schedule
              </Link>
              <Link to="/new/decision" {...stylex.props(styles.navLink)}>
                New decision
              </Link>
              <button
                type="button"
                {...stylex.props(styles.ghostButton)}
                onClick={() => void signOut()}
              >
                Sign out{viewer?.name ? `, ${viewer.name.split(' ')[0]}` : ''}
              </button>
            </>
          )}
        </nav>
      </header>
      {children}
      <footer {...stylex.props(styles.footer)}>
        <span>Find common ground, then make the call.</span>
        <span>Realtime scheduling with Convex</span>
      </footer>
    </div>
  )
}

const styles = stylex.create({
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#f7f5ef',
  },
  header: {
    width: '100%',
    maxWidth: 1180,
    marginInline: 'auto',
    paddingInline: 24,
    paddingBlock: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  brand: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    color: '#2f1b4e',
    textDecoration: 'none',
    fontSize: 17,
    fontWeight: 760,
    letterSpacing: '-0.02em',
  },
  mark: {
    width: 34,
    height: 34,
    display: 'block',
    objectFit: 'contain',
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  navLink: {
    color: '#214c34',
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 700,
    paddingInline: 14,
    paddingBlock: 9,
    borderRadius: 999,
    backgroundColor: {
      default: 'transparent',
      ':hover': '#e4ede5',
    },
  },
  ghostButton: {
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#aebbb1',
    borderRadius: 999,
    color: '#2c3e32',
    backgroundColor: {
      default: 'rgba(255,255,255,0.5)',
      ':hover': '#ffffff',
    },
    paddingInline: 14,
    paddingBlock: 8,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 650,
  },
  footer: {
    width: '100%',
    maxWidth: 1180,
    marginInline: 'auto',
    marginTop: 'auto',
    paddingInline: 24,
    paddingBlock: 32,
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
    color: '#657269',
    fontSize: 12,
  },
})
