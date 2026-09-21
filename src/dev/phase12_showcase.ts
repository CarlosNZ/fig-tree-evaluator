/**
 * Phase 12 showcase — `pnpm dev phase12_showcase`. The two diagnostic
 * surfaces: `mode: 'report'`, which degrades a failing hole instead of
 * losing the whole evaluation, and `trace`, which records what happened
 * at every node instance. Every phase closes with one of these
 * (implementation-plan working rule 7).
 *
 * Runs offline. The client is a stub whose every request 503s, which is
 * what makes the five fates of the first example visible at once.
 */
import { FigTree, coreOperators, httpOperators, OperatorFailure } from '../index'
import type { EvaluationResult, HttpClient, TraceNode } from '../index'
import { block, print, section } from './showcase'

const downClient: HttpClient = {
  request: async (req) => {
    // One route that never answers, so a branch abandoned by early
    // resolution can be told apart from one that failed and was
    // discarded — they read the same in the result and differently here
    if (req.url.includes('never-needed')) return new Promise(() => {})
    throw new OperatorFailure(`request failed (503): ${req.url}`, {
      errorData: { status: 503, url: req.url },
    })
  },
}

const fig = new FigTree({
  operators: [coreOperators, httpOperators(downClient)],
  http: { baseEndpoint: 'https://api.example.com' },
})

/** `result` beside one line per error — what report mode is for. */
const reported = async (expression: unknown, options: object = {}): Promise<string> => {
  const { result, errors } = (await fig.evaluate(expression, {
    ...options,
    mode: 'report',
  })) as EvaluationResult
  const rows = errors.map(
    (error) =>
      `\n        ✗ ${JSON.stringify(error.holePath ?? error.path)} ${error.code}: ${error.message}`
  )
  return `→ ${block(result, '      ')}${rows.join('')}`
}

/**
 * The instance tree as an indented outline. Values are elided: the point
 * of reading a trace is the SHAPE — which branch ran, what never ran at
 * all, which fallback fired — and a whole API response in the middle of
 * it hides exactly that.
 */
const outline = (node: TraceNode, depth = 0): string => {
  const mark = { value: '·', failed: '✗', fallback: '⤥', cancelled: '⊘', skipped: '⤫' }[node.status]
  const what = node.operator ?? node.ref ?? node.kind
  const named = node.var !== undefined ? `${what} (var ${node.var})` : what
  const where = node.path.length > 0 ? ` ${JSON.stringify(node.path)}` : ''
  const events = (node.events ?? []).map((event) => ` {${String(event.type)}}`).join('')
  const source = node.source !== undefined ? ` «${node.source.fragment}»` : ''
  return [
    `${'  '.repeat(depth + 4)}${mark} ${named}${where}${source}${events}`,
    ...(node.children ?? []).map((child) => outline(child, depth + 1)),
  ].join('\n')
}

const traced = async (expression: unknown, options: object = {}): Promise<string> => {
  const { result, trace } = (await fig.evaluate(expression, {
    ...options,
    trace: true,
    mode: 'report',
  })) as EvaluationResult
  return `→ ${block(result)}\n${trace === undefined ? '' : outline(trace)}`
}

const main = async () => {
  section('Report mode: five holes, five fates')

  const dashboard = {
    meta: { generated: 'v3-example' },
    user: {
      displayName: { $buildString: ['%1 %2', '$data.user.first', '$data.user.last'] },
      avatar: { $http: '/avatar', fallback: 'default.png' },
    },
    stats: {
      total: { $plus: ['$data.wins', '$data.losses'] },
      summary: { $buildString: ['Ratio: %1', { $divide: ['$data.wins', '$data.losses'] }] },
    },
    activity: { operator: 'http', url: '/activity', fallback: { $http: '/backup' } },
  }
  const data = { user: { first: 'Ada' }, wins: 10, losses: 0 }
  print(
    'one config: a null gradient, a caught fallback, a plain success, a deep failure and a failing fallback',
    dashboard,
    await reported(dashboard, { data })
  )

  section('The same expression, both ways')

  const pair = { a: { $plus: [1, 2] }, b: { $divide: [1, 0] } }
  print(
    'throw mode loses the healthy value with the failing one…',
    pair,
    await fig
      .evaluate(pair)
      .then((value) => `→ ${block(value)}`)
      .catch((error: Error) => `✗ ${error.message}`)
  )
  print('…where report mode keeps it, and says exactly what went wrong', pair, await reported(pair))

  section('Static errors are reported too, not thrown')

  const typo = { greeting: { operator: 'flibble' }, other: { $if: [true] } }
  print(
    'a host that chose resilience did not choose "resilient except for typos"',
    typo,
    await reported(typo)
  )

  section('Trace: which branch ran, and what never ran at all')

  const branching = {
    vars: { size: { $plus: [2, 3] } },
    operator: 'if',
    condition: { $greaterThan: ['$vars.size', 4] },
    then: 'large',
    else: { $http: '/expensive' },
  }
  print(
    'the var evaluates once at its declaration site; the untaken branch never runs at all',
    branching,
    await traced(branching)
  )

  section('Trace: fallbacks, failures and cancellation')

  const mixed = {
    caught: { $http: '/avatar', fallback: 'placeholder' },
    uncaught: { $http: '/activity' },
    decided: { $or: [true, { $http: '/never-needed' }] },
  }
  print(
    '⤥ a fallback answered · ✗ nothing caught it · ⊘ abandoned once the answer was known',
    mixed,
    await traced(mixed),
    'the ⊘ operand is in `errors` nowhere: cancellation is not failure'
  )

  section('Trace: iteration unrolls, one entry per element')

  const mapped = { $map: { input: [1, 2, 3], each: { $plus: ['$element', 10] } } }
  print('one static node, three instances', mapped, await traced(mapped))

  section('Trace: header names, never header values')

  const withAuth = new FigTree({
    operators: [coreOperators, httpOperators(downClient)],
    http: {
      baseEndpoint: 'https://api.example.com',
      headers: { Authorization: 'Bearer super-secret' },
    },
  })
  const { trace } = (await withAuth.evaluate(
    { operator: 'http', url: '/rates', fallback: null },
    { trace: true, mode: 'report' }
  )) as EvaluationResult
  const request = (trace?.events ?? []).find((event) => event.type === 'request')
  console.log(`      the request event: ${block(request ?? null)}`)
  console.log(
    `      the token appears nowhere in the trace: ${String(
      !JSON.stringify(trace ?? null).includes('super-secret')
    )}\n`
  )
}

void main()
