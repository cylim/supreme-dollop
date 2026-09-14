// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getFunctionName } from 'convex/server'
import { DecisionPanel } from '../src/components/DecisionPanel'
import type { ComponentProps } from 'react'

const mocks = vi.hoisted(() => ({
  useMutation: vi.fn(),
  submitBallot: vi.fn(),
  addOption: vi.fn(),
  removeOption: vi.fn(),
  closeDecision: vi.fn(),
}))

vi.mock('convex/react', () => ({ useMutation: mocks.useMutation }))
vi.mock('@stylexjs/stylex', () => ({
  create: (styles: Record<string, unknown>) => styles,
  props: () => ({}),
}))

type Decision = ComponentProps<typeof DecisionPanel>['decision']

function decision(overrides: Partial<Decision> = {}): Decision {
  return {
    id: 'decision-1',
    slug: 'beach-or-park',
    title: 'Beach or park?',
    description: null,
    scheduleId: null,
    visibility: 'public',
    selectMode: 'single',
    closesAt: null,
    status: 'open',
    isHost: false,
    canSubmitBallot: true,
    participantCount: 0,
    invitations: [],
    options: [
      {
        id: 'option-1',
        label: 'Beach',
        order: 0,
        selectionCount: 0,
        selected: false,
        faces: [],
      },
      {
        id: 'option-2',
        label: 'Park',
        order: 1,
        selectionCount: 1,
        selected: true,
        faces: [{ picture: null, initial: 'M' }],
      },
    ],
    ...overrides,
  } as Decision
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.useMutation.mockImplementation((reference) => {
    const name = getFunctionName(reference)
    if (name === 'decisions:submitBallot') return mocks.submitBallot
    if (name === 'decisions:addOption') return mocks.addOption
    if (name === 'decisions:removeOption') return mocks.removeOption
    if (name === 'decisions:close') return mocks.closeDecision
    throw new Error('Unexpected mutation reference.')
  })
  mocks.submitBallot.mockResolvedValue(null)
  mocks.addOption.mockResolvedValue(null)
  mocks.removeOption.mockResolvedValue(null)
  mocks.closeDecision.mockResolvedValue(null)
})

describe('DecisionPanel', () => {
  it('replaces a single-selection ballot', async () => {
    render(<DecisionPanel decision={decision()} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Select' })[0])

    await waitFor(() =>
      expect(mocks.submitBallot).toHaveBeenCalledWith({
        decisionId: 'decision-1',
        optionIds: ['option-1'],
      }),
    )
  })

  it('adds and removes options from a multi-selection ballot', async () => {
    render(<DecisionPanel decision={decision({ selectMode: 'multi' })} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Select' })[0])
    await waitFor(() =>
      expect(mocks.submitBallot).toHaveBeenCalledWith({
        decisionId: 'decision-1',
        optionIds: ['option-2', 'option-1'],
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Selected' }))
    await waitFor(() =>
      expect(mocks.submitBallot).toHaveBeenLastCalledWith({
        decisionId: 'decision-1',
        optionIds: [],
      }),
    )
  })

  it('shows host controls and announces a mutation failure', async () => {
    mocks.addOption.mockRejectedValue(new Error('Option already exists.'))
    render(<DecisionPanel decision={decision({ isHost: true })} />)

    fireEvent.change(screen.getByPlaceholderText('Add an option'), {
      target: { value: 'Museum' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByRole('status', { name: '' })).toHaveTextContent(
      'Option already exists.',
    )
    expect(mocks.addOption).toHaveBeenCalledWith({
      decisionId: 'decision-1',
      label: 'Museum',
    })
    expect(screen.getByRole('button', { name: 'Close decision' })).toBeEnabled()
  })

  it('hides mutation controls for a closed decision', () => {
    render(
      <DecisionPanel
        decision={decision({
          status: 'closed',
          canSubmitBallot: false,
          isHost: true,
        })}
      />,
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('lets the host remove an option and close the decision', async () => {
    render(<DecisionPanel decision={decision({ isHost: true })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Remove Beach' }))
    await waitFor(() =>
      expect(mocks.removeOption).toHaveBeenCalledWith({
        decisionId: 'decision-1',
        optionId: 'option-1',
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Close decision' }))
    await waitFor(() =>
      expect(mocks.closeDecision).toHaveBeenCalledWith({
        decisionId: 'decision-1',
      }),
    )
  })
})
