import { expect } from '@playwright/test'
import type { Browser, BrowserContext, Page } from '@playwright/test'

export type Session = { context: BrowserContext; page: Page }

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
  await page.goto('/e2e-login')
  await page.getByLabel('Test email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()

  if ((await waitForAuthOutcome(page)) === 'signed-in') return

  const missingAccountMessage = 'No test account exists for this email.'
  await expect(page.getByRole('alert')).toHaveText(missingAccountMessage)
  await page.getByLabel('Password').fill(password)
  await page
    .getByRole('button', { name: 'Create test account', exact: true })
    .click()

  if ((await waitForAuthOutcome(page, missingAccountMessage)) === 'failed') {
    throw new Error(
      `Could not create test account: ${await page.getByRole('alert').innerText()}`,
    )
  }
}

export async function createSession(
  browser: Browser,
  email: string,
  password: string,
  videoDir?: string,
): Promise<Session> {
  if (videoDir) {
    const authContext = await browser.newContext()
    const authPage = await authContext.newPage()
    await signInOrCreate(authPage, email, password)
    const storageState = await authContext.storageState()
    await authContext.close()

    const context = await browser.newContext({
      storageState,
      recordVideo: {
        dir: videoDir,
        size: { width: 1280, height: 720 },
      },
    })
    const page = await context.newPage()
    await page.goto('/')
    await expect(page.getByRole('button', { name: /Sign out/ })).toBeVisible()
    return { context, page }
  }

  const context = await browser.newContext()
  const page = await context.newPage()
  await signInOrCreate(page, email, password)
  return { context, page }
}
