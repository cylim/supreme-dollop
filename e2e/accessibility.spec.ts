import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { signInOrCreate } from './auth'

const email = process.env.E2E_HOST_EMAIL!
const password = process.env.E2E_HOST_PASSWORD!

const fixtureUrls = [
  process.env.E2E_PUBLIC_SCHEDULE_URL,
  process.env.E2E_PUBLIC_DECISION_URL,
].filter((url): url is string => Boolean(url))

test('public fixtures have no serious or critical automated findings', async ({
  page,
}) => {
  test.skip(fixtureUrls.length !== 2, 'Public fixture URLs are required.')
  await signInOrCreate(page, email, password)

  for (const url of fixtureUrls) {
    await page.goto(url)
    await expect(page.locator('main')).toBeVisible()
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(
      results.violations.filter((violation) =>
        ['serious', 'critical'].includes(violation.impact ?? ''),
      ),
    ).toEqual([])
  }
})
