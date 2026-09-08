export type BusyPeriod = { startAt: number; endAt: number }

export type CalendarTokens = {
  accessToken: string
  expiresInSeconds: number
  refreshToken?: string
  scope?: string
}

export type StoredCalendarConnection = {
  id: string
  encryptedAccessToken: string
  encryptedRefreshToken: string | null
  accessTokenExpiresAt: number
}

export type CalendarCipher = {
  encrypt: (value: string) => Promise<string>
  decrypt: (value: string) => Promise<string>
}

export type GoogleCalendarTransport = {
  authorizationUrl: (input: {
    clientId: string
    redirectUri: string
    state: string
  }) => string
  exchangeCode: (input: {
    code: string
    clientId: string
    clientSecret: string
    redirectUri: string
  }) => Promise<CalendarTokens>
  refresh: (input: {
    refreshToken: string
    clientId: string
    clientSecret: string
  }) => Promise<CalendarTokens>
  busyTimes: (input: {
    accessToken: string
    timeMin: number
    timeMax: number
  }) => Promise<Array<BusyPeriod>>
}

export function validateCalendarRange(timeMin: number, timeMax: number): void {
  if (
    !Number.isFinite(timeMin) ||
    !Number.isFinite(timeMax) ||
    timeMax <= timeMin ||
    timeMax - timeMin > 366 * 24 * 60 * 60 * 1_000
  ) {
    throw new Error('Calendar range must be between one minute and one year.')
  }
}

export async function connectGoogleCalendar(
  input: {
    code: string
    clientId: string
    clientSecret: string
    redirectUri: string
    now?: number
  },
  adapters: {
    transport: GoogleCalendarTransport
    cipher: CalendarCipher
    save: (tokens: {
      encryptedAccessToken: string
      encryptedRefreshToken?: string
      accessTokenExpiresAt: number
      scope: string
    }) => Promise<void>
  },
): Promise<void> {
  const tokens = await adapters.transport.exchangeCode(input)
  const encryptedAccessToken = await adapters.cipher.encrypt(tokens.accessToken)
  const encryptedRefreshToken = tokens.refreshToken
    ? await adapters.cipher.encrypt(tokens.refreshToken)
    : undefined
  await adapters.save({
    encryptedAccessToken,
    ...(encryptedRefreshToken ? { encryptedRefreshToken } : {}),
    accessTokenExpiresAt:
      (input.now ?? Date.now()) + tokens.expiresInSeconds * 1_000,
    scope: tokens.scope ?? '',
  })
}

export async function readGoogleAvailability(
  input: {
    connection: StoredCalendarConnection
    clientId: string
    clientSecret: string
    timeMin: number
    timeMax: number
    now?: number
  },
  adapters: {
    transport: GoogleCalendarTransport
    cipher: CalendarCipher
    updateAccessToken: (value: {
      connectionId: string
      encryptedAccessToken: string
      accessTokenExpiresAt: number
    }) => Promise<void>
  },
): Promise<Array<BusyPeriod>> {
  validateCalendarRange(input.timeMin, input.timeMax)
  const now = input.now ?? Date.now()
  let accessToken = await adapters.cipher.decrypt(
    input.connection.encryptedAccessToken,
  )
  if (input.connection.accessTokenExpiresAt <= now + 60_000) {
    if (input.connection.encryptedRefreshToken === null) {
      throw new Error('Reconnect Google Calendar.')
    }
    const refreshToken = await adapters.cipher.decrypt(
      input.connection.encryptedRefreshToken,
    )
    let refreshed: CalendarTokens
    try {
      refreshed = await adapters.transport.refresh({
        refreshToken,
        clientId: input.clientId,
        clientSecret: input.clientSecret,
      })
    } catch {
      throw new Error('Reconnect Google Calendar.')
    }
    accessToken = refreshed.accessToken
    const accessTokenExpiresAt = now + refreshed.expiresInSeconds * 1_000
    await adapters.updateAccessToken({
      connectionId: input.connection.id,
      encryptedAccessToken: await adapters.cipher.encrypt(accessToken),
      accessTokenExpiresAt,
    })
  }
  return await adapters.transport.busyTimes({
    accessToken,
    timeMin: input.timeMin,
    timeMax: input.timeMax,
  })
}
