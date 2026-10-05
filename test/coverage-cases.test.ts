/**
 * Checks the #217 case corpus (test/coverage-cases.ts) against the engine,
 * ahead of the analysis it is written for:
 *
 * - every expression is valid, since the analysis means nothing otherwise;
 * - every finding with a witness, or a certain one, really happens: the
 *   evaluation rejects with it (uncovered), or the trace shows the
 *   fallback that caught it (covered);
 * - every failure the engine shows over a spread of data was predicted,
 *   so a case lists nothing short.
 *
 * When the analysis exists, each case also asserts its result here.
 */
import {
  FigTree,
  OperatorFailure,
  coreOperators,
  defineOperator,
  httpOperators,
  isFigTreeError,
  sqlOperators,
} from '../src'
import type { FigTreeError, FragmentDefinition, HttpClient, SqlConnection, TraceNode } from '../src'
import { sections } from './coverage-cases'
import type { CoverageCase, Finding, NodePath } from './coverage-cases'

// ── The instances a case can name ───────────────────────────────────

let clientMode: 'ok' | 'fails' | 'slow' = 'ok'

const behave = async <T>(value: T): Promise<T> => {
  if (clientMode === 'fails') throw new OperatorFailure('the client failed')
  if (clientMode === 'slow') await new Promise((resolve) => setTimeout(resolve, 100))
  return value
}

const client: HttpClient = { request: () => behave({ n: 1, s: 'x' }) }
const connection: SqlConnection = { query: () => behave([{ a: 1, b: 2 }]) }
const io = [coreOperators, httpOperators(client), sqlOperators(connection)]
// Each run decides how the client behaves, so no response may be reused
const ioDefaults = {
  http: { noCache: true as const },
  graphQL: { noCache: true as const },
  sql: { noCache: true as const },
}

const twoNumbers = { a: { type: 'number' }, b: { type: 'number' } } as const
const fragments: Record<string, FragmentDefinition> = {
  double: {
    expression: { $multiply: ['$params.n', 2] },
    parameters: { n: { type: 'number' } },
  },
  maybeDouble: {
    expression: { $multiply: ['$params.n', 2] },
    parameters: { n: { type: ['number', 'null'] } },
  },
  ratio: { expression: { $divide: ['$params.a', '$params.b'] }, parameters: twoNumbers },
  safeRatio: {
    expression: { $divide: ['$params.a', '$params.b'], fallback: 0 },
    parameters: twoNumbers,
  },
  shout: { expression: { $upper: '$params.s' }, parameters: { s: { type: 'string' } } },
}

const twice = defineOperator({
  name: 'twice',
  category: 'math',
  description: 'Double a number',
  parameters: { value: { type: 'number' } },
  positionalParams: ['value'],
  returns: 'number',
  evaluate: ({ value }) => value * 2,
})

const shaky = defineOperator({
  name: 'shaky',
  category: 'string',
  description: 'Fails on an empty string',
  parameters: { value: { type: 'string' } },
  positionalParams: ['value'],
  returns: 'string',
  evaluate: ({ value }) => {
    if (value === '') throw new OperatorFailure('nothing to shake')
    return value
  },
})

const instances: Record<NonNullable<CoverageCase['instance']> | 'default', FigTree> = {
  default: new FigTree(),
  strict: new FigTree({ strictDataPaths: true }),
  fragments: new FigTree({ fragments }),
  lowerDefault: new FigTree({ operatorDefaults: { lower: { fallback: '' } } }),
  io: new FigTree({ operators: io, operatorDefaults: ioDefaults }),
  ioBase: new FigTree({
    operators: io,
    operatorDefaults: ioDefaults,
    http: { baseEndpoint: 'https://api.test' },
  }),
  host: new FigTree({ operators: [coreOperators, [twice, shaky]] }),
}

// ── Locating a failure the way a finding does ───────────────────────

/** Where a failure is, in a finding's terms. */
interface Located {
  at: NodePath
  code: string
  fragment?: string
  fragmentPath?: NodePath
}

/** A failure a fallback caught, read from the trace. */
interface Caught extends Located {
  by: NodePath
  byFragmentPath?: NodePath
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

const locate = (error: FigTreeError): Located => ({
  at: error.path,
  code: error.code,
  ...(error.fragment !== undefined ? { fragment: error.fragment } : {}),
  ...(error.fragmentPath !== undefined ? { fragmentPath: error.fragmentPath } : {}),
})

/**
 * Every fired fallback in a trace. Inside a fragment body a location is
 * the call's site plus the place in the body; an error raised in the body
 * carries its body path (they start at `expression`) until it escapes.
 */
const caughtIn = (root: TraceNode | undefined): Caught[] => {
  const found: Caught[] = []
  const visit = (entry: TraceNode, call: TraceNode | undefined) => {
    const body = entry.source?.fragment
    if (entry.status === 'fallback' && entry.error !== undefined) {
      const error = entry.error
      const inBody =
        body !== undefined && error.fragment === undefined && error.path[0] === 'expression'
      found.push({
        ...(inBody
          ? { at: call!.path, code: error.code, fragment: body, fragmentPath: error.path }
          : locate(error)),
        by: body !== undefined ? call!.path : entry.path,
        ...(body !== undefined ? { byFragmentPath: entry.path } : {}),
      })
    }
    const next = entry.kind === 'fragment' && body === undefined ? entry : call
    for (const child of entry.children ?? []) visit(child, next)
  }
  if (root !== undefined) visit(root, undefined)
  return found
}

const matches = (finding: Finding, seen: Located | Caught): boolean =>
  finding.code === seen.code &&
  // The deadline rejects the evaluation as a whole, at the root
  same(seen.at, finding.code === 'timeout' ? [] : finding.at) &&
  finding.fragment === seen.fragment &&
  same(finding.fragmentPath, seen.fragmentPath) &&
  (!('by' in seen) ||
    (same(finding.by, seen.by) && same(finding.byFragmentPath, seen.byFragmentPath)))

// ── Running a case ──────────────────────────────────────────────────

interface Outcome {
  rejected?: FigTreeError
  caught: Caught[]
}

const run = async (
  item: CoverageCase,
  data: Record<string, unknown>,
  withTimeout: boolean
): Promise<Outcome> => {
  const fig = instances[item.instance ?? 'default']
  const timeout = withTimeout ? item.options?.timeout : undefined
  try {
    const { trace } = await fig.evaluate(item.expression, {
      data,
      trace: true,
      ...(timeout !== undefined ? { timeout } : {}),
    })
    return { caught: caughtIn(trace) }
  } catch (error) {
    if (!isFigTreeError(error)) throw error
    return { rejected: error, caught: caughtIn(error.trace) }
  }
}

/** A witness run: the finding happens, uncovered or caught as listed. */
const witnessed = async (item: CoverageCase, finding: Finding, covered: boolean) => {
  clientMode = finding.client ?? 'ok'
  try {
    const outcome = await run(item, finding.witness ?? {}, true)
    if (covered) return outcome.caught.some((seen) => matches(finding, seen))
    return outcome.rejected !== undefined && matches(finding, locate(outcome.rejected))
  } finally {
    clientMode = 'ok'
  }
}

// ── The spread of data ──────────────────────────────────────────────

const MISSING = Symbol('missing')

const ORDINARY: unknown[] = [
  MISSING,
  null,
  0,
  1,
  -1,
  2.5,
  '',
  'a',
  'abc',
  'A',
  'b',
  '42',
  'Infinity',
  'a[',
  'g',
  'u',
  true,
  false,
  [],
  [1],
  ['a'],
  [['a']],
  {},
  { a: 1 },
]
const STRICT: unknown[] = [...ORDINARY, NaN, Infinity, 1e308, '1e308']
const MAX_RUNS = 1500

/** Every `$data` path the expression drills, as segments. */
const dataPaths = (value: unknown, found = new Map<string, string[]>()) => {
  if (typeof value === 'string' && value.startsWith('$data.'))
    found.set(value, value.slice('$data.'.length).split('.'))
  else if (Array.isArray(value)) value.forEach((element) => dataPaths(element, found))
  else if (value !== null && typeof value === 'object')
    Object.values(value).forEach((element) => dataPaths(element, found))
  return found
}

const assign = (data: Record<string, unknown>, segments: string[], value: unknown) => {
  if (value === MISSING) return
  let target = data
  for (const segment of segments.slice(0, -1)) {
    if (target[segment] === null || typeof target[segment] !== 'object') target[segment] = {}
    target = target[segment] as Record<string, unknown>
  }
  target[segments[segments.length - 1]] = value
}

/** The pool over every path: all combinations, or a fixed sample of them. */
function* spread(item: CoverageCase): Generator<Record<string, unknown>> {
  const paths = [...dataPaths(item.expression).values()]
  const pool = item.options?.numbers === 'strict' ? STRICT : ORDINARY
  const total = pool.length ** paths.length
  let seed = 7
  const next = () => (seed = (seed * 48271) % 2147483647)
  for (let i = 0; i < Math.min(total, MAX_RUNS); i++) {
    let index = total <= MAX_RUNS ? i : next() % total
    const data: Record<string, unknown> = {}
    for (const segments of paths) {
      assign(data, segments, pool[index % pool.length])
      index = Math.floor(index / pool.length)
    }
    yield data
  }
}

/** Every failure seen over the spread that no finding predicts. */
const unpredicted = async (item: CoverageCase): Promise<string[]> => {
  const problems: string[] = []
  const uncovered = item.uncovered ?? []
  const covered = item.covered ?? []
  const modes = item.instance === 'io' || item.instance === 'ioBase' ? ['ok', 'fails'] : ['ok']
  for (const mode of modes) {
    clientMode = mode as typeof clientMode
    for (const data of spread(item)) {
      const { rejected, caught } = await run(item, data, false)
      const shown = JSON.stringify(data)
      if (rejected !== undefined && !uncovered.some((f) => matches(f, locate(rejected))))
        problems.push(`uncovered ${JSON.stringify(locate(rejected))} with ${shown}`)
      for (const seen of caught)
        if (!covered.some((f) => matches(f, seen)))
          problems.push(`covered ${JSON.stringify(seen)} with ${shown}`)
      if (problems.length >= 5) break
    }
  }
  clientMode = 'ok'
  return problems
}

// ── The checks ──────────────────────────────────────────────────────

for (const [section, cases] of Object.entries(sections))
  describe(section, () => {
    test.each(cases.map((item) => [item.name, item] as const))('%s', async (_name, item) => {
      const fig = instances[item.instance ?? 'default']
      expect(fig.validate(item.expression).issues.filter((i) => i.severity === 'error')).toEqual([])

      for (const [list, covered] of [
        [item.uncovered ?? [], false],
        [item.covered ?? [], true],
      ] as const)
        for (const finding of list) {
          if (finding.witness === undefined && finding.will === undefined) {
            // Unwitnessed: a false positive the case must account for
            expect(item.note ?? item.open).toBeDefined()
            continue
          }
          const happened = await witnessed(item, finding, covered)
          if (!happened) throw new Error(`not witnessed: ${JSON.stringify(finding)}`)
        }

      expect(await unpredicted(item)).toEqual([])
    })
  })
