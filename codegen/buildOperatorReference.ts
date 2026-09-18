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
  buildString: {
    n: 'buildString',
    st: '7.2',
    ret: 'string',
    pos: ['template', '...substitutions'],
    d: 'Render a template, filling its tokens — the result is always a string',
    p: [
      {
        n: 'template',
        t: 'string | null',
        r: true,
        ev: null,
        tr: false,
        d: 'The text, with %N or {{name}} tokens; in a literal template, {{$data.x}} is that reference',
      },
      {
        n: 'substitutions',
        t: 'array | object',
        r: false,
        def: '[]',
        ev: null,
        tr: false,
        d: 'An array pairs with %N tokens, an object with {{name}} tokens; mode dispatches on which arrives',
      },
      {
        n: 'trim',
        t: 'boolean',
        r: false,
        def: 'false',
        ev: null,
        tr: false,
        d: 'Trim the rendered result',
      },
      {
        n: 'closeGaps',
        t: 'boolean',
        r: false,
        def: 'false',
        ev: null,
        tr: false,
        d: 'Close the whitespace gap an empty substitution leaves behind',
      },
      {
        n: 'nullValueDefault',
        t: 'string | number | boolean',
        r: false,
        ev: 'lazy',
        tr: false,
        d: 'Rendered in place of a null substitution, instead of ""',
      },
    ],
  },
  join: {
    n: 'join',
    st: '7.2',
    ret: 'string',
    pos: ['...values'],
    d: 'Render array elements to text and concatenate them with a delimiter',
    p: [
      {
        n: 'values',
        t: 'array',
        r: true,
        ev: null,
        tr: false,
        d: 'Elements of any type, rendered by the stringification table; a null renders "" and still occupies its slot',
      },
      {
        n: 'delimiter',
        t: 'string',
        r: false,
        def: '" "',
        ev: null,
        tr: false,
        d: 'Placed between each adjacent pair — operatorDefaults-friendly',
      },
      {
        n: 'nullValueDefault',
        t: 'string | number | boolean',
        r: false,
        ev: 'lazy',
        tr: false,
        d: 'Rendered in place of a null element, instead of ""',
      },
    ],
  },
  regex: {
    n: 'regex',
    st: '7.2',
    ret: 'boolean | string | array',
    pos: ['value', 'pattern'],
    d: 'Test, extract or match a string against a regular expression',
    p: [
      { n: 'value', t: 'string | null', r: true, ev: null, tr: false, d: 'The subject string' },
      {
        n: 'pattern',
        t: 'string | null',
        r: true,
        ev: null,
        tr: false,
        d: 'The regular expression source',
      },
      {
        n: 'flags',
        t: 'string',
        r: false,
        def: '""',
        ev: null,
        tr: false,
        d: 'Standard regex flags',
      },
      {
        n: 'mode',
        t: "'test' | 'extract' | 'match'",
        r: false,
        def: '"test"',
        ev: null,
        tr: false,
        d: 'test gives a boolean, extract the first capture, match every match',
      },
      {
        n: 'noMatchDefault',
        t: 'any',
        r: false,
        def: 'null',
        ev: 'lazy',
        tr: false,
        d: 'Returned on an extract no-match — a matched empty string still passes through',
      },
    ],
  },
  ...iterators(),
  get: {
    n: 'get',
    st: '7.1',
    ret: 'any',
    pos: ['path', 'missingPathDefault'],
    d: 'Read a dynamic path out of the evaluation data, or out of a supplied object',
    p: [
      {
        n: 'path',
        t: 'string | array | null',
        r: true,
        ev: null,
        tr: false,
        d: 'Dot and bracket segments, plus the [*] projection — the shared path grammar',
      },
      {
        n: 'from',
        t: 'any',
        r: false,
        def: 'the merged evaluation data',
        ev: null,
        tr: false,
        d: 'The object searched instead of the evaluation data — replace, never merge',
      },
      {
        n: 'missingPathDefault',
        t: 'any',
        r: false,
        ev: 'lazy',
        tr: false,
        d: 'Fires on a missing path only — a stored null passes through untouched',
      },
    ],
  },
  buildObject: {
    n: 'buildObject',
    st: '7.1',
    ret: 'object',
    pos: ['...entries'],
    d: 'Assemble an object from computed key/value entries',
    p: [
      {
        n: 'entries',
        t: 'array',
        r: true,
        ev: null,
        tr: false,
        d: '{ key, value } objects — key takes string | number | boolean, value takes any, and a null value keeps its key',
      },
    ],
  },
  literal: {
    n: 'literal',
    st: 'grammar',
    ret: 'any',
    pos: [],
    d: 'Quote a value — the parse boundary: its contents are never parsed, validated or evaluated',
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
  http: {
    n: 'http',
    st: '9.3',
    ret: 'any',
    pos: ['url'],
    d: 'One HTTP request — GET or POST, with no method-pinning aliases',
    p: [
      {
        n: 'url',
        t: 'string',
        r: true,
        ev: null,
        tr: false,
        d: 'An address is never manufactured from absence: null here is a type error',
      },
      {
        n: 'method',
        t: "'get' | 'post'",
        r: false,
        def: '"get"',
        ev: null,
        tr: false,
        d: 'PUT / PATCH / DELETE are a literal-type extension away',
      },
      {
        n: 'query',
        t: 'object',
        r: false,
        ev: null,
        tr: false,
        d: 'Query-string pairs; a null value omits its pair entirely',
      },
      {
        n: 'body',
        t: 'JSON value (excl. null)',
        r: false,
        ev: null,
        tr: false,
        d: 'A whole-null body means no body at all; nulls inside a present body serialize as JSON null',
      },
      {
        n: 'headers',
        t: 'object',
        r: false,
        ev: null,
        tr: false,
        d: 'A null value omits its pair, removing an instance-default header',
      },
      {
        n: 'returnPath',
        t: 'string | array',
        r: false,
        ev: null,
        tr: false,
        d: 'Drill into the response instead of returning all of it',
      },
      {
        n: 'timeout',
        t: 'integer (ms)',
        r: false,
        ev: null,
        tr: false,
        d: 'Per-request bound; expiry is an ordinary failure a fallback can catch',
      },
    ],
  },
  graphQL: {
    n: 'graphQL',
    st: '9.3',
    ret: 'any',
    pos: ['query', 'variables'],
    d: 'One GraphQL query, implemented on the http core — 200-with-errors is a failure',
    p: [
      { n: 'query', t: 'string', r: true, ev: null, tr: false, d: 'The query document' },
      {
        n: 'variables',
        t: 'object',
        r: false,
        ev: null,
        tr: false,
        d: 'Values carried as JSON, so a null is a nullable argument, not an omission',
      },
      {
        n: 'url',
        t: 'string',
        r: false,
        def: 'the graphQL.endpoint option',
        ev: null,
        tr: false,
        d: 'Overrides the connection endpoint for this node',
      },
      { n: 'headers', t: 'object', r: false, ev: null, tr: false, d: 'As http.headers' },
      {
        n: 'returnPath',
        t: 'string | array',
        r: false,
        ev: null,
        tr: false,
        d: 'Drilling within the data field, exactly v2 scope',
      },
      { n: 'timeout', t: 'integer (ms)', r: false, ev: null, tr: false, d: 'Per-request bound' },
    ],
  },
  sql: {
    n: 'sql',
    st: '9.3',
    ret: 'any',
    pos: ['query', '...values'],
    d: 'One parameterized SQL query — the injected connection determines the dialect',
    p: [
      {
        n: 'query',
        t: 'string',
        r: true,
        ev: null,
        tr: false,
        d: 'The statement, with the driver placeholders it expects',
      },
      {
        n: 'values',
        t: 'array | object',
        r: false,
        ev: null,
        tr: false,
        d: 'Bind values — an array binds positionally, an object by name; a null goes to the wire as SQL NULL',
      },
      {
        n: 'shape',
        t: "'rows' | 'row' | 'column' | 'value'",
        r: false,
        def: '"rows"',
        ev: null,
        tr: false,
        d: 'rows gives every row, row the first, column one column, value a single cell',
      },
      {
        n: 'noRowDefault',
        t: 'any',
        r: false,
        def: 'null',
        ev: 'lazy',
        tr: false,
        d: "Returned for the 'row' and 'value' shapes when the result set is empty",
      },
      { n: 'timeout', t: 'integer (ms)', r: false, ev: null, tr: false, d: 'Per-request bound' },
    ],
  },
}

/** The five iterators share one contract, so their entries are generated. */
function iterators(): Record<string, PendingEntry> {
  const common = (extra: string): PageParam[] => [
    {
      n: 'input',
      t: 'array',
      r: true,
      ev: null,
      tr: false,
      d: `The collection${extra}; a null input is a type error unless nullInputDefault is supplied`,
    },
    {
      n: 'each',
      t: 'any',
      r: true,
      ev: 'perElement',
      tr: false,
      d: 'Evaluated once per element, with $element and $index bound',
    },
    {
      n: 'as',
      t: 'string',
      r: false,
      ev: null,
      tr: false,
      d: "Rename the bindings: as: 'row' gives $row and $rowIndex",
    },
    {
      n: 'nullInputDefault',
      t: 'array',
      r: false,
      ev: 'lazy',
      tr: false,
      d: 'Used as the collection when input evaluates to null — typically []',
    },
  ]

  /** The four predicate iterators read `each` as a truthiness position. */
  const predicate = (params: PageParam[]): PageParam[] =>
    params.map((p) =>
      p.n === 'each'
        ? { ...p, tr: true, d: 'The predicate, per element — a truthiness position' }
        : p
    )

  const find = predicate(common(' searched, in order'))
  find.push({
    n: 'noMatchDefault',
    t: 'any',
    r: false,
    def: 'null',
    ev: 'lazy',
    tr: false,
    d: 'Fires on no-match only — a found null element passes through unchanged',
  })

  return {
    map: {
      n: 'map',
      st: '6.1',
      ret: 'array',
      pos: ['input', 'each'],
      d: 'Apply an expression to every element — results in input order, same length',
      p: common(''),
    },
    filter: {
      n: 'filter',
      st: '6.1',
      ret: 'array',
      pos: ['input', 'each'],
      d: 'Keep the original elements whose predicate is truthy',
      p: predicate(common('')),
    },
    find: {
      n: 'find',
      st: '6.1',
      ret: 'any',
      pos: ['input', 'each'],
      d: 'The first element whose predicate is truthy — the element, never its index',
      p: find,
    },
    some: {
      n: 'some',
      st: '6.1',
      ret: 'boolean',
      pos: ['input', 'each'],
      d: "True when any element's predicate is truthy — or, with the list factored into data",
      p: predicate(common('; empty input is false, the quantifier identity')),
    },
    every: {
      n: 'every',
      st: '6.1',
      ret: 'boolean',
      pos: ['input', 'each'],
      d: "True when every element's predicate is truthy — and, with the list factored into data",
      p: predicate(common('; empty input is true, the quantifier identity')),
    },
  }
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
  const live = new Map<string, ValidatedOperatorDefinition>(
    coreOperators.map((op) => [op.name, op])
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
