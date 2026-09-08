import { describe, expect, it, vi } from 'vitest'
import { readGoogleAvailability } from '../convex/calendarConnection'
import type {
  CalendarCipher,
  GoogleCalendarTransport,
} from '../convex/calendarConnection'

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
})
