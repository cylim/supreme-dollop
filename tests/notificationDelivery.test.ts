import { describe, expect, it, vi } from 'vitest'
import {
  deliverInboundReply,
  deliverScheduleNotification,
  partitionNotificationRecipients,
} from '../convex/notificationDelivery'
import type {
  NotificationOutcome,
  OutboundMessage,
} from '../convex/notificationDelivery'

const payload = {
  slug: 'community-planning',
  title: 'Community planning session',
  timezone: 'Asia/Kuala_Lumpur',
  recipients: ['first@example.com', 'second@example.com'],
  selectedStartAt: null,
  selectedEndAt: null,
}

describe('notification delivery', () => {
  it('suppresses configured and reserved test recipients', () => {
    expect(
      partitionNotificationRecipients(
        ['safe@example.com', 'named@example.com', 'robot@example.test'],
        'Named@Example.com',
      ),
    ).toEqual({ deliverable: ['safe@example.com'], suppressedCount: 2 })
  })

  it('delivers the operation through a recording adapter', async () => {
    const messages: Array<OutboundMessage> = []
    const outcomes: Array<NotificationOutcome> = []
    const outcome = await deliverScheduleNotification(
      {
        kind: 'invitation',
        payload,
        notificationRunId: 'run-1',
        publicAppUrl: 'https://jrny.example/',
      },
      {
        send: (message) => {
          messages.push(message)
          return Promise.resolve()
        },
        record: (value) => {
          outcomes.push(value)
          return Promise.resolve()
        },
      },
    )
    expect(outcome).toEqual({ status: 'sent' })
    expect(outcomes).toEqual([{ status: 'sent' }])
    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({
      recipient: 'first@example.com',
      idempotencyKey: 'run-1:first@example.com',
    })
    expect(messages[0].text).toContain('/s/community-planning')
  })

  it('records suppression, missing configuration, and provider failure', async () => {
    const record = vi.fn((_outcome: NotificationOutcome) => Promise.resolve())
    expect(
      await deliverScheduleNotification(
        {
          kind: 'invitation',
          payload: { ...payload, recipients: ['robot@example.test'] },
          notificationRunId: 'run-2',
          publicAppUrl: 'https://jrny.example',
        },
        { send: vi.fn(), record },
      ),
    ).toMatchObject({ status: 'skipped' })
    expect(
      await deliverScheduleNotification(
        {
          kind: 'invitation',
          payload,
          notificationRunId: 'run-3',
        },
        { record },
      ),
    ).toMatchObject({ errorCode: 'integration_not_configured' })
    expect(
      await deliverScheduleNotification(
        {
          kind: 'invitation',
          payload,
          notificationRunId: 'run-4',
          publicAppUrl: 'https://jrny.example',
        },
        {
          send: () => Promise.reject(new Error('provider unavailable')),
          record,
        },
      ),
    ).toMatchObject({ errorCode: 'provider_error' })
  })

  it('never replies to test recipients', async () => {
    const reply = vi.fn(() => Promise.resolve())
    expect(
      await deliverInboundReply(
        {
          recipient: 'robot@example.test',
          text: 'Created',
          idempotencyKey: 'reply-1',
        },
        { reply },
      ),
    ).toBe('skipped')
    expect(reply).not.toHaveBeenCalled()
  })
})
