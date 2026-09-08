import { expect, test } from '@playwright/test'
import type { Browser, BrowserContext, Page } from '@playwright/test'

const hostEmail = process.env.E2E_HOST_EMAIL!
const hostPassword = process.env.E2E_HOST_PASSWORD!
const guestEmail = process.env.E2E_GUEST_EMAIL!
const guestPassword = process.env.E2E_GUEST_PASSWORD!

type Session = { context: BrowserContext; page: Page }

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

async function signInOrCreate(page: Page, email: string, password: string) {
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

async function createSession(
  browser: Browser,
  email: string,
  password: string,
): Promise<Session> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await signInOrCreate(page, email, password)
  return { context, page }
}

test.describe('multi-user decisions', () => {
  test('a public decision shows initials on the selected option', async ({
    browser,
  }) => {
    const sessions: Array<Session> = []
    try {
      const host = await createSession(browser, hostEmail, hostPassword)
      const guest = await createSession(browser, guestEmail, guestPassword)
      sessions.push(host, guest)

      const title = `Public decision ${Date.now()}`
      await host.page.goto('/new/decision')
      await host.page.getByLabel('Title').fill(title)
      await host.page.getByLabel('Option 1').fill('Beach')
      await host.page.getByLabel('Option 2').fill('Park')
      await host.page.getByRole('button', { name: 'Open the decision' }).click()
      await host.page.waitForURL((url) => url.pathname.startsWith('/d/'))
      const decisionUrl = host.page.url()

      await guest.page.goto(decisionUrl)
      await guest.page.getByRole('button', { name: 'Select' }).first().click()
      await expect(
        guest.page.locator('article').filter({ hasText: 'Beach' }).getByText('E'),
      ).toBeVisible()

      await host.page.reload()
      await expect(
        host.page.locator('article').filter({ hasText: 'Beach' }).getByText('E'),
      ).toBeVisible()
    } finally {
      await Promise.all(sessions.map(({ context }) => context.close()))
    }
  })
})
