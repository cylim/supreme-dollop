import { describe, expect, it } from 'vitest'
import { partitionNotificationRecipients } from '../convex/notificationPolicy'

describe('notification recipient policy', () => {
  it('suppresses configured and reserved test recipients before delivery', () => {
    const result = partitionNotificationRecipients(
      ['Host@Example.Test', 'qa-voter@example.com', 'delivery@non-test.tld'],
      'qa-voter@example.com',
    )

    expect(result).toEqual({
      deliverable: ['delivery@non-test.tld'],
      suppressedCount: 2,
    })
  })
})
