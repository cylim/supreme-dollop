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
import type { ActionCtx } from './_generated/server'
import type {
  CalendarCipher,
  GoogleCalendarTransport,
} from './calendarConnection'

const busyPeriod = v.object({ startAt: v.number(), endAt: v.number() })
export type CalendarRuntime = {
  appUrl: () => string
  configuration: () => {
    clientId: string
    clientSecret: string
    redirectUri: string
  }
  transport: GoogleCalendarTransport
  cipher: () => CalendarCipher
  now: () => number
  randomUUID: () => string
}

function appUrl(): string {
  if (!env.APP_URL) throw new Error('APP_URL is not configured.')
  return env.APP_URL.replace(/\/$/, '')
}

function googleConfiguration() {
  const clientId = env.AUTH_GOOGLE_CLIENT_ID
  const clientSecret = env.AUTH_GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret)
    throw new Error('Google Calendar is not configured.')
  return {
    clientId,
    clientSecret,
    redirectUri: `${env.CONVEX_SITE_URL}/calendar/callback`,
  }
}

const runtime: CalendarRuntime = {
  appUrl,
  configuration: googleConfiguration,
  transport: createGoogleCalendarTransport(),
  cipher: () => createCalendarCipher(env.CALENDAR_TOKEN_ENCRYPTION_KEY),
  now: () => Date.now(),
  randomUUID: () => crypto.randomUUID(),
}

export async function startCalendarConnect(
  ctx: ActionCtx,
  args: { returnPath?: string },
  dependencies: CalendarRuntime = runtime,
): Promise<string> {
  const userId: Id<'users'> = await ctx.runQuery(
    internal.calendarModel.getCurrentUserId,
    {},
  )
  const configuration = dependencies.configuration()
  const state = dependencies.randomUUID()
  const safePath = args.returnPath?.startsWith('/') ? args.returnPath : '/'
  await ctx.runMutation(internal.calendarModel.createOauthState, {
    userId,
    state,
    expiresAt: dependencies.now() + 10 * 60_000,
    redirectTo: `${dependencies.appUrl()}${safePath}`,
  })
  return dependencies.transport.authorizationUrl({
    clientId: configuration.clientId,
    redirectUri: configuration.redirectUri,
    state,
  })
}

export const startConnect = action({
  args: { returnPath: v.optional(v.string()) },
  returns: v.string(),
  handler: startCalendarConnect,
})

export async function handleCalendarCallback(
  ctx: Pick<ActionCtx, 'runMutation'>,
  request: Request,
  dependencies: CalendarRuntime = runtime,
) {
  const url = new URL(request.url)
  const stateValue = url.searchParams.get('state')
  const code = url.searchParams.get('code')
  if (!stateValue || !code || url.searchParams.has('error')) {
    return Response.redirect(`${dependencies.appUrl()}/?calendar=error`, 302)
  }
  const state = await ctx.runMutation(
    internal.calendarModel.consumeOauthState,
    {
      state: stateValue,
    },
  )
  if (state === null) {
    return Response.redirect(`${dependencies.appUrl()}/?calendar=expired`, 302)
  }
  try {
    const configuration = dependencies.configuration()
    await connectGoogleCalendar(
      { code, ...configuration },
      {
        transport: dependencies.transport,
        cipher: dependencies.cipher(),
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
  return Response.redirect(
    `${state.redirectTo}${separator}calendar=connected`,
    302,
  )
}

export const callback = httpAction((ctx, request) =>
  handleCalendarCallback(ctx, request),
)

export async function readCalendarBusyTimes(
  ctx: ActionCtx,
  args: { timeMin: number; timeMax: number },
  dependencies: CalendarRuntime = runtime,
): Promise<Array<{ startAt: number; endAt: number }>> {
  const userId: Id<'users'> = await ctx.runQuery(
    internal.calendarModel.getCurrentUserId,
    {},
  )
  const connection: {
    id: Id<'calendarConnections'>
    encryptedAccessToken: string
    encryptedRefreshToken: string | null
    accessTokenExpiresAt: number
  } | null = await ctx.runQuery(internal.calendarModel.getConnection, {
    userId,
  })
  if (connection === null) throw new Error('Connect Google Calendar first.')
  const configuration = dependencies.configuration()
  return await readGoogleAvailability(
    { connection, ...configuration, ...args, now: dependencies.now() },
    {
      transport: dependencies.transport,
      cipher: dependencies.cipher(),
      updateAccessToken: async (value) => {
        await ctx.runMutation(internal.calendarModel.updateAccessToken, {
          connectionId: value.connectionId as typeof connection.id,
          encryptedAccessToken: value.encryptedAccessToken,
          accessTokenExpiresAt: value.accessTokenExpiresAt,
        })
      },
    },
  )
}

export const getBusyTimes = action({
  args: { timeMin: v.number(), timeMax: v.number() },
  returns: v.array(busyPeriod),
  handler: readCalendarBusyTimes,
})
