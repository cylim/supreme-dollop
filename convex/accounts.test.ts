/// <reference types="vite/client" />

import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from './_generated/api'
import schema from './schema'
import type { TestConvex } from 'convex-test'
import type { Id } from './_generated/dataModel'

const modules = import.meta.glob('./**/*.ts')
type TestBackend = TestConvex<typeof schema>

afterEach(() => vi.unstubAllEnvs())

async function insertUser(t: TestBackend, email = 'person@example.test') {
  return await t.run(async (ctx) =>
    ctx.db.insert('users', {
      providerAccountId: `google:${email}`,
      email,
      name: 'Test Person',
      picture: 'https://example.test/person.png',
    }),
  )
}

function asUser(
  t: TestBackend,
  userId: Id<'users'>,
  email = 'person@example.test',
) {
  return t.withIdentity({
    subject: userId,
    tokenIdentifier: `https://test.invalid|${userId}`,
    email,
  })
}

describe('account queries', () => {
  it('returns null for anonymous and unknown identities', async () => {
    const t = convexTest(schema, modules)
    expect(await t.query(api.users.viewer, {})).toBeNull()
    expect(
      await t
        .withIdentity({ subject: 'unknown', tokenIdentifier: 'test|unknown' })
        .query(api.users.viewer, {}),
    ).toBeNull()

    const deletedId = await insertUser(t, 'deleted@example.test')
    await t.run(async (ctx) => ctx.db.delete('users', deletedId))
    expect(
      await asUser(t, deletedId, 'deleted@example.test').query(
        api.users.viewer,
        {},
      ),
    ).toBeNull()
  })

  it('creates and updates users only from verified Google profiles', async () => {
    const t = convexTest(schema, modules)
    await expect(
      t.mutation(internal.users.createUser, {
        provider: 'google',
        providerAccountId: 'google-1',
        profile: { id: 'google-1', emailVerified: true },
      }),
    ).rejects.toThrow(/verified Google email/i)
    await expect(
      t.mutation(internal.users.createUser, {
        provider: 'google',
        providerAccountId: 'google-1',
        profile: {
          id: 'google-1',
          email: 'person@example.com',
          emailVerified: false,
        },
      }),
    ).rejects.toThrow(/verified Google email/i)

    const userId = await t.mutation(internal.users.createUser, {
      provider: 'google',
      providerAccountId: 'google-1',
      profile: {
        id: 'google-1',
        email: 'PERSON@EXAMPLE.COM',
        emailVerified: true,
        name: 'First Name',
      },
    })
    expect(
      await t.run(async (ctx) => ctx.db.get('users', userId)),
    ).toMatchObject({ email: 'person@example.com', name: 'First Name' })
    expect(
      await t.mutation(internal.users.createUser, {
        provider: 'google',
        providerAccountId: 'google-1',
        profile: {
          id: 'google-1',
          email: 'updated@example.com',
          emailVerified: true,
          picture: 'https://example.com/picture.png',
        },
      }),
    ).toBe(userId)
    expect(
      await t.run(async (ctx) => ctx.db.get('users', userId)),
    ).toMatchObject({
      email: 'updated@example.com',
      picture: 'https://example.com/picture.png',
    })
  })

  it('restricts password accounts to explicitly enabled test identities', async () => {
    vi.stubEnv('E2E_PASSWORD_AUTH_ENABLED', 'true')
    vi.stubEnv('E2E_TEST_EMAILS', 'allowed@example.test, second@example.test')
    const t = convexTest(schema, modules)
    const userId = await t.mutation(internal.users.createUserPassword, {
      provider: 'password',
      providerAccountId: 'ignored',
      profile: { username: ' Allowed@Example.Test ' },
    })
    expect(
      await t.run(async (ctx) => ctx.db.get('users', userId)),
    ).toMatchObject({
      email: 'allowed@example.test',
      providerAccountId: 'password:allowed@example.test',
    })
    await expect(
      t.mutation(internal.users.validatePasswordSignIn, {
        provider: 'password',
        providerAccountId: 'ignored',
        profile: { username: 'allowed@example.test' },
        userId,
      }),
    ).resolves.toBeNull()
    await expect(
      t.mutation(internal.users.createUserPassword, {
        provider: 'password',
        providerAccountId: 'ignored',
        profile: { username: 'outsider@example.test' },
      }),
    ).rejects.toThrow(/not available/i)
  })

  it('returns the current viewer and calendar connection status', async () => {
    const t = convexTest(schema, modules)
    const userId = await insertUser(t)
    const user = asUser(t, userId)
    await expect(
      t.query(internal.calendarModel.getCurrentUserId, {}),
    ).rejects.toThrow(/signed in/i)
    expect(await user.query(internal.calendarModel.getCurrentUserId, {})).toBe(
      userId,
    )

    await expect(t.query(api.users.calendarStatus, {})).rejects.toThrow(
      /signed in/i,
    )
    expect(await user.query(api.users.viewer, {})).toEqual({
      id: userId,
      email: 'person@example.test',
      name: 'Test Person',
      picture: 'https://example.test/person.png',
    })
    expect(await user.query(api.users.calendarStatus, {})).toEqual({
      connected: false,
    })

    await t.run(async (ctx) => {
      await ctx.db.insert('calendarConnections', {
        userId,
        encryptedAccessToken: 'ciphertext',
        accessTokenExpiresAt: Date.now() + 60_000,
        scope: 'calendar.readonly',
        connectedAt: Date.now(),
      })
    })
    expect(await user.query(api.users.calendarStatus, {})).toEqual({
      connected: true,
    })
  })
})

describe('calendar connection persistence', () => {
  it('creates, replaces, reads, and disconnects a connection', async () => {
    const t = convexTest(schema, modules)
    const userId = await insertUser(t)
    const user = asUser(t, userId)

    await t.mutation(internal.calendarModel.saveConnection, {
      userId,
      encryptedAccessToken: 'access-1',
      encryptedRefreshToken: 'refresh-1',
      accessTokenExpiresAt: 100,
      scope: 'one',
    })
    const first = await t.query(internal.calendarModel.getConnection, {
      userId,
    })
    expect(first).toMatchObject({
      encryptedAccessToken: 'access-1',
      encryptedRefreshToken: 'refresh-1',
      accessTokenExpiresAt: 100,
    })

    await t.mutation(internal.calendarModel.saveConnection, {
      userId,
      encryptedAccessToken: 'access-2',
      accessTokenExpiresAt: 200,
      scope: 'two',
    })
    const rows = await t.run(async (ctx) =>
      ctx.db.query('calendarConnections').collect(),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ encryptedAccessToken: 'access-2' })

    await t.mutation(internal.calendarModel.updateAccessToken, {
      connectionId: rows[0]._id,
      encryptedAccessToken: 'access-3',
      accessTokenExpiresAt: 300,
    })
    expect(
      await t.query(internal.calendarModel.getConnection, {
        userId,
      }),
    ).toMatchObject({
      encryptedAccessToken: 'access-3',
      accessTokenExpiresAt: 300,
    })

    await expect(t.mutation(api.calendarModel.disconnect, {})).rejects.toThrow(
      /signed in/i,
    )
    await user.mutation(api.calendarModel.disconnect, {})
    await user.mutation(api.calendarModel.disconnect, {})
    await expect(
      t.mutation(internal.calendarModel.updateAccessToken, {
        connectionId: rows[0]._id,
        encryptedAccessToken: 'missing',
        accessTokenExpiresAt: 400,
      }),
    ).resolves.toBeNull()
    expect(await user.query(api.users.calendarStatus, {})).toEqual({
      connected: false,
    })
  })

  it('consumes OAuth state once and rejects expired or unknown accounts', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    try {
      const t = convexTest(schema, modules)
      const userId = await insertUser(t)
      const missingUserId = await insertUser(t, 'missing@example.test')
      await t.run(async (ctx) => ctx.db.delete('users', missingUserId))

      await expect(
        t.mutation(internal.calendarModel.createOauthState, {
          userId: missingUserId,
          state: 'bad',
          expiresAt: 2_000,
          redirectTo: '/',
        }),
      ).rejects.toThrow(/account not found/i)

      await t.mutation(internal.calendarModel.createOauthState, {
        userId,
        state: 'valid',
        expiresAt: 2_000,
        redirectTo: '/dashboard',
      })
      expect(
        await t.mutation(internal.calendarModel.consumeOauthState, {
          state: 'valid',
        }),
      ).toEqual({ userId, redirectTo: '/dashboard' })
      expect(
        await t.mutation(internal.calendarModel.consumeOauthState, {
          state: 'valid',
        }),
      ).toBeNull()

      await t.mutation(internal.calendarModel.createOauthState, {
        userId,
        state: 'expired',
        expiresAt: 999,
        redirectTo: '/',
      })
      expect(
        await t.mutation(internal.calendarModel.consumeOauthState, {
          state: 'expired',
        }),
      ).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
