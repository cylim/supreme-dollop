import { expect } from '@playwright/test'
import type { Browser, BrowserContext, Page } from '@playwright/test'

export type Session = {
  page: Page
  close: () => Promise<void>
}

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>

const storageStates = new Map<string, Promise<StorageState>>()

async function waitForAuthOutcome(
  page: Page,
  ignoredError?: string,
): Promise<'signed-in' | 'failed'> {
  await expect
    .poll(async () => {
      if (new URL(page.url()).pathname === '/') return 'signed-in' as const
      const alert = page.getByRole('alert')
      if (
        (await alert.isVisible()) &&
        (await alert.innerText()) !== ignoredError
      ) {
        return 'failed' as const
      }
      return 'pending' as const
    })
    .not.toBe('pending')
  return new URL(page.url()).pathname === '/' ? 'signed-in' : 'failed'
}

export async function signInOrCreate(
  page: Page,
  email: string,
  password: string,
) {
  const missingAccountMessage = 'No test account exists for this email.'
  const rateLimitMessage =
    'Too many attempts. Wait briefly before trying again.'
  const maxAttempts = 6

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await page.goto('/e2e-login')
    await page.getByLabel('Test email').fill(email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()

    if ((await waitForAuthOutcome(page)) === 'signed-in') return

    const signInError = await page.getByRole('alert').innerText()
    if (signInError === rateLimitMessage) {
      if (attempt === maxAttempts) throw new Error(rateLimitMessage)
      await page.waitForTimeout(5_000)
      continue
    }
    if (signInError !== missingAccountMessage) {
      throw new Error(`Could not sign in test account: ${signInError}`)
    }

    await page.getByLabel('Password').fill(password)
    await page
      .getByRole('button', { name: 'Create test account', exact: true })
      .click()

    if (
      (await waitForAuthOutcome(page, missingAccountMessage)) === 'signed-in'
    ) {
      return
    }
    const creationError = await page.getByRole('alert').innerText()
    if (creationError === rateLimitMessage && attempt < maxAttempts) {
      await page.waitForTimeout(5_000)
      continue
    }
    throw new Error(`Could not create test account: ${creationError}`)
  }
}

export async function createSession(
  browser: Browser,
  email: string,
  password: string,
  videoDir?: string,
): Promise<Session> {
  const recordingDir = videoDir ?? process.env.E2E_RECORD_ALL_DIR
  let storageState = storageStates.get(email)
  if (storageState === undefined) {
    storageState = (async () => {
      const authContext = await browser.newContext()
      try {
        const authPage = await authContext.newPage()
        await signInOrCreate(authPage, email, password)
        return await authContext.storageState()
      } finally {
        await authContext.close()
      }
    })()
    storageStates.set(email, storageState)
    storageState.catch(() => storageStates.delete(email))
  }

  const context = await browser.newContext({
    storageState: await storageState,
    recordVideo: recordingDir
      ? { dir: recordingDir, size: { width: 1280, height: 720 } }
      : undefined,
  })
  const page = await context.newPage()
  await page.goto('/')
  await expect(page.getByRole('button', { name: /Sign out/ })).toBeVisible()
  return {
    page,
    close: async () => {
      const latestStorageState = await context.storageState()
      storageStates.set(email, Promise.resolve(latestStorageState))
      await context.close()
    },
  }
}
