import { describe, expect, it } from 'vitest'
import { Webhook } from 'svix'
import { verifyAgentMailWebhook } from '../convex/agentMailWebhook'

const secret = `whsec_${btoa('a'.repeat(32))}`

function signed(payload: unknown) {
  const rawBody = JSON.stringify(payload)
  const id = 'msg_delivery_123'
  const timestamp = new Date()
  const signature = new Webhook(secret).sign(id, timestamp, rawBody)
  return {
    rawBody,
    headers: {
      'svix-id': id,
      'svix-timestamp': String(Math.floor(timestamp.getTime() / 1_000)),
      'svix-signature': signature,
    },
  }
}

describe('AgentMail webhook adapter', () => {
  it('verifies and extracts authenticated received messages', () => {
    const value = signed({
      type: 'event',
      event_type: 'message.received',
      event_id: 'event-1',
      message: {
        inbox_id: 'schedule@agentmail.test',
        message_id: 'message-1',
        from: 'Host <host@example.com>',
        text: 'request body',
      },
    })
    expect(verifyAgentMailWebhook(value.rawBody, value.headers, secret)).toEqual({
      eventId: 'event-1',
      inboxId: 'schedule@agentmail.test',
      messageId: 'message-1',
      senderEmail: 'host@example.com',
      body: 'request body',
    })
  })

  it('rejects invalid signatures and ignores outgoing events', () => {
    const received = signed({ event_type: 'message.received', event_id: 'event-1' })
    expect(() =>
      verifyAgentMailWebhook(received.rawBody, { ...received.headers, 'svix-signature': 'v1,bad' }, secret),
    ).toThrow()
    const sent = signed({ event_type: 'message.sent', event_id: 'event-2' })
    expect(verifyAgentMailWebhook(sent.rawBody, sent.headers, secret)).toBeNull()
  })
})
