export type NotificationKind = 'invitation' | 'finalized' | 'decision_invitation'

export type NotificationPayload = {
  slug: string
  title: string
  timezone: string
  recipients: Array<string>
  selectedStartAt: number | null
  selectedEndAt: number | null
}

export type NotificationOutcome = {
  status: 'sent' | 'failed' | 'skipped'
  errorCode?: string
}

export type OutboundMessage = {
  recipient: string
  subject: string
  text: string
  idempotencyKey: string
}

export async function deliverInboundReply(
  input: {
    recipient: string
    text: string
    idempotencyKey: string
    suppressedRecipients?: string
  },
  adapter: {
    reply?: (value: { text: string; idempotencyKey: string }) => Promise<void>
  },
): Promise<'sent' | 'failed' | 'skipped'> {
  const { deliverable } = partitionNotificationRecipients(
    [input.recipient],
    input.suppressedRecipients,
  )
  if (deliverable.length === 0) return 'skipped'
  if (!adapter.reply) return 'failed'
  try {
    await adapter.reply({ text: input.text, idempotencyKey: input.idempotencyKey })
    return 'sent'
  } catch {
    return 'failed'
  }
}

export async function deliverScheduleNotification(
  input: {
    kind: NotificationKind
    payload: NotificationPayload | null
    notificationRunId: string
    publicAppUrl?: string
    suppressedRecipients?: string
  },
  adapters: {
    send?: (message: OutboundMessage) => Promise<void>
    record: (outcome: NotificationOutcome) => Promise<void>
    reportSuppressed?: (count: number) => void
  },
): Promise<NotificationOutcome | null> {
  if (input.payload === null) return null
  const { deliverable, suppressedCount } = partitionNotificationRecipients(
    input.payload.recipients,
    input.suppressedRecipients,
  )
  if (suppressedCount > 0) adapters.reportSuppressed?.(suppressedCount)
  if (deliverable.length === 0) {
    return await record(adapters, {
      status: 'skipped',
      errorCode: 'test_recipient_suppressed',
    })
  }
  if (!input.publicAppUrl || !adapters.send) {
    return await record(adapters, {
      status: 'failed',
      errorCode: 'integration_not_configured',
    })
  }

  const path = input.kind === 'decision_invitation' ? 'd' : 's'
  const targetUrl = `${input.publicAppUrl.replace(/\/$/, '')}/${path}/${input.payload.slug}`
  try {
    for (let index = 0; index < deliverable.length; index += 5) {
      const batch = deliverable.slice(index, index + 5)
      await Promise.all(
        batch.map((recipient) =>
          adapters.send!(
            buildMessage(
              input.kind,
              input.payload!,
              recipient,
              targetUrl,
              `${input.notificationRunId}:${recipient}`,
            ),
          ),
        ),
      )
    }
    return await record(adapters, { status: 'sent' })
  } catch {
    return await record(adapters, {
      status: 'failed',
      errorCode: 'provider_error',
    })
  }
}

export function partitionNotificationRecipients(
  recipients: Array<string>,
  suppressedRecipients: string | undefined,
): { deliverable: Array<string>; suppressedCount: number } {
  const configured = new Set(
    (suppressedRecipients ?? '')
      .split(/[\n,;]/)
      .map(normalizeRecipient)
      .filter(Boolean),
  )
  const deliverable: Array<string> = []
  let suppressedCount = 0
  for (const recipient of recipients) {
    const normalized = normalizeRecipient(recipient)
    if (configured.has(normalized) || usesReservedTestDomain(normalized)) {
      suppressedCount += 1
    } else {
      deliverable.push(normalized)
    }
  }
  return { deliverable: Array.from(new Set(deliverable)), suppressedCount }
}

function buildMessage(
  kind: NotificationKind,
  payload: NotificationPayload,
  recipient: string,
  targetUrl: string,
  idempotencyKey: string,
): OutboundMessage {
  const chosenTime =
    payload.selectedStartAt === null || payload.selectedEndAt === null
      ? ''
      : `\n\nChosen time: ${new Date(payload.selectedStartAt).toISOString()} to ${new Date(payload.selectedEndAt).toISOString()} (${payload.timezone})`
  if (kind === 'decision_invitation') {
    return {
      recipient,
      subject: `Give your opinion on ${payload.title}`,
      text: `You have been invited to a decision: ${payload.title}.\n\nOpen the decision: ${targetUrl}`,
      idempotencyKey,
    }
  }
  return {
    recipient,
    subject:
      kind === 'invitation'
        ? `Choose a time for ${payload.title}`
        : `Confirmed: ${payload.title}`,
    text:
      kind === 'invitation'
        ? `You have been invited to vote on a time for ${payload.title}.\n\nOpen the schedule: ${targetUrl}`
        : `The host has confirmed the time for ${payload.title}.${chosenTime}\n\nView the schedule: ${targetUrl}`,
    idempotencyKey,
  }
}

async function record(
  adapters: { record: (outcome: NotificationOutcome) => Promise<void> },
  outcome: NotificationOutcome,
) {
  await adapters.record(outcome)
  return outcome
}

function normalizeRecipient(value: string): string {
  return value.trim().toLowerCase()
}

function usesReservedTestDomain(email: string): boolean {
  const domain = email.split('@').at(-1) ?? ''
  return (
    domain === 'test' ||
    domain.endsWith('.test') ||
    domain === 'invalid' ||
    domain.endsWith('.invalid')
  )
}
