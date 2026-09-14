import { describe, expect, it, vi } from 'vitest'
import {
  connectGoogleCalendar,
  readGoogleAvailability,
  validateCalendarRange,
} from './calendarConnection'
import type {
  CalendarCipher,
  GoogleCalendarTransport,
} from './calendarConnection'

const now = Date.UTC(2026, 8, 8, 0)
const cipher: CalendarCipher = {
  encrypt: (value) => Promise.resolve(`encrypted:${value}`),
  decrypt: (value) => Promise.resolve(value.replace('encrypted:', '')),
}

function transport(): GoogleCalendarTransport {
  return {
    authorizationUrl: () => 'https://accounts.google.com/',
    exchangeCode: vi.fn(),
    refresh: vi.fn(() =>
      Promise.resolve({ accessToken: 'fresh', expiresInSeconds: 3600 }),
    ),
    busyTimes: vi.fn(() =>
      Promise.resolve([{ startAt: now + 1, endAt: now + 2 }]),
    ),
  }
}

describe('Google Calendar connection', () => {
  it('validates bounded forward-looking ranges', () => {
    expect(() => validateCalendarRange(0, 60_000)).not.toThrow()
    for (const [start, end] of [
      [Number.NaN, 1],
      [0, Number.POSITIVE_INFINITY],
      [1, 1],
      [2, 1],
      [0, 367 * 24 * 60 * 60 * 1_000],
    ]) {
      expect(() => validateCalendarRange(start, end)).toThrow(
        /between one minute and one year/i,
      )
    }
  })

  it('exchanges, encrypts, and persists connected calendar tokens', async () => {
    const google = transport()
    vi.mocked(google.exchangeCode).mockResolvedValue({
      accessToken: 'access',
      expiresInSeconds: 3600,
      refreshToken: 'refresh',
      scope: 'freebusy',
    })
    const save = vi.fn(() => Promise.resolve())
    await connectGoogleCalendar(
      {
        code: 'code',
        clientId: 'client',
        clientSecret: 'secret',
        redirectUri: 'https://app.example/callback',
        now,
      },
      { transport: google, cipher, save },
    )
    expect(save).toHaveBeenCalledWith({
      encryptedAccessToken: 'encrypted:access',
      encryptedRefreshToken: 'encrypted:refresh',
      accessTokenExpiresAt: now + 3_600_000,
      scope: 'freebusy',
    })
  })

  it('persists a token without optional refresh token or scope', async () => {
    const google = transport()
    vi.mocked(google.exchangeCode).mockResolvedValue({
      accessToken: 'access',
      expiresInSeconds: 60,
    })
    const save = vi.fn(() => Promise.resolve())
    await connectGoogleCalendar(
      {
        code: 'code',
        clientId: 'client',
        clientSecret: 'secret',
        redirectUri: 'https://app.example/callback',
        now,
      },
      { transport: google, cipher, save },
    )
    expect(save).toHaveBeenCalledWith({
      encryptedAccessToken: 'encrypted:access',
      accessTokenExpiresAt: now + 60_000,
      scope: '',
    })
  })

  it('refreshes an expiring token before reading availability', async () => {
    const google = transport()
    const updateAccessToken = vi.fn(() => Promise.resolve())
    const result = await readGoogleAvailability(
      {
        connection: {
          id: 'connection-1',
          encryptedAccessToken: 'encrypted:stale',
          encryptedRefreshToken: 'encrypted:refresh',
          accessTokenExpiresAt: now,
        },
        clientId: 'client',
        clientSecret: 'secret',
        timeMin: now,
        timeMax: now + 3_600_000,
        now,
      },
      { transport: google, cipher, updateAccessToken },
    )
    expect(result).toEqual([{ startAt: now + 1, endAt: now + 2 }])
    expect(google.refresh).toHaveBeenCalledWith({
      refreshToken: 'refresh',
      clientId: 'client',
      clientSecret: 'secret',
    })
    expect(google.busyTimes).toHaveBeenCalledWith({
      accessToken: 'fresh',
      timeMin: now,
      timeMax: now + 3_600_000,
    })
    expect(updateAccessToken).toHaveBeenCalledWith({
      connectionId: 'connection-1',
      encryptedAccessToken: 'encrypted:fresh',
      accessTokenExpiresAt: now + 3_600_000,
    })
  })

  it('requires reconnection when an expired connection has no refresh token', async () => {
    await expect(
      readGoogleAvailability(
        {
          connection: {
            id: 'connection-1',
            encryptedAccessToken: 'encrypted:stale',
            encryptedRefreshToken: null,
            accessTokenExpiresAt: now,
          },
          clientId: 'client',
          clientSecret: 'secret',
          timeMin: now,
          timeMax: now + 3_600_000,
          now,
        },
        { transport: transport(), cipher, updateAccessToken: vi.fn() },
      ),
    ).rejects.toThrow(/Reconnect Google Calendar/)
  })

  it('uses an unexpired access token without refreshing', async () => {
    const google = transport()
    await readGoogleAvailability(
      {
        connection: {
          id: 'connection-1',
          encryptedAccessToken: 'encrypted:current',
          encryptedRefreshToken: 'encrypted:refresh',
          accessTokenExpiresAt: now + 120_000,
        },
        clientId: 'client',
        clientSecret: 'secret',
        timeMin: now,
        timeMax: now + 3_600_000,
        now,
      },
      { transport: google, cipher, updateAccessToken: vi.fn() },
    )
    expect(google.refresh).not.toHaveBeenCalled()
    expect(google.busyTimes).toHaveBeenCalledWith({
      accessToken: 'current',
      timeMin: now,
      timeMax: now + 3_600_000,
    })
  })

  it('requires reconnection when token refresh fails', async () => {
    const google = transport()
    vi.mocked(google.refresh).mockRejectedValue(new Error('revoked'))
    await expect(
      readGoogleAvailability(
        {
          connection: {
            id: 'connection-1',
            encryptedAccessToken: 'encrypted:stale',
            encryptedRefreshToken: 'encrypted:refresh',
            accessTokenExpiresAt: now,
          },
          clientId: 'client',
          clientSecret: 'secret',
          timeMin: now,
          timeMax: now + 3_600_000,
          now,
        },
        { transport: google, cipher, updateAccessToken: vi.fn() },
      ),
    ).rejects.toThrow(/Reconnect Google Calendar/)
  })
})
