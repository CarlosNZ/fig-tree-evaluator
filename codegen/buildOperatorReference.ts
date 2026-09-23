/**
 * Builds `docs-artifacts/figtree-v3-operators.html` — the one-page operator
 * reference published as a Claude artifact (registered in
 * docs-dev/artifacts.md).
 *
 * Everything the page says about a *registered* operator is read out of its
 * definition: description, aliases, parameter types, defaults, delivery
 * modes, truthiness positions, constraints and `returns`. Operators whose
 * definitions have not landed yet are carried in `PENDING` below, sourced
 * from the parameter passes, and each entry is **deleted** as its operator
 * arrives — the build fails if a pending entry names a registered operator,
 * so the page cannot quietly keep describing a spec where an
 * implementation now exists.
 *
 * The page follows the package's own data rather than restating it: the
 * sections and their labels are editor-hints' `categoryHints`, in their
 * `order`; each operator sits in its definition's `category`, in
 * registration order. A newly registered operator therefore appears without
 * anyone listing it. Only the one-line note under each section heading is
 * this page's own.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { coreOperators } from '../src/operators/index'
import { httpOperators, sqlOperators } from '../src/operators/io'
import { categoryHints } from '../src/editor-hints'
import type {
  OperatorCategory,
  ValidatedOperatorDefinition,
  ValidatedParameter,
} from '../src/operatorDefinition'
import type { Constraints, ExpectedType } from '../src/typeCheck'

const here = dirname(fileURLToPath(import.meta.url))
const TEMPLATE = resolve(here, 'templates/operatorReference.html')
const OUTPUT = resolve(here, '../docs-artifacts/figtree-v3-operators.html')

/** The one-line note under each section heading. */
const NOTES: Record<OperatorCategory, string> = {
  logic: 'Short-circuiting is delivery metadata, not operator code',
  comparison: 'Equality is total; ordering propagates null',
  math: 'Numbers only — no coercion, ever',
  string: 'Renderers take anything; value operators take strict strings',
  array: 'Elements evaluate in parallel, always',
  data: 'For dynamic paths — a literal "$data.a.b" is sugar for get',
  io: 'Registered via httpOperators(client) / sqlOperators(connection), never in core',
  other: '',
}

/** Section key, label and note, in listing order. */
const GROUPS: [string, string, string][] = Object.entries(categoryHints)
  .sort(([, a], [, b]) => a.order - b.order)
  .map(([key, { displayName }]) => [key, displayName, NOTES[key as OperatorCategory]])

type PageParam = {
  n: string
  t: string
  r: boolean
  def?: string | null
  ev: string | null
  tr: boolean
  d: string | null
}

type PageOperator = {
  n: string
  a?: string
  g: string
  st: string
  ret: string
  pos: string[]
  d: string
  p: PageParam[]
}

/** A spec-sourced page entry, which names its own section. */
type PendingEntry = PageOperator

/**
 * Spec-sourced entries for operators not yet registered. `st` is the
 * implementation-plan phase that lands each one; `literal` is grammar
 * rather than a definition, so its entry is permanent.
 *
 * DELETE an entry when its operator registers. Element types stay in the
 * parameter descriptions rather than the type column, matching what the
 * derived half can actually say: a definition declares `array`, and the
 * element rule lives in its `constraints` or its prose.
 */
const PENDING: Record<string, PendingEntry> = {
  literal: {
    n: 'literal',
    g: 'other',
    st: 'grammar',
    ret: 'any',
    pos: [],
    d: 'Quote a value — the compile boundary: its contents are never compiled, validated or evaluated',
    p: [
      {
        n: 'value',
        t: 'any',
        r: true,
        ev: null,
        tr: false,
        d: 'The payload is the content itself, never read as a positional list or a named map',
      },
    ],
  },
}

/**
 * Metadata type → the page's notation. Literal unions get their quotes
 * back.
 */
const formatType = (type: ExpectedType): string => {
  if (Array.isArray(type)) return type.map(formatType).join(' | ')
  if (typeof type === 'object' && type !== null && 'literal' in type)
    return type.literal.map((m) => (typeof m === 'string' ? `'${m}'` : String(m))).join(' | ')
  return String(type)
}

/**
 * An `array` parameter whose element rule is declared as a `homogeneous`
 * constraint prints it: `array[number | string]`. The homogeneity itself
 * lives in the parameter's own description, which is where a reader can be
 * told that mixing the two is the error.
 */
const withElements = (type: string, constraints?: Constraints): string => {
  const homogeneous = constraints?.homogeneous
  if (!homogeneous?.length || type !== 'array') return type
  return `array[${homogeneous.map(formatType).join(' | ')}]`
}

const fromDefinition = (op: ValidatedOperatorDefinition): PageOperator => ({
  n: op.name,
  ...(op.alias ? { a: op.alias } : {}),
  g: op.category,
  st: 'live',
  ret: formatType(op.returns),
  pos: op.positionalParams ?? [],
  d: op.description ?? '',
  p: Object.entries(op.parameters).map(([name, p]: [string, ValidatedParameter]) => {
    return {
      n: name,
      t: withElements(formatType(p.type), p.constraints),
      r: p.required,
      // A `default` key is what separates "has a runtime default" from
      // "presence-sensitive", so its absence has to survive into the page
      ...('default' in p ? { def: JSON.stringify(p.default) ?? String(p.default) } : {}),
      ev: p.evaluation && p.evaluation !== 'eager' ? p.evaluation : null,
      tr: p.truthiness === true,
      d: p.description ?? null,
    }
  }),
})

const build = (): PageOperator[] => {
  // The I/O operators are factories, never members of `coreOperators` — a
  // host only gets them by wiring a client. The reference documents them
  // all the same, so it builds them over a stub that is never called
  const unreachable = () => {
    throw new Error('the reference never evaluates')
  }
  const registered = [
    ...coreOperators,
    ...httpOperators({ request: unreachable }),
    ...sqlOperators({ query: unreachable }),
  ]
  const names = new Set(registered.map((op) => op.name))
  const problems: string[] = []

  for (const name of Object.keys(PENDING))
    if (names.has(name))
      problems.push(
        `'${name}' has a definition now — delete its PENDING entry so the page reads from the code`
      )
  const ops = [...registered.map(fromDefinition), ...Object.values(PENDING)]
  const sections = new Set(GROUPS.map(([key]) => key))
  for (const op of ops)
    if (!sections.has(op.g)) problems.push(`'${op.n}' is in '${op.g}', which has no section`)

  if (problems.length) {
    console.error('Operator reference is out of step with the registry:\n')
    problems.forEach((p) => console.error(`  · ${p}`))
    process.exit(1)
  }
  return ops
}

const ops = build()
const liveCount = ops.filter((op) => op.st === 'live').length

const data = {
  groups: GROUPS,
  ops,
  meta: {
    generated: new Date().toISOString().slice(0, 10),
    live: liveCount,
    pending: ops.length - liveCount,
  },
}

const template = readFileSync(TEMPLATE, 'utf8')
if (!template.includes('__PAGE_DATA__'))
  throw new Error(`${TEMPLATE} has no __PAGE_DATA__ placeholder`)

writeFileSync(OUTPUT, template.replace('__PAGE_DATA__', JSON.stringify(data)), 'utf8')

const core = ops.filter((op) => op.g !== 'io').length
console.log(
  `docs-artifacts/figtree-v3-operators.html — ${core} core + ${ops.length - core} I/O, ` +
    `${liveCount} registered, ${ops.reduce((n, op) => n + op.p.length, 0)} parameters`
)
