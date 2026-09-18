/**
 * Phase-5.0 white-box suite: the element- and entry-addressable parameter
 * shapes ("Evaluation modes" in docs-dev/v3-specs/v3-operator-contract.md).
 *
 * A `lazyElements` / `race` / `lazyEntries` parameter needs one demandable
 * unit per element or entry, which a skeleton's *maximal* holes cannot
 * express: a partly-constant element dissolves into the enclosing shape and
 * stops being a node at all. These suites pin what the parser produces
 * instead, and — just as load-bearing — what it deliberately still does
 * NOT produce, since an all-constant literal must stay a ConstantNode for
 * the `validate` hooks (which see constant parameters only) to keep working.
 */
import { FigTree } from '../src'
import { parseExpression } from '../src/parse'
import type { CompiledNode, ElementsNode, EntriesNode, OperatorNode, ParseArtifact } from '../src/parse'
import { makeParseRegistry, noFragments, parseOps } from './fixtures/parseRegistry'

const registry = makeParseRegistry()
const parse = (input: unknown): ParseArtifact => parseExpression(input, registry, noFragments)

/** The compiled value of one parameter of a root operator node. */
const param = (input: unknown, name: string): CompiledNode =>
  (parse(input).root as OperatorNode).params[name]

/** Both layers, as an author sees them. */
const fig = new FigTree({ operators: [parseOps()] })
const allCodes = (input: unknown) => fig.validate(input).issues.map((issue) => issue.code)

// ── elements: lazyElements and race ─────────────────────────────────

describe('a literal array at an element-addressable parameter', () => {
  test('compiles to one node per element, not to a skeleton', () => {
    const values = param({ $firstOf: ['$data.nickname', 'Anonymous'] }, 'values') as ElementsNode
    expect(values.kind).toBe('elements')
    expect(values.nodes.map((n) => n.kind)).toEqual(['reference', 'constant'])
  })

  test('a partly-constant element stays one node — the case a skeleton loses', () => {
    // As a skeleton this element would dissolve into the enclosing shape,
    // leaving a hole at ['values', 1, 'name'] and no element-1 node at all
    const values = param(
      { $firstOf: ['a', { name: '$data.n' }, '$data.b'] },
      'values'
    ) as ElementsNode
    expect(values.nodes).toHaveLength(3)
    expect(values.nodes.map((n) => n.kind)).toEqual(['constant', 'skeleton', 'reference'])
  })

  test('race gets the same shape as lazyElements', () => {
    const values = param({ $or: ['$data.isAdmin', { $http: 'https://x.test' }] }, 'values')
    expect(values.kind).toBe('elements')
    expect((values as ElementsNode).nodes).toHaveLength(2)
  })

  test('the canonical face and the shorthand face agree', () => {
    const shorthand = param({ $firstOf: ['$data.a', 1] }, 'values') as ElementsNode
    const canonical = param(
      { operator: 'firstOf', values: ['$data.a', 1] },
      'values'
    ) as ElementsNode
    expect(canonical.kind).toBe(shorthand.kind)
    expect(canonical.nodes.map((n) => n.kind)).toEqual(shorthand.nodes.map((n) => n.kind))
  })
})

describe('what stays a plain constant', () => {
  test('an all-constant array — so validate hooks still see the literal', () => {
    expect(param({ $firstOf: ['a', 'b'] }, 'values').kind).toBe('constant')
    expect(param({ $or: [true, false] }, 'values').kind).toBe('constant')
  })

  test('an empty array, which is what the dead-expression warnings read', () => {
    const values = param({ $or: [] }, 'values')
    expect(values.kind).toBe('constant')
    expect((values as { value: unknown }).value).toEqual([])
  })

  test('a dynamic value is left whole for the runtime degeneration rule', () => {
    expect(param({ $or: '$data.checks' }, 'values').kind).toBe('reference')
    expect(param({ $firstOf: { $plus: [1, 2] } }, 'values').kind).toBe('operator')
  })
})

test('an element index is its position in the parameter, not in the payload', () => {
  // `pick` binds a leading `label` before its rest slice, so element 0 of
  // `values` sits at authored index 1. Deriving the index from the path
  // would silently misreport it — and race blames the lowest INDEX operand
  const values = param({ $pick: ['tag', '$data.a', '$data.b'] }, 'values') as ElementsNode
  expect(values.nodes).toHaveLength(2)
  // Authored at indices 1 and 2; elements 0 and 1 of the parameter. The
  // paths keep the authored spelling (that is what errors are tagged with),
  // so the two numberings really do disagree here
  expect(values.nodes.map((n) => n.path)).toEqual([
    ['$pick', 1],
    ['$pick', 2],
  ])
})

// ── entries: lazyEntries ────────────────────────────────────────────

describe('a literal map at an entry-addressable parameter', () => {
  test('compiles to one node per entry', () => {
    const branches = param(
      { $match: { value: '$data.status', branches: { open: '$data.a', shut: 'Closed' } } },
      'branches'
    ) as EntriesNode
    expect(branches.kind).toBe('entries')
    expect(Object.keys(branches.entries)).toEqual(['open', 'shut'])
    expect(branches.entries.open.kind).toBe('reference')
  })

  test('an all-constant map stays a constant', () => {
    const branches = param(
      { $match: { value: '$data.status', branches: { open: 'Open', shut: 'Closed' } } },
      'branches'
    )
    expect(branches.kind).toBe('constant')
  })

  test('a map that reads as a node takes the dynamic face instead', () => {
    const branches = param(
      { $match: { value: '$data.s', branches: { $plus: ['$data.a', '$data.b'] } } },
      'branches'
    )
    expect(branches.kind).toBe('operator')
  })

  test('a branch key named `operator` fails loudly rather than reading as a branch', () => {
    // The mode decision runs the standard classification, so the map reads
    // as a node — malformed, or (as here) naming no registered operator.
    // The recorded escape is to supply the map dynamically
    const issues = parse({
      $match: { value: '$data.s', branches: { operator: 'Open', shut: '$data.x' } },
    }).issues.map((s) => s.issue)
    expect(issues.some((issue) => issue.severity === 'error')).toBe(true)
    expect(issues.map((issue) => issue.code)).toContain('unknown-operator')
  })

  test('branch keys obey the ordinary plain-object rules', () => {
    const branches = param(
      {
        $match: {
          value: '$data.s',
          branches: { '//': 'a note', open: '$data.a', shut: undefined },
        },
      },
      'branches'
    ) as EntriesNode
    expect(Object.keys(branches.entries)).toEqual(['open'])
  })

  test('a vars block on the map is consumed and carried, not dropped', () => {
    const branches = param(
      {
        $match: {
          value: '$data.s',
          branches: { vars: { prefix: '$data.p' }, open: '$vars.prefix' },
        },
      },
      'branches'
    ) as EntriesNode
    expect(Object.keys(branches.entries)).toEqual(['open'])
    expect(branches.vars).toBeDefined()
    expect(Object.keys(branches.vars!)).toEqual(['prefix'])
  })
})

// ── the shapes are structure, not work ──────────────────────────────

describe('counts and depth', () => {
  test('nodeCount does not count the new shapes — they are structure', () => {
    // one operator + one reference, exactly as the `plus` equivalent
    expect(parse({ $plus: [1, '$data.x'] }).nodeCount).toBe(2)
    expect(parse({ $firstOf: [1, '$data.x'] }).nodeCount).toBe(2)
    expect(parse({ $or: [1, '$data.x'] }).nodeCount).toBe(2)
    expect(parse({ $match: { value: 1, branches: { a: '$data.x' } } }).nodeCount).toBe(2)
  })

  test('maxDepth is the same through either face', () => {
    expect(parse({ $plus: [1, '$data.x'] }).maxDepth).toBe(
      parse({ operator: 'plus', values: [1, '$data.x'] }).maxDepth
    )
    expect(parse({ $firstOf: [1, '$data.x'] }).maxDepth).toBe(
      parse({ operator: 'firstOf', values: [1, '$data.x'] }).maxDepth
    )
  })
})

// ── scope resolution reaches inside them ────────────────────────────

describe('static scope checking descends into the new shapes', () => {
  test('an unresolved var inside an element is reported', () => {
    expect(allCodes({ $firstOf: ['$vars.nope', 'fallback'] })).toContain('unresolved-var')
    expect(allCodes({ $or: ['$data.a', '$vars.nope'] })).toContain('unresolved-var')
  })

  test('an unresolved var inside a branch is reported', () => {
    expect(
      allCodes({ $match: { value: '$data.s', branches: { open: '$vars.nope', shut: '$data.x' } } })
    ).toContain('unresolved-var')
  })

  test('a var referenced only from inside an element counts as referenced', () => {
    const issues = allCodes({
      vars: { base: '$data.b' },
      operator: 'firstOf',
      values: ['$vars.base', 'fallback'],
    })
    expect(issues).not.toContain('unreferenced-var')
    expect(issues).not.toContain('unresolved-var')
  })

  test('a vars cycle routed through an element is caught, not left to hang', () => {
    // The runtime has no cycle guard: an undetected cycle would deadlock on
    // its own memoized promise rather than failing
    expect(
      allCodes({
        vars: { a: { $firstOf: ['$vars.a', 1] } },
        operator: 'firstOf',
        values: ['$vars.a'],
      })
    ).toContain('var-cycle')
  })
})
