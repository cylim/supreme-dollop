import { v } from 'convex/values'
import { action, env, httpAction } from './_generated/server'
import { internal } from './_generated/api'
import {
  connectGoogleCalendar,
  readGoogleAvailability,
} from './calendarConnection'
import { createCalendarCipher } from './calendarTokenCipher'
import { createGoogleCalendarTransport } from './googleCalendarAdapter'
import type { Id } from './_generated/dataModel'

const busyPeriod = v.object({ startAt: v.number(), endAt: v.number() })
const google = createGoogleCalendarTransport()

function appUrl(): string {
  if (!env.APP_URL) throw new Error('APP_URL is not configured.')
  return env.APP_URL.replace(/\/$/, '')
}

function googleConfiguration() {
  const clientId = env.AUTH_GOOGLE_CLIENT_ID
  const clientSecret = env.AUTH_GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Google Calendar is not configured.')
  return {
    clientId,
    clientSecret,
    redirectUri: `${env.CONVEX_SITE_URL}/calendar/callback`,
  }
}

export const startConnect = action({
  args: { returnPath: v.optional(v.string()) },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new Error('You must be signed in.')
    const configuration = googleConfiguration()
    const state = crypto.randomUUID()
    const safePath = args.returnPath?.startsWith('/') ? args.returnPath : '/'
    await ctx.runMutation(internal.calendarModel.createOauthState, {
      userSubject: identity.subject,
      state,
      expiresAt: Date.now() + 10 * 60_000,
      redirectTo: `${appUrl()}${safePath}`,
    })
    return google.authorizationUrl({
      clientId: configuration.clientId,
      redirectUri: configuration.redirectUri,
      state,
    })
  },
})

export const callback = httpAction(async (ctx, request) => {
  const url = new URL(request.url)
  const stateValue = url.searchParams.get('state')
  const code = url.searchParams.get('code')
  if (!stateValue || !code || url.searchParams.has('error')) {
    return Response.redirect(`${appUrl()}/?calendar=error`, 302)
  }
  const state = await ctx.runMutation(internal.calendarModel.consumeOauthState, {
    state: stateValue,
  })
  if (state === null) {
    return Response.redirect(`${appUrl()}/?calendar=expired`, 302)
  }
  try {
    const configuration = googleConfiguration()
    await connectGoogleCalendar(
      { code, ...configuration },
      {
        transport: google,
        cipher: createCalendarCipher(env.CALENDAR_TOKEN_ENCRYPTION_KEY),
        save: async (tokens) => {
          await ctx.runMutation(internal.calendarModel.saveConnection, {
            userId: state.userId,
            ...tokens,
          })
        },
      },
    )
  } catch (error) {
    console.error('Google Calendar connection failed', error)
    return Response.redirect(`${state.redirectTo}?calendar=error`, 302)
  }
  const separator = state.redirectTo.includes('?') ? '&' : '?'
  return Response.redirect(`${state.redirectTo}${separator}calendar=connected`, 302)
})

export const getBusyTimes = action({
  args: { timeMin: v.number(), timeMax: v.number() },
  returns: v.array(busyPeriod),
  handler: async (ctx, args): Promise<Array<{ startAt: number; endAt: number }>> => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new Error('You must be signed in.')
    const connection: {
      id: Id<'calendarConnections'>
      encryptedAccessToken: string
      encryptedRefreshToken: string | null
      accessTokenExpiresAt: number
    } | null = await ctx.runQuery(internal.calendarModel.getConnection, {
      userSubject: identity.subject,
    })
    if (connection === null) throw new Error('Connect Google Calendar first.')
    const configuration = googleConfiguration()
    return await readGoogleAvailability(
      { connection, ...configuration, ...args },
      {
        transport: google,
        cipher: createCalendarCipher(env.CALENDAR_TOKEN_ENCRYPTION_KEY),
        updateAccessToken: async (value) => {
          await ctx.runMutation(internal.calendarModel.updateAccessToken, {
            connectionId: value.connectionId as typeof connection.id,
            encryptedAccessToken: value.encryptedAccessToken,
            accessTokenExpiresAt: value.accessTokenExpiresAt,
          })
        },
      },
    )
  },
})
