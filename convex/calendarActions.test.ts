/// <reference types="vite/client" />

import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from './_generated/api'
import { handleCalendarCallback, readCalendarBusyTimes } from './calendar'
import schema from './schema'
import type { TestConvex } from 'convex-test'
import type { Id } from './_generated/dataModel'
import type { ActionCtx } from './_generated/server'
import type { CalendarRuntime } from './calendar'

const modules = import.meta.glob('./**/*.ts')
const now = Date.UTC(2026, 8, 8, 12)
const encryptionKey = btoa('k'.repeat(32))
type TestBackend = TestConvex<typeof schema>

async function insertUser(t: TestBackend): Promise<Id<'users'>> {
  return await t.run(async (ctx) =>
    ctx.db.insert('users', {
      providerAccountId: 'calendar-user',
      email: 'calendar@example.com',
    }),
  )
}

function asUser(t: TestBackend, userId: Id<'users'>) {
  return t.withIdentity({
    subject: userId,
    tokenIdentifier: `test|${userId}`,
    email: 'calendar@example.com',
  })
}

function configureCalendar() {
  vi.stubEnv('APP_URL', 'https://app.example/')
  vi.stubEnv('AUTH_GOOGLE_CLIENT_ID', 'client')
  vi.stubEnv('AUTH_GOOGLE_CLIENT_SECRET', 'secret')
  vi.stubEnv('CONVEX_SITE_URL', 'https://site.example')
  vi.stubEnv('CALENDAR_TOKEN_ENCRYPTION_KEY', encryptionKey)
}

function fakeRuntime(
  overrides: Partial<CalendarRuntime> = {},
): CalendarRuntime {
  return {
    appUrl: () => 'https://app.example',
    configuration: () => ({
      clientId: 'client',
      clientSecret: 'secret',
      redirectUri: 'https://site.example/calendar/callback',
    }),
    transport: {
      authorizationUrl: () => 'https://accounts.google.com/',
      exchangeCode: () =>
        Promise.resolve({
          accessToken: 'access',
          refreshToken: 'refresh',
          expiresInSeconds: 3600,
          scope: 'freebusy',
        }),
      refresh: vi.fn(),
      busyTimes: () => Promise.resolve([{ startAt: now + 1, endAt: now + 2 }]),
    },
    cipher: () => ({
      encrypt: (value) => Promise.resolve(`encrypted:${value}`),
      decrypt: (value) => Promise.resolve(value.replace('encrypted:', '')),
    }),
    now: () => now,
    randomUUID: () => 'state',
    ...overrides,
  }
}

describe('calendar actions and callback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('requires authentication before starting or reading a connection', async () => {
    const t = convexTest(schema, modules)
    await expect(t.action(api.calendar.startConnect, {})).rejects.toThrow(
      /signed in/i,
    )
    await expect(
      t.action(api.calendar.getBusyTimes, {
        timeMin: now,
        timeMax: now + 60_000,
      }),
    ).rejects.toThrow(/signed in/i)
  })

  it('validates configuration and requires a saved connection', async () => {
    const t = convexTest(schema, modules)
    const userId = await insertUser(t)
    const user = asUser(t, userId)
    await expect(user.action(api.calendar.startConnect, {})).rejects.toThrow(
      /not configured/i,
    )

    configureCalendar()
    await expect(
      user.action(api.calendar.getBusyTimes, {
        timeMin: now,
        timeMax: now + 60_000,
      }),
    ).rejects.toThrow(/Connect Google Calendar first/i)
  })

  it('creates OAuth state with sanitized return paths', async () => {
    configureCalendar()
    const t = convexTest(schema, modules)
    const userId = await insertUser(t)
    const user = asUser(t, userId)

    const authorizationUrl = new URL(
      await user.action(api.calendar.startConnect, {
        returnPath: '/settings?tab=calendar',
      }),
    )
    expect(authorizationUrl.searchParams.get('client_id')).toBe('client')
    const state = authorizationUrl.searchParams.get('state')!
    expect(
      await t.run(async (ctx) =>
        ctx.db
          .query('calendarOauthStates')
          .withIndex('by_state', (query) => query.eq('state', state))
          .unique(),
      ),
    ).toMatchObject({
      userId,
      expiresAt: now + 10 * 60_000,
      redirectTo: 'https://app.example/settings?tab=calendar',
    })

    const unsafe = new URL(
      await user.action(api.calendar.startConnect, {
        returnPath: 'https://evil.example/',
      }),
    )
    const unsafeState = unsafe.searchParams.get('state')!
    expect(
      await t.run(async (ctx) =>
        ctx.db
          .query('calendarOauthStates')
          .withIndex('by_state', (query) => query.eq('state', unsafeState))
          .unique(),
      ),
    ).toMatchObject({ redirectTo: 'https://app.example/' })
  })

  it('reads busy periods with a current encrypted token', async () => {
    const runMutation = vi.fn(() => Promise.resolve(null))
    const context = {
      auth: { getUserIdentity: () => Promise.resolve({ subject: 'user' }) },
      runQuery: vi
        .fn()
        .mockResolvedValueOnce('user')
        .mockResolvedValueOnce({
          id: 'connection',
          encryptedAccessToken: 'encrypted:access',
          encryptedRefreshToken: 'encrypted:refresh',
          accessTokenExpiresAt: now + 120_000,
        }),
      runMutation,
    } as unknown as ActionCtx
    expect(
      await readCalendarBusyTimes(
        context,
        {
          timeMin: now,
          timeMax: now + 60_000,
        },
        fakeRuntime(),
      ),
    ).toEqual([{ startAt: now + 1, endAt: now + 2 }])
    expect(runMutation).not.toHaveBeenCalled()
  })

  it('persists a refreshed access token before reading busy periods', async () => {
    const runMutation = vi.fn(() => Promise.resolve(null))
    const runtime = fakeRuntime()
    vi.mocked(runtime.transport.refresh).mockResolvedValue({
      accessToken: 'fresh',
      expiresInSeconds: 3600,
    })
    const context = {
      auth: { getUserIdentity: () => Promise.resolve({ subject: 'user' }) },
      runQuery: vi.fn().mockResolvedValueOnce('user').mockResolvedValueOnce({
        id: 'connection',
        encryptedAccessToken: 'encrypted:access',
        encryptedRefreshToken: 'encrypted:refresh',
        accessTokenExpiresAt: now,
      }),
      runMutation,
    } as unknown as ActionCtx
    await readCalendarBusyTimes(
      context,
      {
        timeMin: now,
        timeMax: now + 60_000,
      },
      runtime,
    )
    expect(runMutation).toHaveBeenCalledWith(
      internal.calendarModel.updateAccessToken,
      expect.objectContaining({ encryptedAccessToken: 'encrypted:fresh' }),
    )
  })

  it('redirects malformed and expired callbacks without connecting', async () => {
    configureCalendar()
    const t = convexTest(schema, modules)
    const malformed = await t.fetch('/calendar/callback?error=denied')
    expect(malformed.status).toBe(302)
    expect(malformed.headers.get('location')).toBe(
      'https://app.example/?calendar=error',
    )
    const expired = await t.fetch('/calendar/callback?state=missing&code=code')
    expect(expired.status).toBe(302)
    expect(expired.headers.get('location')).toBe(
      'https://app.example/?calendar=expired',
    )
  })

  it('exchanges callback tokens, persists them, and preserves query strings', async () => {
    const runMutation = vi
      .fn()
      .mockResolvedValueOnce({
        userId: 'user',
        redirectTo: 'https://app.example/settings?tab=calendar',
      })
      .mockResolvedValueOnce(null)
    const result = await handleCalendarCallback(
      { runMutation },
      new Request(
        'https://site.example/calendar/callback?state=valid-state&code=code',
      ),
      fakeRuntime(),
    )
    expect(result.status).toBe(302)
    expect(result.headers.get('location')).toBe(
      'https://app.example/settings?tab=calendar&calendar=connected',
    )
    expect(runMutation).toHaveBeenLastCalledWith(
      internal.calendarModel.saveConnection,
      expect.objectContaining({
        userId: 'user',
        encryptedAccessToken: 'encrypted:access',
      }),
    )
  })

  it('redirects callback provider failures to the saved return path', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const runMutation = vi.fn().mockResolvedValue({
      userId: 'user',
      redirectTo: 'https://app.example/settings',
    })
    const runtime = fakeRuntime()
    runtime.transport.exchangeCode = vi
      .fn()
      .mockRejectedValue(new Error('failed'))
    const result = await handleCalendarCallback(
      { runMutation },
      new Request(
        'https://site.example/calendar/callback?state=provider-failure&code=code',
      ),
      runtime,
    )
    expect(result.headers.get('location')).toBe(
      'https://app.example/settings?calendar=error',
    )
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
