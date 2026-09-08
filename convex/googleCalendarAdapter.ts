import type {
  CalendarTokens,
  GoogleCalendarTransport,
} from './calendarConnection'

type Fetcher = typeof fetch

export function createGoogleCalendarTransport(
  fetcher: Fetcher = fetch,
): GoogleCalendarTransport {
  return {
    authorizationUrl: ({ clientId, redirectUri, state }) => {
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/calendar.events.freebusy',
        access_type: 'offline',
        prompt: 'consent',
        state,
      })
      return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    },
    exchangeCode: async (input) =>
      tokenRequest(fetcher, {
        code: input.code,
        client_id: input.clientId,
        client_secret: input.clientSecret,
        redirect_uri: input.redirectUri,
        grant_type: 'authorization_code',
      }),
    refresh: async (input) =>
      tokenRequest(fetcher, {
        client_id: input.clientId,
        client_secret: input.clientSecret,
        refresh_token: input.refreshToken,
        grant_type: 'refresh_token',
      }),
    busyTimes: async ({ accessToken, timeMin, timeMax }) => {
      const response = await fetcher(
        'https://www.googleapis.com/calendar/v3/freeBusy',
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            timeMin: new Date(timeMin).toISOString(),
            timeMax: new Date(timeMax).toISOString(),
            items: [{ id: 'primary' }],
          }),
        },
      )
      if (!response.ok) {
        throw new Error('Google Calendar availability failed.')
      }
      const result = (await response.json()) as {
        calendars?: {
          primary?: { busy?: Array<{ start: string; end: string }> }
        }
      }
      return (result.calendars?.primary?.busy ?? []).map((period) => ({
        startAt: new Date(period.start).getTime(),
        endAt: new Date(period.end).getTime(),
      }))
    },
  }
}

async function tokenRequest(
  fetcher: Fetcher,
  body: Record<string, string>,
): Promise<CalendarTokens> {
  const response = await fetcher('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  if (!response.ok) throw new Error('Google Calendar token exchange failed.')
  const value = (await response.json()) as {
    access_token: string
    expires_in: number
    refresh_token?: string
    scope?: string
  }
  return {
    accessToken: value.access_token,
    expiresInSeconds: value.expires_in,
    ...(value.refresh_token ? { refreshToken: value.refresh_token } : {}),
    ...(value.scope ? { scope: value.scope } : {}),
  }
}
