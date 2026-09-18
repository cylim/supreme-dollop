import { expect, test } from '@playwright/test'
import { createSession } from './auth'
import type { Session } from './auth'

const hostEmail = process.env.E2E_HOST_EMAIL!
const hostPassword = process.env.E2E_HOST_PASSWORD!
const participantEmail = process.env.E2E_GUEST_EMAIL!
const participantPassword = process.env.E2E_GUEST_PASSWORD!

test.describe('multi-user decisions', () => {
  test('a public decision shows initials on the selected option', async ({
    browser,
  }) => {
    const sessions: Array<Session> = []
    try {
      const host = await createSession(browser, hostEmail, hostPassword)
      const participant = await createSession(
        browser,
        participantEmail,
        participantPassword,
      )
      sessions.push(host, participant)

      const title = `Public decision ${Date.now()}`
      await host.page.goto('/new/decision')
      await host.page.getByLabel('Title').fill(title)
      await host.page.getByLabel('Option 1').fill('Beach')
      await host.page.getByLabel('Option 2').fill('Park')
      await host.page.getByRole('button', { name: 'Open the decision' }).click()
      await host.page.waitForURL((url) => url.pathname.startsWith('/d/'))
      const decisionUrl = host.page.url()

      await participant.page.goto(decisionUrl)
      await participant.page
        .getByRole('button', { name: 'Select', exact: true })
        .first()
        .click()
      await expect(
        participant.page
          .locator('article')
          .filter({ hasText: 'Beach' })
          .getByText('E', { exact: true }),
      ).toBeVisible()

      await host.page.reload()
      await expect(
        host.page
          .locator('article')
          .filter({ hasText: 'Beach' })
          .getByText('E', { exact: true }),
      ).toBeVisible()
    } finally {
      await Promise.all(sessions.map((session) => session.close()))
    }
  })

  test('an invited multi-select decision can be edited, answered, and closed', async ({
    browser,
  }) => {
    const sessions: Array<Session> = []
    try {
      const host = await createSession(browser, hostEmail, hostPassword)
      const participant = await createSession(
        browser,
        participantEmail,
        participantPassword,
      )
      sessions.push(host, participant)

      await host.page.goto('/new/decision')
      await host.page.getByLabel('Title').fill(`Dinner ${Date.now()}`)
      await host.page.getByLabel('Option 1').fill('Thai')
      await host.page.getByLabel('Option 2').fill('Pizza')
      await host.page.getByRole('button', { name: /Multi select/ }).click()
      await host.page.getByRole('button', { name: /Invited decision/ }).click()
      await host.page.getByLabel('Invitation emails').fill(participantEmail)
      await host.page.getByRole('button', { name: 'Open the decision' }).click()
      await host.page.waitForURL((url) => url.pathname.startsWith('/d/'))

      await participant.page.goto(host.page.url())
      await participant.page
        .getByRole('button', { name: 'Select', exact: true })
        .first()
        .click()
      await participant.page
        .getByRole('button', { name: 'Select', exact: true })
        .first()
        .click()
      await expect(
        participant.page.getByRole('button', { name: 'Selected' }),
      ).toHaveCount(2)

      await host.page.getByPlaceholder('Add an option').fill('Sushi')
      await host.page.getByRole('button', { name: 'Add', exact: true }).click()
      await expect(host.page.getByText('Sushi')).toBeVisible()
      await host.page.getByRole('button', { name: 'Close decision' }).click()
      await expect(
        host.page.locator('main > header').getByText('closed', { exact: true }),
      ).toBeVisible()
      await expect(
        participant.page.getByRole('button', { name: 'Select', exact: true }),
      ).toHaveCount(0)
    } finally {
      await Promise.all(sessions.map((session) => session.close()))
    }
  })
})
