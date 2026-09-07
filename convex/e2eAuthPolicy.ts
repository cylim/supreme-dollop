export function parseE2eIdentities(value: string | undefined): Set<string> {
  return new Set(
    (value ?? '')
      .split(/[\n,;]/)
      .map((identity) => identity.trim().toLowerCase())
      .filter(Boolean),
  )
}

export function isAllowedE2eIdentity(
  identity: string,
  enabled: string | undefined,
  configuredIdentities: string | undefined,
): boolean {
  if (enabled !== 'true') return false
  return parseE2eIdentities(configuredIdentities).has(
    identity.trim().toLowerCase(),
  )
}
