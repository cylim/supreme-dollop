function normalizeRecipient(value: string): string {
  return value.trim().toLowerCase()
}

function configuredRecipients(value: string | undefined): Set<string> {
  return new Set(
    (value ?? '')
      .split(/[\n,;]/)
      .map(normalizeRecipient)
      .filter(Boolean),
  )
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

export function partitionNotificationRecipients(
  recipients: Array<string>,
  suppressedRecipients: string | undefined,
): { deliverable: Array<string>; suppressedCount: number } {
  const configured = configuredRecipients(suppressedRecipients)
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

  return { deliverable, suppressedCount }
}
