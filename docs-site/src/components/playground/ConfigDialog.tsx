import { useEffect, useRef, useState, type ReactNode } from 'react'
import { JsonEditor } from 'json-edit-react'
import { editorStyles } from './editorTheme'
import { json5Props } from './PlaygroundEditors'
import { fragmentsRestrictions } from './fragmentsEditor'
import { operatorDefaultsRestrictions } from './operatorDefaultsEditor'
import {
  DEFAULT_CACHE_SIZE,
  DEFAULT_CACHE_TIME,
  cacheStore,
  defaultFragments,
  playgroundFigTree,
  setCaching,
  usesCache,
  type Fragments,
  type OperatorDefaults,
  type PlaygroundConfig,
  type PlaygroundOptions,
} from './playgroundSetup'

type Headers = NonNullable<NonNullable<PlaygroundOptions['http']>['headers']>

/**
 * The panel's fields, as the reader edits them: text for the text and number
 * fields, with Authorization apart from the other headers.
 */
interface Form {
  baseEndpoint: string
  authorization: string
  headers: Headers
  gqlEndpoint: string
  gqlAuthorization: string
  gqlHeaders: Headers
  fragments: Fragments
  operatorDefaults: OperatorDefaults
  maxCacheSize: string
  maxCacheTime: string
  strictDataPaths: boolean
  timeout: string
  maxDepth: string
  maxNodes: string
  strictNumbers: boolean
}

const text = (value: unknown) => (value === undefined || value === null ? '' : String(value))

/** Headers without their Authorization, which the panel has a field of its own for. */
const otherHeaders = ({ Authorization: _, ...rest }: Headers = {}) => rest

const toForm = ({ options, fragments }: PlaygroundConfig): Form => ({
  baseEndpoint: text(options.http?.baseEndpoint),
  authorization: text(options.http?.headers?.Authorization),
  headers: otherHeaders(options.http?.headers),
  gqlEndpoint: text(options.graphQL?.endpoint),
  gqlAuthorization: text(options.graphQL?.headers?.Authorization),
  gqlHeaders: otherHeaders(options.graphQL?.headers),
  fragments,
  operatorDefaults: options.operatorDefaults ?? {},
  maxCacheSize: text(options.cache?.maxSize),
  maxCacheTime: text(options.cache?.maxTime),
  strictDataPaths: options.strictDataPaths ?? false,
  timeout: text(options.timeout),
  maxDepth: text(options.maxDepth),
  maxNodes: text(options.maxNodes),
  strictNumbers: options.coverage?.strictNumbers ?? false,
})

/** A field's text, with nothing in it as no value. */
const given = (value: string) => (value.trim() === '' ? undefined : value.trim())

/** A block with its unset entries dropped, and nothing at all if none are left. */
const block = <Block extends Record<string, unknown>>(entries: Block) => {
  const set = Object.entries(entries).filter(
    ([, value]) =>
      value !== undefined &&
      !(typeof value === 'object' && value !== null && Object.keys(value).length === 0)
  )
  return set.length === 0 ? undefined : (Object.fromEntries(set) as Partial<Block>)
}

const headersWith = (authorization: string, headers: Headers) =>
  block({ Authorization: given(authorization), ...headers }) as Headers | undefined

/** The options the form describes, or what's wrong with one of its number fields. */
const optionsFrom = (form: Form): PlaygroundOptions | string => {
  const numbers: [string, string, string][] = [
    ['maxSize', form.maxCacheSize, 'The cache size'],
    ['maxTime', form.maxCacheTime, "The cache's max time"],
    ['timeout', form.timeout, 'The timeout'],
    ['maxDepth', form.maxDepth, 'The max depth'],
    ['maxNodes', form.maxNodes, 'The max nodes'],
  ]
  const values: Record<string, number | undefined> = {}
  for (const [name, field, label] of numbers) {
    const value = given(field)
    if (value !== undefined && !Number.isFinite(Number(value))) return `${label} must be a number.`
    values[name] = value === undefined ? undefined : Number(value)
  }
  return {
    ...block({
      http: block({
        baseEndpoint: given(form.baseEndpoint),
        headers: headersWith(form.authorization, form.headers),
      }),
      graphQL: block({
        endpoint: given(form.gqlEndpoint),
        headers: headersWith(form.gqlAuthorization, form.gqlHeaders),
      }),
      cache: block({ maxSize: values.maxSize, maxTime: values.maxTime }),
      strictDataPaths: form.strictDataPaths || undefined,
      timeout: values.timeout,
      maxDepth: values.maxDepth,
      maxNodes: values.maxNodes,
      coverage: block({ strictNumbers: form.strictNumbers || undefined }),
    }),
    // Kept as it is, even empty, since `fallback: null` is a default
    ...(Object.keys(form.operatorDefaults).length > 0 && {
      operatorDefaults: form.operatorDefaults,
    }),
  }
}

/**
 * A labelled field: the label above it, or, with a `unit`, before it on the
 * same line, with the unit after it
 */
const Field = ({
  label,
  hint,
  unit,
  children,
}: {
  label: string
  hint?: string
  unit?: string
  children: ReactNode
}) => (
  <label className={`fds-config-field${unit ? ' fds-config-field--inline' : ''}`}>
    <span className="fds-config-label">
      {label} {hint && <span className="fds-config-hint">{hint}</span>}
    </span>
    {children}
    {unit && <span className="fds-config-hint">{unit}</span>}
  </label>
)

/**
 * The site's tree theme, with less padding round the tree, which sits in a
 * box of its own here rather than filling a pane
 */
const treeTheme = [editorStyles, { container: { padding: '0.1em 0.5em 0.25em 1.5em' } }]

/**
 * The trees read and write JSON5, as the Playground's editors do, but edit an
 * object or array as text in json-edit-react's own text box: the site's
 * JSON5 pane is sized for the Playground's panes, not for these
 */
const { TextEditor: _, ...treeJson5Props } = json5Props

/**
 * A checkbox and its label. The box sits in a span one line of the label
 * tall, centred in it, so it's level with the label's first line however a
 * browser draws a checkbox.
 */
const Check = ({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: () => void
  children: ReactNode
}) => (
  <label className="fds-config-check">
    <span className="fds-config-check-box">
      <input type="checkbox" checked={checked} onChange={onChange} />
    </span>
    <span>{children}</span>
  </label>
)

/** A tree editor for a block of the options, such as some headers. */
const Tree = <Data extends object>({
  data,
  setData,
  rootName,
  ...props
}: {
  data: Data
  setData: (data: Data) => void
  rootName: string
} & Partial<typeof operatorDefaultsRestrictions & typeof fragmentsRestrictions>) => (
  <div className="fds-config-tree">
    <JsonEditor
      data={data}
      setData={(next) => setData(next as Data)}
      rootName={rootName}
      collapse={Object.keys(data).length > 0 ? 1 : 0}
      showCollectionCount="when-collapsed"
      theme={treeTheme}
      baseFontSize={14}
      minWidth="100%"
      maxWidth="100%"
      {...treeJson5Props}
      {...props}
    />
  </div>
)

export interface ConfigDialogProps {
  config: PlaygroundConfig
  /** Applies and keeps the configuration; throws on one FigTree refuses. */
  onSave: (config: PlaygroundConfig) => void
  onClose: () => void
}

/**
 * The Configuration panel, as a modal dialog, open from when it mounts. It
 * edits a copy of the options and fragments, which Save applies: FigTree
 * checks them, and what it refuses shows in the panel, leaving everything as
 * it was. Cancel, Close and Escape put the copy away, Reset Fragments
 * included. A click on the backdrop doesn't, since it would lose the edits.
 */
export default function ConfigDialog({ config, onSave, onClose }: ConfigDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [form, setForm] = useState(() => toForm(config))
  const [error, setError] = useState<string | null>(null)
  const [cacheSize, setCacheSize] = useState(cacheStore.size)

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  const update = (changes: Partial<Form>) => setForm((current) => ({ ...current, ...changes }))

  const save = () => {
    const options = optionsFrom(form)
    if (typeof options === 'string') return setError(options)
    try {
      onSave({ options, fragments: form.fragments })
    } catch (refusal) {
      return setError(refusal instanceof Error ? refusal.message : String(refusal))
    }
    dialog.current?.close()
  }

  // Empties the cache at once, without waiting for Save
  const clearCache = () => {
    playgroundFigTree.clearCache()
    setCacheSize(cacheStore.size)
  }

  const caching = usesCache(form.operatorDefaults)
  // Plain data, so its serialisation is enough to compare it
  const fragmentsChanged = JSON.stringify(form.fragments) !== JSON.stringify(defaultFragments)

  return (
    <dialog
      className="fds-dialog fds-config-dialog not-content"
      ref={dialog}
      aria-labelledby="fds-config-dialog-title"
      onClose={onClose}
    >
      <div className="fds-dialog-content">
        <div className="fds-widget-toolbar">
          <h2 id="fds-config-dialog-title" className="fds-dialog-title">
            Configuration
          </h2>
          <button className="fds-widget-action" onClick={() => dialog.current?.close()}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
            Close
          </button>
        </div>

        <div className="fds-config-body">
          <section className="fds-config-section">
            <h3 className="fds-config-heading">HTTP</h3>
            <p className="fds-config-note">
              Requests are sent from your browser, so your own API only answers here if it allows
              requests from other sites (CORS).
            </p>
            <Field label="Base endpoint">
              <input
                value={form.baseEndpoint}
                onChange={(event) => update({ baseEndpoint: event.target.value })}
              />
            </Field>
            <Field label="Authorization" hint="such as Bearer <token>">
              <textarea
                value={form.authorization}
                onChange={(event) => update({ authorization: event.target.value })}
              />
            </Field>
            <Tree
              data={form.headers}
              setData={(headers) => update({ headers })}
              rootName="otherHeaders"
            />
            <details className="fds-config-more">
              <summary>GraphQL, if different</summary>
              <div className="fds-config-section">
                <Field label="Endpoint">
                  <input
                    value={form.gqlEndpoint}
                    onChange={(event) => update({ gqlEndpoint: event.target.value })}
                  />
                </Field>
                <Field label="Authorization">
                  <textarea
                    value={form.gqlAuthorization}
                    onChange={(event) => update({ gqlAuthorization: event.target.value })}
                  />
                </Field>
                <Tree
                  data={form.gqlHeaders}
                  setData={(gqlHeaders) => update({ gqlHeaders })}
                  rootName="otherHeaders"
                />
              </div>
            </details>
          </section>

          <section className="fds-config-section">
            <h3 className="fds-config-heading">Fragments</h3>
            <Tree
              data={form.fragments}
              setData={(fragments) => update({ fragments })}
              rootName="fragments"
              {...fragmentsRestrictions}
            />
            <div className="fds-config-actions">
              <button
                className="fds-widget-action"
                disabled={!fragmentsChanged}
                onClick={() => update({ fragments: defaultFragments })}
              >
                Reset fragments
              </button>
            </div>
          </section>

          <section className="fds-config-section">
            <h3 className="fds-config-heading">Operator defaults</h3>
            <Tree
              data={form.operatorDefaults}
              setData={(operatorDefaults) => update({ operatorDefaults })}
              rootName="operatorDefaults"
              {...operatorDefaultsRestrictions}
            />
          </section>

          <section className="fds-config-section">
            <h3 className="fds-config-heading">Cache</h3>
            <div className="fds-config-row fds-config-row--check">
              <Check
                checked={caching}
                // A shortcut for the operator defaults' `noCache`
                onChange={() =>
                  update({ operatorDefaults: setCaching(form.operatorDefaults, !caching) })
                }
              >
                Use the cache
              </Check>
              <Field label="Size" unit="entries">
                <input
                  inputMode="numeric"
                  placeholder={String(DEFAULT_CACHE_SIZE)}
                  value={form.maxCacheSize}
                  onChange={(event) => update({ maxCacheSize: event.target.value })}
                />
              </Field>
              <Field label="Max time" unit="seconds">
                <input
                  inputMode="numeric"
                  placeholder={String(DEFAULT_CACHE_TIME)}
                  value={form.maxCacheTime}
                  onChange={(event) => update({ maxCacheTime: event.target.value })}
                />
              </Field>
            </div>
            <div className="fds-config-cache">
              <span>
                {cacheSize} {cacheSize === 1 ? 'entry' : 'entries'} cached
              </span>
              <button className="fds-widget-action" disabled={cacheSize === 0} onClick={clearCache}>
                Clear cache
              </button>
            </div>
          </section>

          <section className="fds-config-section">
            <h3 className="fds-config-heading">Evaluation</h3>
            <Check
              checked={form.strictDataPaths}
              onChange={() => update({ strictDataPaths: !form.strictDataPaths })}
            >
              Strict data paths: a missing path is an error
            </Check>
            <details className="fds-config-more">
              <summary>Limits, none where empty</summary>
              <div className="fds-config-row">
                <Field label="Timeout" hint="ms">
                  <input
                    inputMode="numeric"
                    value={form.timeout}
                    onChange={(event) => update({ timeout: event.target.value })}
                  />
                </Field>
                <Field label="Max depth">
                  <input
                    inputMode="numeric"
                    value={form.maxDepth}
                    onChange={(event) => update({ maxDepth: event.target.value })}
                  />
                </Field>
                <Field label="Max nodes">
                  <input
                    inputMode="numeric"
                    value={form.maxNodes}
                    onChange={(event) => update({ maxNodes: event.target.value })}
                  />
                </Field>
              </div>
            </details>
          </section>

          <section className="fds-config-section">
            <h3 className="fds-config-heading">Coverage</h3>
            <Check
              checked={form.strictNumbers}
              onChange={() => update({ strictNumbers: !form.strictNumbers })}
            >
              Strict numbers: a number from the data may be NaN or infinite, and arithmetic may
              overflow
            </Check>
          </section>
        </div>

        <div className="fds-config-footer">
          {error && (
            <p className="fds-config-error" role="alert">
              {error}
            </p>
          )}
          <button className="fds-widget-action" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <button className="fds-widget-action fds-widget-action--primary" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </dialog>
  )
}
