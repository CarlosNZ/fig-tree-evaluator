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
 * `CANONICAL` is the running order and the completeness check: every
 * registered operator must appear in it, so a newly registered operator
 * that nobody listed fails the build rather than vanishing from the page.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { coreOperators } from '../src/operators/index'
import { httpOperators, sqlOperators } from '../src/operators/io'
import type { ValidatedOperatorDefinition, ValidatedParameter } from '../src/operatorDefinition'
import type { Constraints, ExpectedType } from '../src/typeCheck'

const here = dirname(fileURLToPath(import.meta.url))
const TEMPLATE = resolve(here, 'templates/operatorReference.html')
const OUTPUT = resolve(here, '../docs-artifacts/figtree-v3-operators.html')

/** Group keys, labels, and the one-line note each section carries. */
const GROUPS: [string, string, string][] = [
  ['logic', 'Logic & control', 'Short-circuiting is delivery metadata, not operator code'],
  ['comparison', 'Comparison', 'Equality is total; ordering propagates null'],
  ['math', 'Arithmetic & math', 'Numbers only — no coercion, ever'],
  ['string', 'String', 'Renderers take anything; value operators take strict strings'],
  ['array', 'Arrays & iteration', 'Elements evaluate in parallel, always'],
  ['data', 'Data & objects', 'For dynamic paths — a literal "$data.a.b" is sugar for get'],
  ['special', 'Special', ''],
  ['io', 'I/O', 'Registered via httpOperators(client) / sqlOperators(connection), never in core'],
]

/**
 * Canonical-list order ("The canonical list" in
 * docs-dev/v3-specs/v3-api.md).
 */
const CANONICAL: [string, string][] = [
  ['and', 'logic'],
  ['or', 'logic'],
  ['not', 'logic'],
  ['if', 'logic'],
  ['match', 'logic'],
  ['firstOf', 'logic'],
  ['equal', 'comparison'],
  ['notEqual', 'comparison'],
  ['greaterThan', 'comparison'],
  ['greaterThanOrEqual', 'comparison'],
  ['lessThan', 'comparison'],
  ['lessThanOrEqual', 'comparison'],
  ['plus', 'math'],
  ['subtract', 'math'],
  ['multiply', 'math'],
  ['divide', 'math'],
  ['modulo', 'math'],
  ['power', 'math'],
  ['round', 'math'],
  ['floor', 'math'],
  ['ceil', 'math'],
  ['min', 'math'],
  ['max', 'math'],
  ['abs', 'math'],
  ['buildString', 'string'],
  ['split', 'string'],
  ['join', 'string'],
  ['lower', 'string'],
  ['upper', 'string'],
  ['trim', 'string'],
  ['regex', 'string'],
  ['length', 'array'],
  ['map', 'array'],
  ['filter', 'array'],
  ['find', 'array'],
  ['some', 'array'],
  ['every', 'array'],
  ['get', 'data'],
  ['buildObject', 'data'],
  ['literal', 'special'],
  ['convert', 'special'],
  ['http', 'io'],
  ['graphQL', 'io'],
  ['sql', 'io'],
]

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

/**
 * A pending operator's page entry, minus the group the canonical list
 * gives it.
 */
type PendingEntry = Omit<PageOperator, 'g'>

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

const fromDefinition = (op: ValidatedOperatorDefinition, group: string): PageOperator => ({
  n: op.name,
  ...(op.alias ? { a: op.alias } : {}),
  g: group,
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
  const live = new Map<string, ValidatedOperatorDefinition>(
    [
      ...coreOperators,
      ...httpOperators({ request: unreachable }),
      ...sqlOperators({ query: unreachable }),
    ].map((op) => [op.name, op])
  )
  const listed = new Set(CANONICAL.map(([name]) => name))
  const problems: string[] = []

  for (const name of live.keys()) {
    if (!listed.has(name))
      problems.push(
        `'${name}' is registered but missing from CANONICAL — add it in canonical-list order`
      )
  }
  for (const name of Object.keys(PENDING)) {
    if (live.has(name))
      problems.push(
        `'${name}' has a definition now — delete its PENDING entry so the page reads from the code`
      )
    if (!listed.has(name)) problems.push(`PENDING '${name}' is not in CANONICAL`)
  }

  const ops = CANONICAL.map(([name, group]) => {
    const definition = live.get(name)
    if (definition) return fromDefinition(definition, group)
    const pending = PENDING[name]
    if (pending) return { ...pending, g: group }
    problems.push(`'${name}' has neither a definition nor a PENDING entry`)
    return null
  }).filter((op): op is PageOperator => op !== null)

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
