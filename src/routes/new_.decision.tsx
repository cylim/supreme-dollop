import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import * as stylex from '@stylexjs/stylex'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { AppShell } from '../components/AppShell'
import { AuthGate } from '../components/AuthGate'
import { parseInviteEmails } from '../../shared/scheduleDraft'
import type { FormEvent } from 'react'

export const Route = createFileRoute('/new_/decision')({
  component: NewDecisionPage,
})

function NewDecisionPage() {
  return (
    <AppShell>
      <AuthGate>
        <DecisionForm />
      </AuthGate>
    </AppShell>
  )
}

function DecisionForm() {
  const create = useMutation(api.decisions.create)
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [selectMode, setSelectMode] = useState<'single' | 'multi'>('single')
  const [visibility, setVisibility] = useState<'public' | 'invited'>('public')
  const [inviteEmails, setInviteEmails] = useState('')
  const [closesAt, setClosesAt] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const created = await create({
        title,
        ...(description.trim() ? { description } : {}),
        visibility,
        selectMode,
        options: options.map((option) => option.trim()).filter(Boolean),
        inviteEmails:
          visibility === 'invited' ? parseInviteEmails(inviteEmails) : [],
        ...(closesAt ? { closesAt: new Date(closesAt).getTime() } : {}),
      })
      await navigate({ to: '/d/$slug', params: { slug: created.slug } })
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not create the decision.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <main {...stylex.props(styles.main)}>
      <div {...stylex.props(styles.heading)}>
        <span {...stylex.props(styles.kicker)}>New decision</span>
        <h1 {...stylex.props(styles.title)}>Ask the group something else.</h1>
        <p {...stylex.props(styles.lead)}>
          Collect signed-in opinion on labeled options. Time stays on schedules.
        </p>
      </div>
      <form
        {...stylex.props(styles.form)}
        onSubmit={(event) => void submit(event)}
      >
        <section {...stylex.props(styles.card)}>
          <span {...stylex.props(styles.step)}>01 · The question</span>
          <label {...stylex.props(styles.label)}>
            Title
            <input
              {...stylex.props(styles.input)}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              maxLength={120}
              placeholder="What do we eat?"
            />
          </label>
          <label {...stylex.props(styles.label)}>
            A little context{' '}
            <span {...stylex.props(styles.optional)}>optional</span>
            <textarea
              {...stylex.props(styles.textarea)}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={1000}
            />
          </label>
        </section>
        <section {...stylex.props(styles.card)}>
          <span {...stylex.props(styles.step)}>02 · Options</span>
          <div {...stylex.props(styles.choiceRow)}>
            <button
              type="button"
              {...stylex.props(
                styles.choice,
                selectMode === 'single' && styles.choiceActive,
              )}
              onClick={() => setSelectMode('single')}
            >
              <strong>Single select</strong>
              <span>One option per person</span>
            </button>
            <button
              type="button"
              {...stylex.props(
                styles.choice,
                selectMode === 'multi' && styles.choiceActive,
              )}
              onClick={() => setSelectMode('multi')}
            >
              <strong>Multi select</strong>
              <span>Any number of options</span>
            </button>
          </div>
          {options.map((option, index) => (
            <label key={index} {...stylex.props(styles.label)}>
              Option {index + 1}
              <input
                {...stylex.props(styles.input)}
                value={option}
                onChange={(event) =>
                  setOptions((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? event.target.value : item,
                    ),
                  )
                }
                maxLength={80}
              />
            </label>
          ))}
          <button
            type="button"
            {...stylex.props(styles.secondaryButton)}
            onClick={() => setOptions((current) => [...current, ''])}
          >
            Add option
          </button>
        </section>
        <section {...stylex.props(styles.card)}>
          <span {...stylex.props(styles.step)}>03 · Who can answer</span>
          <div {...stylex.props(styles.choiceRow)}>
            <button
              type="button"
              {...stylex.props(
                styles.choice,
                visibility === 'public' && styles.choiceActive,
              )}
              onClick={() => setVisibility('public')}
            >
              <strong>Public link</strong>
              <span>Any signed-in user with the link</span>
            </button>
            <button
              type="button"
              {...stylex.props(
                styles.choice,
                visibility === 'invited' && styles.choiceActive,
              )}
              onClick={() => setVisibility('invited')}
            >
              <strong>Invited decision</strong>
              <span>Restricted to listed Google emails</span>
            </button>
          </div>
          {visibility === 'invited' && (
            <label {...stylex.props(styles.label)}>
              Invitation emails
              <textarea
                {...stylex.props(styles.textarea)}
                value={inviteEmails}
                onChange={(event) => setInviteEmails(event.target.value)}
                placeholder={'alex@example.com\njamie@example.com'}
              />
            </label>
          )}
          <label {...stylex.props(styles.label)}>
            Close date <span {...stylex.props(styles.optional)}>optional</span>
            <input
              type="datetime-local"
              {...stylex.props(styles.input)}
              value={closesAt}
              onChange={(event) => setClosesAt(event.target.value)}
            />
          </label>
        </section>
        {error && (
          <p role="alert" {...stylex.props(styles.error)}>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={saving}
          {...stylex.props(styles.submitButton)}
        >
          {saving ? 'Creating…' : 'Open the decision'}
        </button>
      </form>
    </main>
  )
}

const styles = stylex.create({
  main: {
    width: '100%',
    maxWidth: 880,
    marginInline: 'auto',
    paddingInline: 24,
    paddingBlock: 42,
  },
  heading: { maxWidth: 680, marginBottom: 34 },
  kicker: {
    color: '#28704a',
    fontSize: 11,
    fontWeight: 850,
    letterSpacing: '0.13em',
    textTransform: 'uppercase',
  },
  title: {
    marginBlock: 10,
    color: '#18231c',
    fontSize: { default: 48, '@media (max-width: 600px)': 38 },
    letterSpacing: '-0.055em',
    lineHeight: 1,
  },
  lead: { color: '#59675e', fontSize: 17, lineHeight: 1.6 },
  form: { display: 'flex', flexDirection: 'column', gap: 18 },
  card: {
    padding: { default: 30, '@media (max-width: 600px)': 20 },
    borderRadius: 22,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#c7d0c7',
    backgroundColor: '#fffdf8',
  },
  step: {
    display: 'block',
    marginBottom: 22,
    color: '#31734e',
    fontSize: 11,
    fontWeight: 850,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginTop: 16,
    color: '#29372e',
    fontSize: 13,
    fontWeight: 700,
  },
  optional: { color: '#7b877e', fontSize: 11, fontWeight: 500 },
  input: {
    width: '100%',
    minHeight: 45,
    paddingInline: 13,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: { default: '#aeb9b0', ':focus': '#267049' },
    borderRadius: 11,
    outline: 'none',
    color: '#1f2b23',
    backgroundColor: '#fbfcf9',
  },
  textarea: {
    width: '100%',
    minHeight: 96,
    padding: 13,
    resize: 'vertical',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: { default: '#aeb9b0', ':focus': '#267049' },
    borderRadius: 11,
    outline: 'none',
    color: '#1f2b23',
    backgroundColor: '#fbfcf9',
  },
  secondaryButton: {
    marginTop: 16,
    padding: 10,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#43815a',
    borderRadius: 10,
    color: '#185331',
    backgroundColor: { default: '#f7fff9', ':hover': '#fff' },
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 750,
  },
  choiceRow: {
    display: 'grid',
    gridTemplateColumns: {
      default: '1fr 1fr',
      '@media (max-width: 600px)': '1fr',
    },
    gap: 12,
  },
  choice: {
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'start',
    gap: 4,
    textAlign: 'left',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#b4beb6',
    borderRadius: 14,
    color: '#455249',
    backgroundColor: '#f8f8f4',
    cursor: 'pointer',
    fontSize: 12,
  },
  choiceActive: {
    borderColor: '#2a7650',
    color: '#174e30',
    backgroundColor: '#e9f5ec',
    boxShadow: 'inset 0 0 0 1px #2a7650',
  },
  error: {
    margin: 0,
    padding: 13,
    borderRadius: 12,
    color: '#8a2d25',
    backgroundColor: '#ffebe8',
    fontSize: 13,
  },
  submitButton: {
    padding: 15,
    borderWidth: 0,
    borderRadius: 13,
    color: '#fff',
    backgroundColor: {
      default: '#17633a',
      ':hover': '#104f2d',
      ':disabled': '#8ea697',
    },
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: 15,
  },
})
