/**
 * Checks the #217 case corpus (test/coverage-cases.ts) against the engine:
 *
 * - every expression is valid, since the analysis means nothing otherwise;
 * - every finding with a witness, or a certain one, really happens: the
 *   evaluation rejects with it (uncovered), or the trace shows the
 *   fallback that caught it (covered);
 * - every failure the engine shows over a spread of data was predicted,
 *   so a case lists nothing short.
 *
 * Then the analysis over each case:
 *
 * - soundness: every failure seen over the spread is among the analysis's
 *   findings, uncovered if it rejected the evaluation, covered at the
 *   fallback the trace shows caught it;
 * - certainty: no node the analysis says always fails is shown returning a
 *   value, wherever the trace shows it evaluated;
 * - exactness: the analysis gives exactly the case's findings, no more and
 *   no fewer, each with the same certainty and covering fallback.
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
import type {
  CoverageFinding,
  CoveredFinding,
  FallbackCoverage,
  FigTreeError,
  FigTreeOptions,
  HttpClient,
  SqlConnection,
  TraceNode,
} from '../src'
import { fallbackCoverage } from '../src/authoring'
import { fragments, sections } from './coverage-cases'
import type { CoverageCase, Finding, NodePath } from './coverage-cases'

// ── The instances a case can name ───────────────────────────────────

type ClientMode = 'ok' | 'fails' | 'slow'
let clientMode: ClientMode = 'ok'

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

const twice = defineOperator({
  name: 'twice',
  category: 'math',
  parameters: { value: { type: 'number' } },
  positionalParams: ['value'],
  returns: 'number',
  evaluate: ({ value }) => value * 2,
})

const shaky = defineOperator({
  name: 'shaky',
  category: 'string',
  parameters: { value: { type: 'string' } },
  positionalParams: ['value'],
  returns: 'string',
  evaluate: ({ value }) => {
    if (value === '') throw new OperatorFailure('nothing to shake')
    return value
  },
})

const picky = defineOperator({
  name: 'picky',
  category: 'string',
  parameters: { value: { type: 'string' } },
  positionalParams: ['value'],
  returns: 'string',
  analysis: { failures: [{ code: 'operator-failure', parameter: 'value', when: { value: '' } }] },
  evaluate: ({ value }) => {
    if (value === '') throw new OperatorFailure('nothing to pick')
    return value
  },
})

const nap = defineOperator({
  name: 'nap',
  category: 'other',
  parameters: { value: { type: 'number' } },
  positionalParams: ['value'],
  returns: 'number',
  analysis: {},
  evaluate: async ({ value }) => {
    await new Promise((resolve) => setTimeout(resolve, 30))
    return value
  },
})

const instanceOptions: Record<NonNullable<CoverageCase['instance']> | 'default', FigTreeOptions> = {
  default: {},
  strict: { strictDataPaths: true },
  fragments: { fragments },
  lowerDefault: { operatorDefaults: { lower: { fallback: '' } } },
  io: { operators: io, operatorDefaults: ioDefaults },
  ioBase: {
    operators: io,
    operatorDefaults: ioDefaults,
    http: { baseEndpoint: 'https://api.test' },
  },
  host: { operators: [coreOperators, [twice, shaky, picky, nap]] },
}

const instances = new Map<string, FigTree>()

/**
 * A case's instance, carrying the case's timeout where `timed` asks for it:
 * the analysis reads its timeout from the instance, as evaluate() does.
 */
const instanceOf = (item: CoverageCase, timed: boolean): FigTree => {
  const name = item.instance ?? 'default'
  const timeout = timed ? item.timeout : undefined
  const key = `${name}:${timeout ?? ''}`
  let fig = instances.get(key)
  if (fig === undefined)
    instances.set(
      key,
      (fig = new FigTree({
        ...instanceOptions[name],
        ...(timeout !== undefined ? { timeout } : {}),
      }))
    )
  return fig
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

/**
 * Every node a trace shows returning a value, located as a finding is: its
 * code is the empty string, since it has none.
 */
const returnedIn = (root: TraceNode | undefined): Located[] => {
  const found: Located[] = []
  const visit = (entry: TraceNode, call: TraceNode | undefined) => {
    const body = entry.source?.fragment
    if (entry.status === 'value')
      found.push(
        body !== undefined
          ? { at: call!.path, code: '', fragment: body, fragmentPath: entry.path }
          : { at: entry.path, code: '' }
      )
    const next = entry.kind === 'fragment' && body === undefined ? entry : call
    for (const child of entry.children ?? []) visit(child, next)
  }
  if (root !== undefined) visit(root, undefined)
  return found
}

/**
 * Where a failure is seen: a timeout that rejects the evaluation rejects it
 * as a whole, at the root, while one a value's fallback catches is at it.
 */
const seenAt = (code: string, at: NodePath, seen: Located | Caught): NodePath =>
  code === 'timeout' && !('by' in seen) ? [] : at

const matches = (finding: Finding, seen: Located | Caught): boolean =>
  (finding.code === seen.code || finding.external === true) &&
  same(seen.at, seenAt(finding.code, finding.at, seen)) &&
  finding.fragment === seen.fragment &&
  same(finding.fragmentPath, seen.fragmentPath) &&
  (!('by' in seen) ||
    (same(finding.by, seen.by) && same(finding.byFragmentPath, seen.byFragmentPath)))

// ── Running a case ──────────────────────────────────────────────────

interface Outcome {
  rejected?: FigTreeError
  caught: Caught[]
  returned: Located[]
}

const run = async (
  item: CoverageCase,
  data: Record<string, unknown>,
  withTimeout: boolean
): Promise<Outcome> => {
  try {
    const { trace } = await instanceOf(item, withTimeout).evaluate(item.expression, {
      data,
      trace: true,
    })
    return { caught: caughtIn(trace), returned: returnedIn(trace) }
  } catch (error) {
    if (!isFigTreeError(error)) throw error
    return { rejected: error, caught: caughtIn(error.trace), returned: returnedIn(error.trace) }
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
  // Long enough that its length overflows power(2, …) and round's shift
  'x'.repeat(1100),
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
  const pool = item.options?.strictNumbers === true ? STRICT : ORDINARY
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

/** What one run over the spread showed. */
interface Seen extends Outcome {
  data: Record<string, unknown>
  /** Run under the case's timeout, with a slow client */
  timed: boolean
}

/**
 * Every run over the spread, for each way the client can behave. A case
 * with a timeout also runs under it, with a slow client where it has one,
 * which only the analysis's check reads: a case doing no I/O must never be
 * cut off.
 */
const outcomes = async (item: CoverageCase): Promise<Seen[]> => {
  const seen: Seen[] = []
  const io = item.instance === 'io' || item.instance === 'ioBase'
  const modes: ClientMode[] = io ? ['ok', 'fails'] : ['ok']
  try {
    for (const mode of modes) {
      clientMode = mode
      for (const data of spread(item))
        seen.push({ data, timed: false, ...(await run(item, data, false)) })
    }
    if (item.timeout !== undefined) {
      clientMode = 'slow'
      for (const data of spread(item))
        seen.push({ data, timed: true, ...(await run(item, data, true)) })
    }
  } finally {
    clientMode = 'ok'
  }
  return seen
}

/** Every failure seen over the spread that no finding predicts. */
const unpredicted = (item: CoverageCase, seen: Seen[]): string[] => {
  const problems: string[] = []
  const uncovered = item.uncovered ?? []
  const covered = item.covered ?? []
  for (const { data, timed, rejected, caught } of seen) {
    if (timed) continue
    const shown = JSON.stringify(data)
    if (rejected !== undefined && !uncovered.some((f) => matches(f, locate(rejected))))
      problems.push(`uncovered ${JSON.stringify(locate(rejected))} with ${shown}`)
    for (const failure of caught)
      if (!covered.some((f) => matches(f, failure)))
        problems.push(`covered ${JSON.stringify(failure)} with ${shown}`)
    if (problems.length >= 5) break
  }
  return problems
}

// ── The analysis against the engine ─────────────────────────────────

/**
 * Whether a finding's code accounts for a failure's. An external operator's
 * one `operator-failure` finding stands for whatever code its own code
 * throws ("Operator rules" in docs-dev/v3-specs/v3-fallback-coverage.md):
 * the I/O operators' requests and checks, and an undeclared host's body.
 * The deadline is the engine's, so a timeout is never its own.
 */
const EXTERNAL = new Set(['http', 'graphQL', 'sql', 'twice', 'shaky'])
const codeAccounts = (finding: CoverageFinding, seen: Located) =>
  finding.code === seen.code ||
  (finding.code === 'operator-failure' &&
    seen.code !== 'timeout' &&
    EXTERNAL.has(finding.operator ?? ''))

const accounts = (finding: CoverageFinding | CoveredFinding, seen: Located | Caught): boolean =>
  codeAccounts(finding, seen) &&
  same(seen.at, seenAt(finding.code, finding.path, seen)) &&
  finding.fragment === seen.fragment &&
  same(finding.fragmentPath, seen.fragmentPath) &&
  (!('by' in seen) ||
    ('coveredBy' in finding &&
      same(finding.coveredBy, seen.by) &&
      same(finding.coveredByFragmentPath, seen.byFragmentPath)))

/** Every failure seen over the spread that the analysis did not report. */
const unsound = (analysis: FallbackCoverage, seen: Seen[]): string[] => {
  const problems: string[] = []
  for (const { data, timed, rejected, caught } of seen) {
    const shown = `${JSON.stringify(data)}${timed ? ' under the timeout' : ''}`
    if (rejected !== undefined && !analysis.uncovered.some((f) => accounts(f, locate(rejected))))
      problems.push(`uncovered ${JSON.stringify(locate(rejected))} with ${shown}`)
    for (const failure of caught) {
      if (!analysis.covered.some((f) => accounts(f, failure)))
        problems.push(`covered ${JSON.stringify(failure)} with ${shown}`)
    }
    if (problems.length >= 5) break
  }
  return problems
}

/**
 * Every finding the analysis says always fails whenever its node is
 * reached, where the trace shows that node returning a value.
 */
const uncertain = (analysis: FallbackCoverage, seen: Seen[]): string[] => {
  const problems: string[] = []
  const certain = [...analysis.uncovered, ...analysis.covered].filter(
    (finding) => finding.certainty === 'always'
  )
  for (const { data, timed, returned } of seen) {
    if (timed) continue
    for (const finding of certain)
      if (
        returned.some(
          (node) =>
            same(node.at, finding.path) &&
            node.fragment === finding.fragment &&
            same(node.fragmentPath, finding.fragmentPath)
        )
      )
        problems.push(`${JSON.stringify(finding)} returned with ${JSON.stringify(data)}`)
    if (problems.length >= 5) break
  }
  return problems
}

/**
 * A finding as the progress count compares it: the corpus's terms mapped
 * to the analysis's. A `parameter` counts only where the corpus names one.
 */
const compared = (finding: Finding | CoverageFinding | CoveredFinding, parameter: boolean) => {
  const corpus = 'at' in finding
  return JSON.stringify({
    path: corpus ? finding.at : finding.path,
    code: finding.code,
    certainty: corpus ? (finding.will ? 'always' : 'may') : finding.certainty,
    parameter: parameter ? finding.parameter : undefined,
    fragment: finding.fragment,
    fragmentPath: finding.fragmentPath,
    by: corpus ? finding.by : 'coveredBy' in finding ? finding.coveredBy : undefined,
    byFragmentPath: corpus
      ? finding.byFragmentPath
      : 'coveredBy' in finding
        ? finding.coveredByFragmentPath
        : undefined,
  })
}

/**
 * Where a list differs from the case's: each expected finding claims one
 * actual finding, and any left over is extra.
 */
const differences = (expected: Finding[], actual: CoverageFinding[], list: string): string[] => {
  const pool = [...actual]
  const missing: string[] = []
  for (const finding of expected) {
    const parameter = finding.parameter !== undefined
    const key = compared(finding, parameter)
    const index = pool.findIndex((candidate) => compared(candidate, parameter) === key)
    if (index === -1) missing.push(`missing ${list} ${key}`)
    else pool.splice(index, 1)
  }
  return [...missing, ...pool.map((finding) => `extra ${list} ${compared(finding, true)}`)]
}

/** Every way the analysis's findings differ from the case's. */
const inexact = (item: CoverageCase, analysis: FallbackCoverage): string[] => [
  ...differences(item.uncovered ?? [], analysis.uncovered, 'uncovered'),
  ...differences(item.covered ?? [], analysis.covered, 'covered'),
]

// ── The checks ──────────────────────────────────────────────────────

for (const [section, cases] of Object.entries(sections))
  describe(section, () => {
    test.each(cases.map((item) => [item.name, item] as const))('%s', async (_name, item) => {
      const fig = instanceOf(item, false)
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

      const seen = await outcomes(item)
      expect(unpredicted(item, seen)).toEqual([])

      const analysis = await fallbackCoverage(instanceOf(item, true), item.expression, item.options)
      expect(unsound(analysis, seen)).toEqual([])
      expect(uncertain(analysis, seen)).toEqual([])
      expect(inexact(item, analysis)).toEqual([])
    })
  })
