import { describe, expect, it, vi } from 'vitest'
import {
  deliverInboundReply,
  deliverNotification,
  partitionNotificationRecipients,
} from './notificationDelivery'
import type {
  NotificationOutcome,
  OutboundMessage,
} from './notificationDelivery'

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
    const outcome = await deliverNotification(
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
      await deliverNotification(
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
      await deliverNotification(
        {
          kind: 'invitation',
          payload,
          notificationRunId: 'run-3',
        },
        { record },
      ),
    ).toMatchObject({ errorCode: 'integration_not_configured' })
    expect(
      await deliverNotification(
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

  it('reports inbound reply success, missing adapters, and provider failure', async () => {
    const input = {
      recipient: 'person@example.com',
      text: 'Created',
      idempotencyKey: 'reply-2',
    }
    expect(await deliverInboundReply(input, {})).toBe('failed')
    expect(
      await deliverInboundReply(input, {
        reply: () => Promise.resolve(),
      }),
    ).toBe('sent')
    expect(
      await deliverInboundReply(input, {
        reply: () => Promise.reject(new Error('provider unavailable')),
      }),
    ).toBe('failed')
  })

  it('ignores deleted payloads without recording an outcome', async () => {
    const record = vi.fn()
    expect(
      await deliverNotification(
        {
          kind: 'invitation',
          payload: null,
          notificationRunId: 'deleted',
        },
        { record },
      ),
    ).toBeNull()
    expect(record).not.toHaveBeenCalled()
  })

  it('builds decision and finalized messages and reports suppression', async () => {
    const send = vi.fn(() => Promise.resolve())
    const record = vi.fn(() => Promise.resolve())
    const reportSuppressed = vi.fn()
    await deliverNotification(
      {
        kind: 'decision_invitation',
        payload: {
          slug: 'where',
          title: 'Where should we go?',
          recipients: ['person@example.com', 'robot@example.test'],
        },
        notificationRunId: 'decision-run',
        publicAppUrl: 'https://jrny.example/',
      },
      { send, record, reportSuppressed },
    )
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Give your opinion on Where should we go?',
        text: expect.stringContaining('/d/where'),
      }),
    )
    expect(reportSuppressed).toHaveBeenCalledWith(1)

    send.mockClear()
    await deliverNotification(
      {
        kind: 'finalized',
        payload: {
          ...payload,
          recipients: ['person@example.com'],
          selectedStartAt: 0,
          selectedEndAt: 60_000,
          timezone: undefined,
        },
        notificationRunId: 'final-run',
        publicAppUrl: 'https://jrny.example',
      },
      { send, record },
    )
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Confirmed: Community planning session',
        text: expect.stringContaining('(UTC)'),
      }),
    )
  })

  it('normalizes, deduplicates, and sends recipients in bounded batches', async () => {
    const recipients = [
      ' ONE@example.com ',
      'one@example.com',
      'two@example.com',
      'three@example.com',
      'four@example.com',
      'five@example.com',
      'six@example.com',
    ]
    let inFlight = 0
    let maximumInFlight = 0
    const send = vi.fn(async () => {
      inFlight += 1
      maximumInFlight = Math.max(maximumInFlight, inFlight)
      await Promise.resolve()
      inFlight -= 1
    })
    await deliverNotification(
      {
        kind: 'invitation',
        payload: { ...payload, recipients },
        notificationRunId: 'batch-run',
        publicAppUrl: 'https://jrny.example',
      },
      { send, record: () => Promise.resolve() },
    )
    expect(send).toHaveBeenCalledTimes(6)
    expect(maximumInFlight).toBeLessThanOrEqual(5)
  })
})
