import { describe, expect, it } from 'vitest'
import { buildLlmsText } from '../convex/llms'

describe('llms.txt', () => {
  it('publishes the destination and complete protocol markers', () => {
    const text = buildLlmsText('schedule@example.com')
    expect(text).toContain('Email destination: schedule@example.com')
    expect(text).toContain('JRNY_SELECT_REQUEST_V1')
    expect(text).toContain('END_JRNY_SELECT_REQUEST')
    expect(text).toContain('explicit UTC offset')
    expect(text).toContain('AgentMail event IDs are idempotent')
    expect(text).toContain('"kind": "schedule"')
    expect(text).toContain('"kind": "decision"')
  })
})
