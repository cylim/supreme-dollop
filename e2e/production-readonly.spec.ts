import { expect, test } from '@playwright/test'

const scheduleUrl = process.env.E2E_PUBLIC_SCHEDULE_URL!
const decisionUrl = process.env.E2E_PUBLIC_DECISION_URL!
const email = process.env.E2E_HOST_EMAIL!
const password = process.env.E2E_HOST_PASSWORD!

test('read-only production fixtures load without emitting a mutation', async ({
  page,
}) => {
  await page.goto('/e2e-login')
  await page.getByLabel('Test email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL((url) => url.pathname === '/')

  const mutationMessages: Array<string> = []
  await page.addInitScript(() => {
    const send = WebSocket.prototype.send
    WebSocket.prototype.send = function (data) {
      if (typeof data === 'string' && /"type"\s*:\s*"Mutation"/i.test(data)) {
        throw new Error('Production check blocked a Convex mutation.')
      }
      return send.call(this, data)
    }
  })
  page.on('pageerror', (error) => {
    if (/blocked a Convex mutation/i.test(error.message)) {
      mutationMessages.push(error.message)
    }
  })

  for (const url of [scheduleUrl, decisionUrl]) {
    await page.goto(url)
    await expect(page.locator('main')).toBeVisible()
  }
  expect(mutationMessages).toEqual([])
})
