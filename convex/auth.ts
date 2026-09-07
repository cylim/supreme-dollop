import { setupCore } from '@convex-dev/auth/core/setup'
import { setupGoogle } from '@convex-dev/auth/providers/oauth/google'
import { setupUsernamePassword } from '@convex-dev/auth/providers/password/setup'
import { components, internal } from './_generated/api'
import { env } from './_generated/server'

const core = setupCore({ component: components.auth })

export const { signOut, refreshSession, isAuthenticated } = core

export const { startSignInGoogle, completeSignInGoogle } = setupGoogle(core, {
  component: components.oauthGoogle,
  allowedRedirectOrigins: [
    'http://localhost:3000',
    ...(env.APP_URL ? [env.APP_URL] : []),
  ],
}).attachUserCallbacks({ createUser: internal.users.createUser })

export const { signUpWithPassword, signInWithPassword } = setupUsernamePassword(
  core,
  {
    component: components.authPasswordProvider,
    usernameComponent: components.authUsername,
  },
).attachUserCallbacks({
  createUser: internal.users.createUserPassword,
  onSignIn: internal.users.validatePasswordSignIn,
})
