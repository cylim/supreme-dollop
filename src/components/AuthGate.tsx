import * as stylex from '@stylexjs/stylex'
import { useConvexAuth } from 'convex/react'
import {
  useOauth,
  useSignInWithGoogle,
} from '@convex-dev/auth/providers/oauth/react'
import { api } from '../../convex/_generated/api'
import type { OauthFlowErrorCode } from '@convex-dev/auth/providers/oauth/react'
import type { ReactNode } from 'react'

const errorCopy: Record<OauthFlowErrorCode, string> = {
  access_denied: 'Sign-in was cancelled.',
  expired: 'That sign-in took too long. Please try again.',
  rejected: 'Google declined the sign-in request.',
  oauth_error: 'Google sign-in failed. Please try again.',
  invalid_flow: 'This sign-in cannot be completed here. Please try again.',
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth()

  if (isLoading) {
    return <div {...stylex.props(styles.loading)}>Checking your session…</div>
  }
  if (isAuthenticated) return children

  return (
    <section {...stylex.props(styles.wrap)}>
      <div {...stylex.props(styles.card)}>
        <span {...stylex.props(styles.eyebrow)}>One account, one vote</span>
        <h1 {...stylex.props(styles.title)}>Sign in to take part</h1>
        <p {...stylex.props(styles.copy)}>
          Every schedule uses a verified Google account. Your calendar stays
          disconnected unless you choose to connect it separately.
        </p>
        <SignInAction />
      </div>
    </section>
  )
}

export function SignInAction({
  label = 'Continue with Google',
}: {
  label?: string
}) {
  const { signInGoogle } = useSignInWithGoogle(api.auth)
  const { flowError } = useOauth()

  return (
    <>
      {flowError !== null && (
        <p role="alert" {...stylex.props(styles.error)}>
          {flowError.message ?? errorCopy[flowError.code]}
        </p>
      )}
      <button
        type="button"
        {...stylex.props(styles.googleButton)}
        onClick={() => void signInGoogle().catch(() => {})}
      >
        <span {...stylex.props(styles.googleMark)}>G</span>
        {label}
      </button>
    </>
  )
}

const styles = stylex.create({
  loading: {
    minHeight: '55vh',
    display: 'grid',
    placeItems: 'center',
    color: '#5b685f',
  },
  wrap: {
    minHeight: '65vh',
    padding: 24,
    display: 'grid',
    placeItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 480,
    padding: 40,
    borderRadius: 28,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#c8d1c8',
    backgroundColor: '#fffdf8',
    boxShadow: '0 24px 70px rgba(39, 54, 43, 0.11)',
  },
  eyebrow: {
    color: '#257147',
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 12,
    marginBottom: 12,
    color: '#18231c',
    fontSize: 36,
    lineHeight: 1.05,
    letterSpacing: '-0.045em',
  },
  copy: {
    margin: 0,
    color: '#59675e',
    lineHeight: 1.65,
  },
  error: {
    color: '#8c281f',
    backgroundColor: '#fff0ed',
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
  },
  googleButton: {
    width: '100%',
    marginTop: 26,
    borderWidth: 0,
    borderRadius: 14,
    padding: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    color: '#ffffff',
    backgroundColor: {
      default: '#1a5c36',
      ':hover': '#104c2a',
    },
    cursor: 'pointer',
    fontWeight: 750,
  },
  googleMark: {
    width: 22,
    height: 22,
    borderRadius: 7,
    display: 'grid',
    placeItems: 'center',
    color: '#1a5c36',
    backgroundColor: '#ffffff',
    fontSize: 12,
    fontWeight: 900,
  },
})
