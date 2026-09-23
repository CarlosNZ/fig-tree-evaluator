/**
 * Chunk 12.2 — `trace` ("trace: true — the process" in
 * docs-dev/v3-specs/v3-evaluator-methods.md).
 *
 * Trace mirrors the INSTANCE tree: the compiled AST unrolled by
 * iteration, by fragment calls and by var evaluations. So the assertions
 * are about shape and status rather than values — which branch ran, what
 * never ran at all, which fallback fired and what it caught, what the
 * request actually was.
 *
 * Field names are implementation-settled by the spec's own note, so they
 * are asserted here as the record of what was chosen. Timings are not:
 * `elapsed` is read for presence only.
 */
import { FigTree, ErrorCodes, coreOperators, httpOperators } from '../src'
import type { EvaluationResult, FigTreeError, TraceNode } from '../src'
import type { FragmentDefinition, ValidatedOperatorDefinition } from '../src'
import { boomOp, latencyOp, sleepOp } from './fixtures/evalOperators'
import { MockHttpClient } from './helpers'
import { rejection } from './helpers/rejection'

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((clear) => clear())
})

const setup = (extra: ValidatedOperatorDefinition[] = [], options: object = {}) =>
  new FigTree({ operators: [coreOperators, boomOp(), ...extra], ...options })

const traceOf = async (
  fig: FigTree,
  expression: unknown,
  options: object = {}
): Promise<TraceNode> => {
  const { trace } = (await fig.evaluate(expression, {
    ...options,
    trace: true,
  })) as EvaluationResult
  if (trace === undefined) throw new Error('expected a trace')
  return trace
}

/** Every entry, preorder — the readable way to ask "is X in here". */
const flatten = (node: TraceNode): TraceNode[] => [node, ...(node.children ?? []).flatMap(flatten)]

const at = (node: TraceNode, path: (string | number)[]): TraceNode | undefined =>
  flatten(node).find((entry) => JSON.stringify(entry.path) === JSON.stringify(path))

// ── The envelope ────────────────────────────────────────────────────

describe('trace turns the return into the envelope, in either mode', () => {
  it('is present under throw mode, with an always-empty errors array', async () => {
    const result = (await setup().evaluate({ $plus: [1, 2] }, { trace: true })) as EvaluationResult
    expect(result.result).toBe(3)
    expect(result.errors).toEqual([])
    expect(result.trace).toBeDefined()
  })

  it('is absent when trace is off', async () => {
    const result = (await setup().evaluate(
      { $plus: [1, 2] },
      { mode: 'report' }
    )) as EvaluationResult
    expect(result.trace).toBeUndefined()
  })
})

// ── The instance tree ───────────────────────────────────────────────

describe('the tree mirrors the evaluation, not the static AST', () => {
  it('records the root with its operator, value and a timing', async () => {
    const trace = await traceOf(setup(), { $plus: [1, 2] })
    expect(trace).toMatchObject({ path: [], kind: 'operator', operator: 'plus', status: 'value' })
    expect(trace.value).toBe(3)
    expect(typeof trace.elapsed).toBe('number')
  })

  it('names the canonical operator, never the alias the author spelled', async () => {
    const trace = await traceOf(setup(), { '$+': [1, 2] })
    expect(trace.operator).toBe('plus')
  })

  it('gives a reference its own entry, carrying the string and what it resolved to', async () => {
    const trace = await traceOf(setup(), { $plus: ['$data.a', 1] }, { data: { a: 5 } })
    const ref = flatten(trace).find((entry) => entry.kind === 'reference')
    expect(ref).toMatchObject({ ref: '$data.a', status: 'value', value: 5 })
  })

  it('records a reference that resolved to null — the committed requirement', async () => {
    const trace = await traceOf(setup(), { $plus: ['$data.missing', 1] }, { data: {} })
    const ref = flatten(trace).find((entry) => entry.kind === 'reference')
    expect(ref).toMatchObject({ ref: '$data.missing', value: null })
  })

  it('unrolls an iterator: one entry per element, with the shared static path', async () => {
    const trace = await traceOf(
      setup(),
      { $map: { input: [1, 2, 3], each: { $plus: ['$element', 10] } } },
      {}
    )
    const each = flatten(trace).filter((entry) => entry.operator === 'plus')
    expect(each).toHaveLength(3)
    // One static location, three instances — the (source, path) join
    expect(new Set(each.map((entry) => JSON.stringify(entry.path))).size).toBe(1)
    expect(each.map((entry) => entry.value)).toEqual([11, 12, 13])
  })

  it('a skeleton is its own kind: a container whose holes are being filled', async () => {
    const trace = await traceOf(setup(), { a: { $plus: [1, 2] }, b: 'plain' })
    expect(trace.kind).toBe('skeleton')
    expect(at(trace, ['a'])?.operator).toBe('plus')
  })
})

describe('children are in structural order, never completion order', () => {
  it('orders by position even when the later operand finishes first', async () => {
    const slow = latencyOp('slow')
    const fig = setup([slow.definition])
    const trace = await traceOf(fig, {
      first: { operator: 'slow', value: 'a', ms: 30 },
      second: { operator: 'slow', value: 'b', ms: 0 },
    })
    // Completion order was b then a
    expect(slow.finished).toEqual(['b', 'a'])
    expect((trace.children ?? []).map((child) => child.path)).toEqual([['first'], ['second']])
  })

  it('orders iterator elements by index', async () => {
    const slow = latencyOp('slow')
    const fig = setup([slow.definition])
    const trace = await traceOf(fig, {
      $map: { input: [30, 0, 15], each: { operator: 'slow', value: '$element', ms: '$element' } },
    })
    expect(slow.finished).toEqual([0, 15, 30])
    const each = flatten(trace).filter((entry) => entry.operator === 'slow')
    expect(each.map((entry) => entry.value)).toEqual([30, 0, 15])
  })
})

// ── Statuses ────────────────────────────────────────────────────────

describe('`skipped` — laziness made visible', () => {
  it('marks the branch an `if` did not take', async () => {
    const trace = await traceOf(setup(), { $if: [true, 'yes', 'no'] })
    const taken = at(trace, ['$if', 1])
    const untaken = at(trace, ['$if', 2])
    expect(taken?.status).toBe('value')
    expect(untaken?.status).toBe('skipped')
    // A single entry with no descendants
    expect(untaken?.children).toBeUndefined()
  })

  it('marks an undemanded firstOf candidate', async () => {
    const trace = await traceOf(setup(), { $firstOf: ['first', { $plus: [1, 2] }] })
    const candidates = trace.children ?? []
    expect(candidates[0].status).toBe('value')
    expect(candidates[1].status).toBe('skipped')
  })

  it('marks a var nothing referenced — the misread-data signature', async () => {
    const trace = await traceOf(setup(), {
      vars: { used: 1, unused: { $plus: [1, 2] } },
      $plus: ['$vars.used', 1],
    })
    expect(at(trace, ['vars', 'unused'])?.status).toBe('skipped')
  })

  it('marks a fallback that never fired', async () => {
    const trace = await traceOf(setup(), { operator: 'plus', values: [1, 2], fallback: 'unused' })
    expect(at(trace, ['fallback'])?.status).toBe('skipped')
  })
})

describe('`fallback` — the only record that designed degradation happened', () => {
  it('marks the node, carries the error it caught, and keeps the value', async () => {
    const trace = await traceOf(setup(), {
      avatar: { operator: 'boom', value: 'x', fallback: 'default.png' },
    })
    const node = at(trace, ['avatar'])
    expect(node?.status).toBe('fallback')
    expect(node?.value).toBe('default.png')
    expect(node?.error?.code).toBe(ErrorCodes.operatorFailure)
    // …and the fallback's own evaluation is a child of it
    expect(at(trace, ['avatar', 'fallback'])?.status).toBe('value')
  })
})

describe('`failed` and `cancelled`', () => {
  it('marks a failing node, with the error attached', async () => {
    const { trace } = (await setup().evaluate(
      { a: { $boom: 'x' } },
      { trace: true, mode: 'report' }
    )) as EvaluationResult
    const node = at(trace as TraceNode, ['a'])
    expect(node?.status).toBe('failed')
    expect(node?.error).toBeDefined()
  })

  it('marks an operand abandoned by early resolution as cancelled, not failed', async () => {
    const slow = latencyOp('slow')
    const fig = setup([slow.definition])
    // `or` resolves on the first truthy operand and abandons the rest
    const trace = await traceOf(fig, { $or: [true, { operator: 'slow', value: 'b', ms: 40 }] })
    const abandoned = (trace.children ?? [])[1]
    expect(abandoned.status).toBe('cancelled')
  })

  it('marks a hole the shielded deadline cut off, and says it took its fallback', async () => {
    const sleep = sleepOp()
    cleanups.push(sleep.cleanup)
    const fig = setup([sleep.definition])
    const trace = await traceOf(
      fig,
      {
        greeting: { $buildString: ['Hi %1', '$data.name'], fallback: 'Hi there' },
        offers: { operator: 'sleep', ms: 300, deaf: true, fallback: [] },
      },
      { data: { name: 'Ada' }, timeout: 40 }
    )
    const offers = at(trace, ['offers'])
    expect(offers?.status).toBe('cancelled')
    expect(offers?.events).toContainEqual({ type: 'shielded-fallback' })
    // The hole that finished contributed a real value and no such event
    expect(at(trace, ['greeting'])?.status).toBe('value')
    expect(at(trace, ['greeting'])?.events).toBeUndefined()
  })
})

// ── Vars, fragments, and the (source, path) join ────────────────────

describe('a var is one entry, at its declaration site', () => {
  it('sits under the node that DECLARED it, annotated with its name', async () => {
    const trace = await traceOf(setup(), {
      vars: { country: { $plus: [1, 2] } },
      operator: 'if',
      condition: { $notEqual: ['$vars.country', null] },
      then: '$vars.country',
      else: 'Not found',
    })
    const declared = at(trace, ['vars', 'country'])
    expect(declared).toMatchObject({ var: 'country', operator: 'plus', status: 'value' })
    // One entry, not one per demand — two references read it here
    expect(flatten(trace).filter((entry) => entry.var === 'country')).toHaveLength(1)
  })

  it('records each `$vars` read as its own reference entry', async () => {
    const trace = await traceOf(setup(), {
      vars: { x: 7 },
      a: '$vars.x',
      b: '$vars.x',
    })
    const reads = flatten(trace).filter((entry) => entry.ref === '$vars.x')
    expect(reads).toHaveLength(2)
    expect(reads.every((entry) => entry.value === 7)).toBe(true)
  })
})

describe('fragment bodies carry their source', () => {
  const fragments: Record<string, FragmentDefinition> = {
    double: {
      expression: { $plus: ['$params.n', '$params.n'] },
      parameters: { n: { type: 'number' } },
    },
  }

  it('marks body entries with the fragment they came from, and the call without', async () => {
    const fig = new FigTree({ operators: [coreOperators], fragments })
    const trace = await traceOf(fig, { out: { $double: { n: 4 } } })
    const call = at(trace, ['out'])
    expect(call).toMatchObject({ kind: 'fragment', operator: 'double', status: 'value' })
    expect(call?.source).toBeUndefined()
    const body = flatten(trace).find((entry) => entry.source !== undefined)
    expect(body?.source).toEqual({ fragment: 'double' })
  })

  it('gives two call sites two body instances', async () => {
    const fig = new FigTree({ operators: [coreOperators], fragments })
    const trace = await traceOf(fig, { a: { $double: { n: 1 } }, b: { $double: { n: 2 } } })
    const bodies = flatten(trace).filter(
      (entry) => entry.source?.fragment === 'double' && entry.operator === 'plus'
    )
    expect(bodies).toHaveLength(2)
  })
})

// ── Events ──────────────────────────────────────────────────────────

describe('events', () => {
  it('records a cache miss and then a hit on the same node', async () => {
    const http = new MockHttpClient({ responses: { rates: { rate: 0.61 } } })
    const fig = new FigTree({ operators: [coreOperators, httpOperators(http)] })
    const expression = { $http: 'https://api.example.com/rates' }

    const first = await traceOf(fig, expression)
    expect(first.events).toContainEqual({ type: 'cache', hit: false })

    const second = await traceOf(fig, expression)
    expect(second.events).toContainEqual({ type: 'cache', hit: true })
    // A hit means the body never ran, so nothing else was recorded
    expect(http.callCount).toBe(1)
  })

  it('records the effective request with header NAMES only', async () => {
    const http = new MockHttpClient({ responses: { rates: { rate: 0.61 } } })
    const fig = new FigTree({
      operators: [coreOperators, httpOperators(http)],
      http: { headers: { Authorization: 'Bearer super-secret' } },
    })
    const trace = await traceOf(fig, { $http: 'https://api.example.com/rates' })
    const request = (trace.events ?? []).find((event) => event.type === 'request')
    expect(request).toMatchObject({ method: 'get', url: 'https://api.example.com/rates' })
    expect(request?.headers).toContain('Authorization')
    // The value never appears anywhere in the trace
    expect(JSON.stringify(trace)).not.toContain('super-secret')
  })

  it('records a buildString placeholder render, and a closed gap', async () => {
    const fig = setup()
    const composite = await traceOf(
      fig,
      { $buildString: ['x %1', '$data.obj'] },
      { data: { obj: { a: 1 } } }
    )
    expect(composite.events).toContainEqual({
      type: 'render',
      token: '%1',
      rendered: 'placeholder',
    })

    const gapped = await traceOf(
      fig,
      {
        $buildString: { template: '%1 %2', substitutions: ['Ada', '$data.nope'], closeGaps: true },
      },
      { data: {} }
    )
    expect(gapped.value).toBe('Ada')
    expect(gapped.events).toContainEqual({ type: 'render', token: '%2', rendered: 'gap-closed' })
  })

  it('records a runtime duplicate key in buildObject', async () => {
    const trace = await traceOf(setup(), {
      $buildObject: [
        { key: 'a', value: 1 },
        { key: 'b', value: 2 },
      ],
    })
    const built = await traceOf(setup(), {
      $buildObject: [
        { key: 'dup', value: 1 },
        { key: 'dup', value: 2 },
      ],
    })
    expect(trace.events ?? []).not.toContainEqual({ type: 'key-overwrite', key: 'dup' })
    expect(built.events).toContainEqual({ type: 'key-overwrite', key: 'dup' })
  })
})

// ── Compile warnings, and the failing run ─────────────────────────────

describe('the root echoes the compile warnings', () => {
  it('carries the unrecognized-$ warning a trace consumer would otherwise miss', async () => {
    const trace = await traceOf(setup(), { a: { $flibble: 1 } })
    expect(trace.warnings?.map((issue) => issue.code)).toContain(ErrorCodes.unrecognizedIdentifier)
  })

  it('has no warnings key on a clean expression', async () => {
    const trace = await traceOf(setup(), { $plus: [1, 2] })
    expect(trace.warnings).toBeUndefined()
  })
})

describe('a failing run keeps its diagnostics', () => {
  it('attaches the partial instance tree to the thrown error', async () => {
    const error = await rejection<FigTreeError>(
      setup().evaluate({ good: { $plus: [1, 2] }, bad: { $boom: 'x' } }, { trace: true })
    )
    const trace = error.trace as TraceNode
    expect(trace).toBeDefined()
    // Partial, but the healthy hole that did finish is in it
    expect(at(trace, ['good'])?.value).toBe(3)
    expect(at(trace, ['bad'])?.status).toBe('failed')
  })
})

// ── Composition, and the cost when off ──────────────────────────────

describe('report + trace is the editor’s combination', () => {
  it('never throws, and every failure is path-tagged in both channels', async () => {
    const { result, errors, trace } = (await setup().evaluate(
      { good: { $plus: [1, 2] }, bad: { $boom: 'x' } },
      { mode: 'report', trace: true }
    )) as EvaluationResult
    expect(result).toEqual({ good: 3, bad: null })
    expect(errors).toHaveLength(1)
    expect(errors[0].holePath).toEqual(['bad'])
    expect(at(trace as TraceNode, ['bad'])?.status).toBe('failed')
  })
})

describe('the inert fast path', () => {
  it('is off under trace, so an inert input still has a tree', async () => {
    const trace = await traceOf(setup(), { a: 1, b: [2, 3] })
    expect(trace.kind).toBe('literal')
    expect(trace.status).toBe('value')
  })
})

describe('when nothing is instantiated, there is no instance tree', () => {
  it('omits `trace` where the static gate refused the expression', async () => {
    const result = (await setup().evaluate(
      { a: { operator: 'flibble' } },
      { mode: 'report', trace: true }
    )) as EvaluationResult
    expect(result.result).toBeNull()
    expect(result.errors[0].code).toBe(ErrorCodes.unknownOperator)
    // Evaluation never began, so there are no node instances to mirror.
    // The diagnosis is entirely in `errors`, which is where a static
    // failure belongs
    expect(result.trace).toBeUndefined()
  })

  it('and likewise on the thrown error under throw mode', async () => {
    const error = await rejection<FigTreeError>(
      setup().evaluate({ a: { operator: 'flibble' } }, { trace: true })
    )
    expect(error.trace).toBeUndefined()
    expect(error.issues?.length).toBeGreaterThan(0)
  })
})
