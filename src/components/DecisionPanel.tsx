import { useState } from 'react'
import * as stylex from '@stylexjs/stylex'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { Face } from './Face'
import type { FunctionReturnType } from 'convex/server'
import type { Id } from '../../convex/_generated/dataModel'

type DecisionView = NonNullable<
  FunctionReturnType<typeof api.decisions.getBySlug>
>

export function DecisionPanel({ decision }: { decision: DecisionView }) {
  const submitBallot = useMutation(
    api.decisions.submitBallot,
  ).withOptimisticUpdate((localStore, args) => {
    const queryArgs = { slug: decision.slug }
    const current = localStore.getQuery(api.decisions.getBySlug, queryArgs)
    if (current === undefined || current === null) return
    const selectedIds = new Set(args.optionIds)
    localStore.setQuery(api.decisions.getBySlug, queryArgs, {
      ...current,
      options: current.options.map((option) => ({
        ...option,
        selected: selectedIds.has(option.id),
      })),
    })
  })
  const addOption = useMutation(api.decisions.addOption)
  const removeOption = useMutation(api.decisions.removeOption)
  const closeDecision = useMutation(api.decisions.close)
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [newLabel, setNewLabel] = useState('')

  const selected = decision.options
    .filter((option) => option.selected)
    .map((option) => option.id)

  const save = async (optionIds: Array<Id<'decisionOptions'>>) => {
    setSaving(true)
    setMessage(null)
    try {
      await submitBallot({ decisionId: decision.id, optionIds })
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : 'Could not save your ballot.',
      )
    } finally {
      setSaving(false)
    }
  }

  const toggle = (optionId: Id<'decisionOptions'>) => {
    if (!decision.canSubmitBallot || saving) return
    if (decision.selectMode === 'single') {
      void save(selected[0] === optionId ? [] : [optionId])
      return
    }
    void save(
      selected.includes(optionId)
        ? selected.filter((id) => id !== optionId)
        : [...selected, optionId],
    )
  }

  const add = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await addOption({ decisionId: decision.id, label: newLabel })
      setNewLabel('')
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : 'Could not add that option.',
      )
    } finally {
      setSaving(false)
    }
  }

  const remove = async (optionId: Id<'decisionOptions'>) => {
    setSaving(true)
    setMessage(null)
    try {
      await removeOption({ decisionId: decision.id, optionId })
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : 'Could not remove that option.',
      )
    } finally {
      setSaving(false)
    }
  }

  const close = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await closeDecision({ decisionId: decision.id })
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : 'Could not close this decision.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <section {...stylex.props(styles.panel)}>
      <div {...stylex.props(styles.heading)}>
        <div>
          <span {...stylex.props(styles.eyebrow)}>
            {decision.selectMode === 'single'
              ? 'Pick one'
              : 'Pick any that apply'}
          </span>
          <h2 {...stylex.props(styles.title)}>{decision.title}</h2>
          {decision.description && (
            <p {...stylex.props(styles.description)}>{decision.description}</p>
          )}
        </div>
        <span {...stylex.props(styles.badge)}>{decision.status}</span>
      </div>
      <div {...stylex.props(styles.list)}>
        {decision.options.map((option, index) => (
          <article
            key={option.id}
            {...stylex.props(
              styles.option,
              option.selected && styles.optionSelected,
            )}
          >
            <div {...stylex.props(styles.rank)}>{index + 1}</div>
            <div {...stylex.props(styles.copy)}>
              <strong>{option.label}</strong>
              <div {...stylex.props(styles.faces)}>
                {option.faces.map((face, faceIndex) => (
                  <Face
                    key={`${option.id}-${faceIndex}`}
                    picture={face.picture}
                    initial={face.initial}
                  />
                ))}
                <span {...stylex.props(styles.count)}>
                  {option.selectionCount}
                </span>
              </div>
            </div>
            {decision.canSubmitBallot && (
              <button
                type="button"
                aria-pressed={option.selected}
                disabled={saving}
                {...stylex.props(
                  styles.selectionButton,
                  option.selected && styles.selectionActive,
                )}
                onClick={() => toggle(option.id)}
              >
                {option.selected ? 'Selected' : 'Select'}
              </button>
            )}
            {decision.isHost && decision.status === 'open' && (
              <button
                type="button"
                disabled={saving}
                aria-label={`Remove ${option.label}`}
                {...stylex.props(styles.removeButton)}
                onClick={() => void remove(option.id)}
              >
                ×
              </button>
            )}
          </article>
        ))}
      </div>
      {decision.isHost && decision.status === 'open' && (
        <div {...stylex.props(styles.hostRow)}>
          <input
            {...stylex.props(styles.input)}
            value={newLabel}
            onChange={(event) => setNewLabel(event.target.value)}
            placeholder="Add an option"
            maxLength={80}
          />
          <button
            type="button"
            disabled={saving}
            {...stylex.props(styles.secondaryButton)}
            onClick={() => void add()}
          >
            Add
          </button>
          <button
            type="button"
            disabled={saving}
            {...stylex.props(styles.closeButton)}
            onClick={() => void close()}
          >
            Close decision
          </button>
        </div>
      )}
      {message && (
        <p role="status" {...stylex.props(styles.message)}>
          {message}
        </p>
      )}
    </section>
  )
}

const styles = stylex.create({
  panel: {
    padding: { default: 28, '@media (max-width: 600px)': 16 },
    borderRadius: 22,
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#c7d0c7',
  },
  heading: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'start',
    gap: 16,
    marginBottom: 20,
  },
  eyebrow: {
    color: '#2d724d',
    fontSize: 10,
    fontWeight: 850,
    letterSpacing: '0.11em',
    textTransform: 'uppercase',
  },
  title: { marginTop: 7, marginBottom: 0, color: '#203027', fontSize: 24 },
  description: { marginTop: 8, color: '#536159', lineHeight: 1.5 },
  badge: {
    paddingInline: 9,
    paddingBlock: 5,
    borderRadius: 999,
    color: '#5a5540',
    backgroundColor: '#eee9d8',
    fontSize: 10,
    fontWeight: 850,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  list: { display: 'flex', flexDirection: 'column', gap: 9 },
  option: {
    padding: 14,
    display: 'grid',
    gridTemplateColumns: {
      default: '34px 1fr auto auto',
      '@media (max-width: 650px)': '30px 1fr',
    },
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#d2d8d2',
    borderRadius: 14,
    backgroundColor: '#f8f8f4',
  },
  optionSelected: { borderColor: '#4b9165', backgroundColor: '#f0f8f1' },
  rank: {
    width: 30,
    height: 30,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 9,
    color: '#637068',
    backgroundColor: '#e5e9e4',
    fontSize: 12,
    fontWeight: 800,
  },
  copy: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    color: '#26342c',
    fontSize: 13,
  },
  faces: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  count: { color: '#6a776f', fontSize: 10, fontWeight: 700 },
  selectionButton: {
    minWidth: 92,
    paddingInline: 12,
    paddingBlock: 9,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#adb8af',
    borderRadius: 10,
    color: '#68756c',
    backgroundColor: '#fff',
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 750,
  },
  selectionActive: {
    borderColor: '#267049',
    color: '#fff',
    backgroundColor: '#267049',
  },
  removeButton: {
    width: 30,
    height: 30,
    borderWidth: 0,
    borderRadius: 9,
    color: '#7e3931',
    backgroundColor: { default: '#fbe9e6', ':hover': '#f6d8d3' },
    cursor: 'pointer',
    fontSize: 20,
  },
  hostRow: {
    marginTop: 16,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  input: {
    flex: 1,
    minWidth: 160,
    minHeight: 42,
    paddingInline: 13,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#aeb9b0',
    borderRadius: 11,
    outline: 'none',
    color: '#1f2b23',
    backgroundColor: '#fbfcf9',
  },
  secondaryButton: {
    paddingInline: 14,
    paddingBlock: 10,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#43815a',
    borderRadius: 10,
    color: '#185331',
    backgroundColor: '#f7fff9',
    cursor: 'pointer',
    fontWeight: 750,
  },
  closeButton: {
    paddingInline: 14,
    paddingBlock: 10,
    borderWidth: 0,
    borderRadius: 10,
    color: '#fff',
    backgroundColor: '#17633a',
    cursor: 'pointer',
    fontWeight: 750,
  },
  message: {
    marginBottom: 0,
    marginTop: 12,
    padding: 12,
    borderRadius: 11,
    color: '#245b39',
    backgroundColor: '#e3f2e6',
    fontSize: 12,
  },
})
