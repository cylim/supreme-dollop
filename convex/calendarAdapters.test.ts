import { describe, expect, it, vi } from 'vitest'
import { createCalendarCipher } from './calendarTokenCipher'
import { createGoogleCalendarTransport } from './googleCalendarAdapter'

function response(body: unknown, ok = true): Response {
  return new Response(JSON.stringify(body), { status: ok ? 200 : 400 })
}

describe('calendar token cipher', () => {
  const key = btoa(
    String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i)),
  )

  it('round trips a token with a random authenticated nonce', async () => {
    const cipher = createCalendarCipher(key)
    const first = await cipher.encrypt('secret-token')
    const second = await cipher.encrypt('secret-token')
    expect(first).not.toBe(second)
    expect(await cipher.decrypt(first)).toBe('secret-token')
  })

  it('rejects missing, malformed, and incorrectly sized keys and tokens', async () => {
    await expect(
      createCalendarCipher(undefined).encrypt('token'),
    ).rejects.toThrow(/not configured/i)
    await expect(
      createCalendarCipher(btoa('short')).encrypt('token'),
    ).rejects.toThrow(/32 bytes/i)
    await expect(createCalendarCipher(key).decrypt('invalid')).rejects.toThrow(
      /stored calendar token is invalid/i,
    )
    await expect(createCalendarCipher(key).decrypt('bad.bad')).rejects.toThrow()
  })
})

describe('Google Calendar transport', () => {
  it('builds the least-privilege authorization URL', () => {
    const transport = createGoogleCalendarTransport(vi.fn())
    const url = new URL(
      transport.authorizationUrl({
        clientId: 'client id',
        redirectUri: 'https://app.example/callback',
        state: 'state-value',
      }),
    )
    expect(url.origin).toBe('https://accounts.google.com')
    expect(url.searchParams.get('scope')).toBe(
      'https://www.googleapis.com/auth/calendar.events.freebusy',
    )
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('state')).toBe('state-value')
  })

  it('exchanges and refreshes tokens with form-encoded requests', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          access_token: 'access',
          expires_in: 3600,
          refresh_token: 'refresh',
          scope: 'freebusy',
        }),
      )
      .mockResolvedValueOnce(
        response({ access_token: 'fresh', expires_in: 1800 }),
      )
    const transport = createGoogleCalendarTransport(fetcher)

    expect(
      await transport.exchangeCode({
        code: 'code',
        clientId: 'client',
        clientSecret: 'secret',
        redirectUri: 'https://app.example/callback',
      }),
    ).toEqual({
      accessToken: 'access',
      expiresInSeconds: 3600,
      refreshToken: 'refresh',
      scope: 'freebusy',
    })
    expect(
      await transport.refresh({
        refreshToken: 'refresh',
        clientId: 'client',
        clientSecret: 'secret',
      }),
    ).toEqual({ accessToken: 'fresh', expiresInSeconds: 1800 })
    expect(String(fetcher.mock.calls[0][1].body)).toContain(
      'grant_type=authorization_code',
    )
    expect(String(fetcher.mock.calls[1][1].body)).toContain(
      'grant_type=refresh_token',
    )
  })

  it('maps free/busy periods and handles empty and failed responses', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          calendars: {
            primary: {
              busy: [
                {
                  start: '2026-09-10T00:00:00.000Z',
                  end: '2026-09-10T01:00:00.000Z',
                },
              ],
            },
          },
        }),
      )
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(response({}, false))
    const transport = createGoogleCalendarTransport(fetcher)
    const input = { accessToken: 'access', timeMin: 0, timeMax: 3_600_000 }

    expect(await transport.busyTimes(input)).toEqual([
      {
        startAt: Date.parse('2026-09-10T00:00:00.000Z'),
        endAt: Date.parse('2026-09-10T01:00:00.000Z'),
      },
    ])
    expect(await transport.busyTimes(input)).toEqual([])
    await expect(transport.busyTimes(input)).rejects.toThrow(
      /availability failed/i,
    )
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      headers: { authorization: 'Bearer access' },
    })
  })

  it('rejects failed token responses', async () => {
    const transport = createGoogleCalendarTransport(
      vi.fn().mockResolvedValue(response({}, false)),
    )
    await expect(
      transport.refresh({
        refreshToken: 'refresh',
        clientId: 'client',
        clientSecret: 'secret',
      }),
    ).rejects.toThrow(/token exchange failed/i)
  })
})
