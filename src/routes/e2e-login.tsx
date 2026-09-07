import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import * as stylex from '@stylexjs/stylex'
import { useConvexAuth } from 'convex/react'
import {
  useSignInWithPassword,
  useSignUpWithPassword,
} from '@convex-dev/auth/providers/password/react'
import { api } from '../../convex/_generated/api'
import { AppShell } from '../components/AppShell'
import type { FormEvent } from 'react'

type AuthUserError = {
  error: string
  minimumLength?: number
  maximumLength?: number
  retryAfterMs?: number
}

function authErrorMessage(error: AuthUserError): string {
  switch (error.error) {
    case 'USER_NOT_FOUND':
      return 'No test account exists for this email.'
    case 'USERNAME_TAKEN':
      return 'A test account already exists for this email.'
    case 'INVALID_CREDENTIALS':
      return 'The test password is incorrect.'
    case 'PASSWORD_TOO_SHORT':
      return `The password must contain at least ${error.minimumLength ?? 10} characters.`
    case 'PASSWORD_TOO_LONG':
      return `The password must contain at most ${error.maximumLength ?? 100} characters.`
    case 'PASSWORD_HAS_SURROUNDING_WHITESPACE':
      return 'The password cannot start or end with whitespace.'
    case 'PASSWORD_TOO_COMMON':
      return 'Choose a less common test password.'
    case 'USERNAME_HAS_SURROUNDING_WHITESPACE':
    case 'USERNAME_HAS_INVALID_CHARACTERS':
    case 'USERNAME_TOO_SHORT':
      return 'Enter a valid test email.'
    case 'RATE_LIMITED':
      return 'Too many attempts. Wait briefly before trying again.'
    default:
      return 'Test sign-in is disabled or this identity is not allowlisted.'
  }
}

export const Route = createFileRoute('/e2e-login')({
  component: E2eLoginPage,
})

function E2eLoginPage() {
  const navigate = useNavigate()
  const { isAuthenticated } = useConvexAuth()
  const { signIn, pending: signInPending } = useSignInWithPassword(
    api.auth.signInWithPassword,
  )
  const { signUp, pending: signUpPending } = useSignUpWithPassword(
    api.auth.signUpWithPassword,
  )
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const pending = signInPending || signUpPending

  const credentials = () => ({
    username: email.trim().toLowerCase(),
    password,
  })

  const finish = async (result: {
    success: boolean
    userError?: AuthUserError
  }) => {
    if (result.success) {
      await navigate({ to: '/' })
      return
    }
    setError(
      result.userError
        ? authErrorMessage(result.userError)
        : 'Test sign-in failed.',
    )
  }

  const handleSignIn = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    const submitted = credentials()
    setPassword('')
    const result = await signIn(submitted)
    await finish(result)
  }

  const handleSignUp = async () => {
    setError(null)
    const submitted = credentials()
    setPassword('')
    const result = await signUp(submitted)
    await finish(result)
  }

  return (
    <AppShell>
      <main {...stylex.props(styles.main)}>
        <section {...stylex.props(styles.card)}>
          <span {...stylex.props(styles.eyebrow)}>Automated testing</span>
          <h1 {...stylex.props(styles.title)}>Test account access</h1>
          <p {...stylex.props(styles.copy)}>
            This route works only for identities explicitly enabled on a test
            deployment.
          </p>
          {isAuthenticated ? (
            <button
              type="button"
              {...stylex.props(styles.primaryButton)}
              onClick={() => void navigate({ to: '/' })}
            >
              Continue to the app
            </button>
          ) : (
            <form onSubmit={(event) => void handleSignIn(event)}>
              <label {...stylex.props(styles.label)}>
                Test email
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  {...stylex.props(styles.input)}
                />
              </label>
              <label {...stylex.props(styles.label)}>
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  {...stylex.props(styles.input)}
                />
              </label>
              {error !== null && (
                <p role="alert" {...stylex.props(styles.error)}>
                  {error}
                </p>
              )}
              <div {...stylex.props(styles.actions)}>
                <button
                  type="submit"
                  disabled={pending}
                  {...stylex.props(styles.primaryButton)}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void handleSignUp()}
                  {...stylex.props(styles.secondaryButton)}
                >
                  Create test account
                </button>
              </div>
            </form>
          )}
        </section>
      </main>
    </AppShell>
  )
}

const styles = stylex.create({
  main: {
    flex: 1,
    display: 'grid',
    placeItems: 'center',
    padding: 24,
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
    marginTop: 0,
    marginBottom: 24,
    color: '#59675e',
    lineHeight: 1.65,
  },
  label: {
    display: 'grid',
    gap: 8,
    marginTop: 16,
    color: '#2b3c31',
    fontSize: 14,
    fontWeight: 700,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#aebbb1',
    borderRadius: 12,
    padding: 13,
    color: '#18231c',
    backgroundColor: '#ffffff',
    fontSize: 16,
  },
  error: {
    marginTop: 16,
    color: '#8c281f',
    backgroundColor: '#fff0ed',
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
  },
  actions: {
    display: 'grid',
    gap: 10,
    marginTop: 24,
  },
  primaryButton: {
    width: '100%',
    borderWidth: 0,
    borderRadius: 14,
    padding: 14,
    color: '#ffffff',
    backgroundColor: {
      default: '#1a5c36',
      ':hover': '#104c2a',
      ':disabled': '#82998a',
    },
    cursor: 'pointer',
    fontWeight: 750,
  },
  secondaryButton: {
    width: '100%',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#aebbb1',
    borderRadius: 14,
    padding: 13,
    color: '#214c34',
    backgroundColor: {
      default: '#ffffff',
      ':hover': '#eef4ef',
      ':disabled': '#eef1ee',
    },
    cursor: 'pointer',
    fontWeight: 750,
  },
})
