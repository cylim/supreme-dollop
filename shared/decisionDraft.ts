import { MAX_INVITATIONS, normalizeEmail } from './scheduleDraft'

export const MIN_OPTIONS = 2
export const MAX_OPTIONS = 100
export const MAX_ATTACHED_DECISIONS = 20
export const MAX_OPTION_LABEL = 80

export type SelectMode = 'single' | 'multi'
export type DecisionVisibility = 'public' | 'invited'
export type DecisionStatus = 'open' | 'closed'

export type DecisionOptionDraft = {
  label: string
}

export type StandaloneDecisionDraftInput = {
  title: string
  description?: string
  visibility: DecisionVisibility
  selectMode: SelectMode
  options: Array<string>
  inviteEmails: Array<string>
  closesAt?: number
}

export type AttachedDecisionDraftInput = {
  title: string
  description?: string
  selectMode: SelectMode
  options: Array<string>
  closesAt?: number
}

export type NormalizedStandaloneDecisionDraft = {
  title: string
  description?: string
  visibility: DecisionVisibility
  selectMode: SelectMode
  options: Array<string>
  inviteEmails: Array<string>
  closesAt?: number
}

export type NormalizedAttachedDecisionDraft = {
  title: string
  description?: string
  selectMode: SelectMode
  options: Array<string>
  closesAt?: number
}

export function normalizeOptionLabel(value: string): string {
  const label = value.trim()
  if (label.length === 0 || label.length > MAX_OPTION_LABEL) {
    throw new Error('Each option needs a label between 1 and 80 characters.')
  }
  return label
}

export function optionKey(label: string): string {
  return label.trim().toLowerCase()
}

export function normalizeOptionLabels(options: Array<string>): Array<string> {
  if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
    throw new Error('Add between 2 and 100 options.')
  }
  const seen = new Set<string>()
  return options.map((value) => {
    const label = normalizeOptionLabel(value)
    const key = optionKey(label)
    if (seen.has(key)) throw new Error('Option labels must be unique.')
    seen.add(key)
    return label
  })
}

export function normalizeDecisionTitle(title: string): string {
  const trimmed = title.trim()
  if (trimmed.length < 3 || trimmed.length > 120) {
    throw new Error('Use a title between 3 and 120 characters.')
  }
  return trimmed
}

export function normalizeDecisionDescription(value: string | undefined) {
  const description = value?.trim()
  return description ? description.slice(0, 1_000) : undefined
}

export function normalizeClosesAt(closesAt: number | undefined, now: number) {
  if (closesAt === undefined) return undefined
  if (!Number.isFinite(closesAt) || closesAt < 0) {
    throw new Error('Decision deadline is invalid.')
  }
  if (closesAt <= now + 60_000) {
    throw new Error('The decision must stay open for at least one minute.')
  }
  return closesAt
}

export function normalizeSelectMode(value: string): SelectMode {
  if (value !== 'single' && value !== 'multi') {
    throw new Error('selectMode must be single or multi.')
  }
  return value
}

export function normalizeStandaloneDecisionDraft(
  input: StandaloneDecisionDraftInput,
  now = Date.now(),
): NormalizedStandaloneDecisionDraft {
  const inviteEmails = Array.from(
    new Set(input.inviteEmails.map(normalizeEmail).filter(Boolean)),
  )
  if (inviteEmails.length > MAX_INVITATIONS) {
    throw new Error('A decision can invite at most 100 people.')
  }
  if (input.visibility === 'invited' && inviteEmails.length === 0) {
    throw new Error('Invited decisions need at least one email.')
  }
  const description = normalizeDecisionDescription(input.description)
  const closesAt = normalizeClosesAt(input.closesAt, now)
  return {
    title: normalizeDecisionTitle(input.title),
    ...(description ? { description } : {}),
    visibility: input.visibility,
    selectMode: normalizeSelectMode(input.selectMode),
    options: normalizeOptionLabels(input.options),
    inviteEmails,
    ...(closesAt !== undefined ? { closesAt } : {}),
  }
}

export function normalizeAttachedDecisionDraft(
  input: AttachedDecisionDraftInput,
  now = Date.now(),
): NormalizedAttachedDecisionDraft {
  const description = normalizeDecisionDescription(input.description)
  const closesAt = normalizeClosesAt(input.closesAt, now)
  return {
    title: normalizeDecisionTitle(input.title),
    ...(description ? { description } : {}),
    selectMode: normalizeSelectMode(input.selectMode),
    options: normalizeOptionLabels(input.options),
    ...(closesAt !== undefined ? { closesAt } : {}),
  }
}
