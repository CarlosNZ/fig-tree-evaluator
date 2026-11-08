import { useEffect, useState } from 'react'
import type { FigTree } from 'fig-tree-evaluator'

/** How long the form waits after an edit before evaluating again. */
const DEBOUNCE = 300

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** A field as the form shows it, read from whatever the expression gave. */
interface Field {
  name: string
  label: string
  /** A note shown with the field, such as the rule it follows. */
  comment?: string
  type: 'select' | 'number' | 'text'
  options: string[]
  required: boolean
  visible: boolean
}

interface Form {
  title?: string
  fields: Field[]
}

/**
 * The expression's result as a form: a `fields` list, each with at least a
 * `name`. Anything else in a field is read as loosely as a form library
 * would: an unknown type is a text box, `visible` is true unless given, a
 * `comment` that isn't a string is ignored, and a field without a name is
 * left out. Null if the result isn't a form at all.
 */
const readForm = (result: unknown): Form | null => {
  if (!isRecord(result) || !Array.isArray(result.fields)) return null
  const fields = result.fields.flatMap((field): Field[] => {
    if (!isRecord(field) || typeof field.name !== 'string') return []
    const { name, label, comment, type, options, required, visible } = field
    return [
      {
        name,
        label: typeof label === 'string' ? label : name,
        comment: typeof comment === 'string' ? comment : undefined,
        type: type === 'select' || type === 'number' ? type : 'text',
        options: Array.isArray(options) ? options.map(String) : [],
        required: Boolean(required),
        visible: visible === undefined || Boolean(visible),
      },
    ]
  })
  return { title: typeof result.title === 'string' ? result.title : undefined, fields }
}

/** What the last evaluation gave: a form, a result that isn't one, or a failure. */
type Outcome = { form: Form } | { notAForm: true } | { failure: string }

const FieldInput = ({
  field,
  value,
  onChange,
}: {
  field: Field
  value: unknown
  onChange: (value: unknown) => void
}) => {
  const id = `fds-form-preview-${field.name}`
  const text = value === null || value === undefined ? '' : String(value)
  return (
    <label className="fds-config-field" htmlFor={id}>
      <span className="fds-config-label">
        {field.label}
        {field.required && (
          <span className="fds-form-preview-required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </span>
      {field.comment && <span className="fds-form-preview-comment">{field.comment}</span>}
      {field.type === 'select' ? (
        <select
          id={id}
          value={field.options.includes(text) ? text : ''}
          required={field.required}
          onChange={(event) => onChange(event.target.value || null)}
        >
          <option value="">
            {field.options.length === 0 ? 'Nothing to choose from' : 'Choose…'}
          </option>
          {field.options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type={field.type}
          value={text}
          required={field.required}
          onChange={({ target }) =>
            onChange(
              target.value === ''
                ? null
                : field.type === 'number'
                  ? target.valueAsNumber
                  : target.value
            )
          }
        />
      )}
    </label>
  )
}

/**
 * An example's expression shown as the live form it configures. Its result
 * is evaluated against the data afresh after each edit of either, and the
 * form drawn from it; filling in the form edits the data, so its rules
 * follow what's typed. A result that isn't a form, or a failure, keeps the
 * last form showing, with a note above it.
 */
export const FormPreview = ({
  figTree,
  expression,
  data,
  setData,
}: {
  figTree: FigTree
  expression: unknown
  data: Record<string, unknown>
  setData: (data: Record<string, unknown>) => void
}) => {
  const [form, setForm] = useState<Form | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [updating, setUpdating] = useState(false)

  // The evaluation is asynchronous, so a later edit's can finish first: each
  // run ignores its result once another has started
  useEffect(() => {
    let current = true
    setUpdating(true)
    const timer = setTimeout(async () => {
      let next: Outcome
      try {
        const result = await figTree.evaluate(expression, { data, trace: false })
        const read = readForm(result)
        next = read ? { form: read } : { notAForm: true }
      } catch (error) {
        next = { failure: error instanceof Error ? error.message : String(error) }
      }
      if (!current) return
      setOutcome(next)
      if ('form' in next) setForm(next.form)
      setUpdating(false)
    }, DEBOUNCE)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [figTree, expression, data])

  return (
    <div className="fds-playground-pane fds-form-preview">
      <p className="fds-form-preview-intro">
        The configuration expression defines which fields appear in this form, and the rules they
        follow. Edit the expression to change them, and the form follows.
      </p>
      {outcome && 'notAForm' in outcome && (
        <p className="fds-form-preview-note" role="status">
          The result isn't a form this preview can show: it needs a <code>fields</code> list.
        </p>
      )}
      {outcome && 'failure' in outcome && (
        <p className="fds-form-preview-note fds-form-preview-note--failed" role="status">
          The expression failed: {outcome.failure}
        </p>
      )}
      {form ? (
        <form
          className="fds-form-preview-form"
          aria-busy={updating}
          onSubmit={(event) => event.preventDefault()}
        >
          {form.title && <h3 className="fds-form-preview-title">{form.title}</h3>}
          {form.fields
            .filter(({ visible }) => visible)
            .map((field) => (
              <FieldInput
                key={field.name}
                field={field}
                value={data[field.name]}
                onChange={(value) => setData({ ...data, [field.name]: value })}
              />
            ))}
        </form>
      ) : (
        !outcome && <p className="fds-form-preview-note">Building the form…</p>
      )}
    </div>
  )
}
