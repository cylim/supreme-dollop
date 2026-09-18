import { expect, test } from '@playwright/test'
import { createSession } from './auth'
import type { Page } from '@playwright/test'
import type { Session } from './auth'

const hostEmail = process.env.E2E_HOST_EMAIL!
const hostPassword = process.env.E2E_HOST_PASSWORD!
const guestEmail = process.env.E2E_GUEST_EMAIL!
const guestPassword = process.env.E2E_GUEST_PASSWORD!
const guestTwoEmail =
  process.env.E2E_GUEST_TWO_EMAIL ?? 'guest-two@example.test'

function localDateTime(hoursAhead: number): string {
  const date = new Date(Date.now() + hoursAhead * 60 * 60 * 1_000)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

async function createSchedule(
  page: Page,
  title: string,
  visibility: 'public' | 'invited',
  inviteEmails: Array<string> = [],
): Promise<string> {
  await page.goto('/new')
  await page.getByLabel('Event title').fill(title)
  await page.getByLabel('Voting closes').fill(localDateTime(2))

  const exactTime = page
    .getByRole('tabpanel', { name: 'Exact time' })
    .locator('input[type="datetime-local"]')
  for (const hoursAhead of [24, 48, 72]) {
    await exactTime.fill(localDateTime(hoursAhead))
    await page.getByRole('button', { name: 'Add exact time' }).click()
  }

  if (visibility === 'invited') {
    await page.getByRole('button', { name: /Invite only/ }).click()
    await page.getByLabel('Guest emails').fill(inviteEmails.join('\n'))
  }
  await page.getByRole('button', { name: 'Open voting' }).click()
  await page.waitForURL((url) => url.pathname.startsWith('/s/'))
  return page.url()
}

async function vote(
  page: Page,
  scheduleUrl: string,
  optionIndexes: Array<number>,
) {
  await page.goto(scheduleUrl)
  const options = page
    .locator('article')
    .filter({ has: page.locator('button[aria-pressed]') })
  await expect(options).toHaveCount(3)
  for (const index of optionIndexes) {
    await options
      .nth(index)
      .getByRole('button', { name: 'Not selected' })
      .click()
  }
  await page.getByRole('button', { name: 'Save my availability' }).click()
  await expect(page.getByRole('status')).toContainText('saved')
}

test.describe('multi-user scheduling', () => {
  test('two invited guests vote and the host confirms the best overlap', async ({
    browser,
  }) => {
    const sessions: Array<Session> = []
    try {
      const host = await createSession(browser, hostEmail, hostPassword)
      const guest = await createSession(browser, guestEmail, guestPassword)
      const guestTwo = await createSession(
        browser,
        guestTwoEmail,
        guestPassword,
      )
      sessions.push(host, guest, guestTwo)

      const title = `Invited E2E flow ${Date.now()}`
      const scheduleUrl = await createSchedule(host.page, title, 'invited', [
        guestEmail,
        guestTwoEmail,
      ])

      await vote(guest.page, scheduleUrl, [0, 1])
      await vote(guestTwo.page, scheduleUrl, [1])

      const recommended = host.page
        .locator('article')
        .filter({ hasText: 'Best overlap' })
      await expect(recommended).toContainText('2 available')
      await recommended
        .getByRole('button', { name: 'Choose this time' })
        .click()
      await expect(host.page.getByText(/decided/)).toBeVisible()
    } finally {
      await Promise.all(sessions.map((session) => session.close()))
    }
  })

  test('multiple signed-in users can vote on a public schedule', async ({
    browser,
  }, testInfo) => {
    const sessions: Array<Session> = []
    try {
      const captureMedia = process.env.E2E_CAPTURE_MEDIA === 'true'
      const host = await createSession(
        browser,
        hostEmail,
        hostPassword,
        captureMedia ? testInfo.outputPath('video') : undefined,
      )
      const guest = await createSession(browser, guestEmail, guestPassword)
      const guestTwo = await createSession(
        browser,
        guestTwoEmail,
        guestPassword,
      )
      sessions.push(host, guest, guestTwo)

      const title = `Public E2E flow ${Date.now()}`
      const scheduleUrl = await createSchedule(host.page, title, 'public')

      await vote(guest.page, scheduleUrl, [0, 1])
      await vote(guestTwo.page, scheduleUrl, [1])

      await host.page.reload()
      const participation = host.page
        .getByText('people have voted')
        .locator('..')
      await expect(participation).toContainText('2')
      const recommended = host.page
        .locator('article')
        .filter({ hasText: 'Best overlap' })
      await expect(recommended).toContainText('2 available')
      await expect(
        host.page.getByRole('button', { name: 'Choose this time' }),
      ).toHaveCount(0)
      if (captureMedia) {
        await host.page.screenshot({
          path: testInfo.outputPath('public-voting-result.png'),
          fullPage: true,
        })
      }
    } finally {
      await Promise.all(sessions.map((session) => session.close()))
    }
  })
})
