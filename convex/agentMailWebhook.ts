import { Webhook } from 'svix'
import { normalizeEmail } from '../shared/scheduleDraft'
import { env, httpAction } from './_generated/server'
import { internal } from './_generated/api'

export type InboundAgentMailMessage = {
  eventId: string
  messageId: string
  inboxId: string
  senderEmail: string
  body: string
}

export const receiveAgentMail = httpAction(async (ctx, request) => {
  const rawBody = await request.text()
  const headers = {
    'svix-id': request.headers.get('svix-id') ?? '',
    'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
    'svix-signature': request.headers.get('svix-signature') ?? '',
  }
  try {
    const message = verifyAgentMailWebhook(
      rawBody,
      headers,
      env.AGENTMAIL_WEBHOOK_SECRET,
    )
    if (message !== null) {
      await ctx.runMutation(internal.inboundScheduleModel.accept, message)
    }
    return new Response(null, { status: 200 })
  } catch (error) {
    console.error('AgentMail webhook rejected', error)
    return new Response(null, { status: 400 })
  }
})

export function verifyAgentMailWebhook(
  rawBody: string,
  headers: Record<string, string>,
  secret: string | undefined,
): InboundAgentMailMessage | null {
  if (!secret) throw new Error('AgentMail webhook verification is not configured.')
  new Webhook(secret).verify(rawBody, headers)
  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    throw new Error('AgentMail webhook payload is invalid JSON.')
  }
  if (!isRecord(payload)) throw new Error('AgentMail webhook payload is invalid.')
  if (payload.event_type !== 'message.received') return null
  if (!isRecord(payload.message)) {
    throw new Error('AgentMail message payload is missing.')
  }
  const message = payload.message
  const eventId = requiredString(payload, 'event_id')
  const messageId = requiredString(message, 'message_id')
  const inboxId = requiredString(message, 'inbox_id')
  const senderEmail = extractEmail(requiredString(message, 'from'))
  const body = firstString(message.extracted_text, message.text)
  if (!body) throw new Error('AgentMail message has no plain-text body.')
  return { eventId, messageId, inboxId, senderEmail, body }
}

function extractEmail(value: string): string {
  const bracketed = value.match(/<([^<>\s]+@[^<>\s]+)>/)
  const plain = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  const email = bracketed?.[1] ?? plain?.[0]
  if (!email) throw new Error('AgentMail sender address is invalid.')
  return normalizeEmail(email)
}

function firstString(...values: Array<unknown>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

function requiredString(value: Record<string, unknown>, field: string): string {
  const item = value[field]
  if (typeof item !== 'string' || item.trim() === '') {
    throw new Error(`AgentMail ${field} is missing.`)
  }
  return item
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
