import { describe, expect, it } from 'vitest'
import { isAllowedE2eIdentity } from '../convex/e2eAuthPolicy'

describe('E2E auth policy', () => {
  it('allows only configured identities when password auth is enabled', () => {
    expect(
      isAllowedE2eIdentity(
        'Host@Example.Test',
        'true',
        'host@example.test, guest@example.test',
      ),
    ).toBe(true)
    expect(
      isAllowedE2eIdentity(
        'outsider@example.test',
        'true',
        'host@example.test, guest@example.test',
      ),
    ).toBe(false)
    expect(
      isAllowedE2eIdentity('host@example.test', undefined, 'host@example.test'),
    ).toBe(false)
  })
})
