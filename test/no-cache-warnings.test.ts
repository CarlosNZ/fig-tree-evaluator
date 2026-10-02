/**
 * The two `noCache` warnings and the `caches` rollup ("`noCache` semantics"
 * in docs-dev/v3-specs/v3-api.md): redundant beneath another `noCache` in
 * the same expression or body, dead where nothing beneath can cache — and
 * exact, through fragment calls included.
 */
import { FigTree, coreOperators, defineOperator } from '../src'
import type { Issue } from '../src'

const fetch = defineOperator({
  name: 'fetch',
  category: 'other',
  description: 'A caching operator',
  parameters: { key: { type: 'string' } },
  positionalParams: ['key'],
  returns: 'string',
  cache: true,
  evaluate: ({ key }, context) => context.cache.memo(key, async () => key),
})

const FRAGMENTS = {
  cached: { expression: { $fetch: 'c' } },
  outer: { expression: [{ $upper: 'x' }, { $cached: {} }] },
  echo: { expression: '$params.x', parameters: { x: { type: 'any' } } },
  shielded: { expression: { operator: 'upper', value: { $fetch: 'x' }, noCache: true } },
} as const

const build = (options: object = {}) =>
  new FigTree({ operators: [coreOperators, fetch], fragments: FRAGMENTS, ...options })

/** The `useless-modifier` warnings `validate()` reports, as their paths. */
const dead = (fig: FigTree, expression: unknown) =>
  fig
    .validate(expression)
    .issues.filter((issue) => issue.code === 'useless-modifier')
    .map((issue) => ({ path: issue.path, message: issue.message }))

const at = (path: (string | number)[], kind: 'redundant' | 'dead') => ({
  path,
  message: expect.stringContaining(`is ${kind}`) as unknown as string,
})

describe('dead: nothing beneath can cache', () => {
  const fig = build()

  test('on an operator that never caches', () => {
    expect(dead(fig, { $upper: 'x', noCache: true })).toEqual([at(['noCache'], 'dead')])
  })

  test('not where a node beneath caches', () => {
    expect(dead(fig, { operator: 'upper', value: { $fetch: 'a' }, noCache: true })).toEqual([])
    expect(dead(fig, { $fetch: 'a', noCache: true })).toEqual([])
  })

  test('after an operatorDefaults change, on the same expression', () => {
    const changing = build()
    const expression = { $fetch: 'a', noCache: true }
    expect(dead(changing, expression)).toEqual([])
    changing.updateOptions({ operatorDefaults: { fetch: { noCache: true } } })
    expect(dead(changing, expression)).toEqual([at(['noCache'], 'redundant')])
  })

  test('on a call, read through the body — nested calls included', () => {
    expect(dead(fig, { $cached: {}, noCache: true })).toEqual([])
    expect(dead(fig, { $outer: {}, noCache: true })).toEqual([])
    expect(dead(fig, { $echo: { x: 1 }, noCache: true })).toEqual([at(['noCache'], 'dead')])
  })

  test('on a call whose body is all beneath its own noCache', () => {
    expect(dead(fig, { $shielded: {}, noCache: true })).toEqual([at(['noCache'], 'dead')])
  })

  test('not on a call whose argument caches', () => {
    expect(dead(fig, { $echo: { x: { $fetch: 'a' } }, noCache: true })).toEqual([])
  })

  test('never on top of an error', () => {
    expect(dead(fig, { operator: 'upper', value: { operator: 'flibble' }, noCache: true })).toEqual(
      []
    )
    expect(dead(fig, { fragment: 'nope', noCache: true })).toEqual([])
  })
})

describe('redundant: an enclosing node already sets it', () => {
  const fig = build()

  test('beneath another noCache in the same expression', () => {
    const expression = { operator: 'upper', value: { $fetch: 'a', noCache: true }, noCache: true }
    expect(dead(fig, expression)).toEqual([at(['value', 'noCache'], 'redundant')])
  })

  test('takes precedence over dead, one warning per node', () => {
    const expression = { operator: 'upper', value: { $upper: 'x', noCache: true }, noCache: true }
    expect(dead(fig, expression)).toEqual([
      at(['noCache'], 'dead'),
      at(['value', 'noCache'], 'redundant'),
    ])
  })

  test("a call site's noCache never makes one in the body redundant", () => {
    const shielded = build()
      .getFragments()
      .find((info) => info.name === 'shielded')
    expect(shielded?.warnings).toEqual([])
  })
})

describe("redundant: the host's noCache already covers it", () => {
  const off = build({ operatorDefaults: { fetch: { noCache: true } } })

  test('on an operator the host turned off, naming it', () => {
    expect(dead(off, { $fetch: 'a', noCache: true })).toEqual([
      {
        path: ['noCache'],
        message: "'noCache' is redundant — caching is already disabled for 'fetch'",
      },
    ])
  })

  test('where all that could cache beneath is turned off, each named once', () => {
    const expression = {
      operator: 'upper',
      value: { $plus: [{ $fetch: 'a' }, { $fetch: 'b' }] },
      noCache: true,
    }
    expect(dead(off, expression)).toEqual([
      {
        path: ['noCache'],
        message: "'noCache' is redundant — caching is already disabled for 'fetch'",
      },
    ])
  })

  test("dead on a call whose body the host turned off, since a body isn't read for names", () => {
    expect(dead(off, { $cached: {}, noCache: true })).toEqual([at(['noCache'], 'dead')])
  })

  test('dead where nothing beneath could cache at all', () => {
    expect(dead(off, { $upper: 'x', noCache: true })).toEqual([at(['noCache'], 'dead')])
  })
})

describe("a fragment body's warnings", () => {
  test('land in getFragments(), in tree order with the rest', () => {
    const fig = build({
      fragments: {
        ...FRAGMENTS,
        noisy: { expression: [{ $typo: 1 }, { $upper: 'x', noCache: true }, { $typo2: 2 }] },
      },
    })
    const warnings = fig.getFragments().find((info) => info.name === 'noisy')?.warnings ?? []
    expect(warnings.map((issue: Issue) => [issue.code, issue.path])).toEqual([
      ['unrecognized-identifier', ['expression', 0, '$typo']],
      ['useless-modifier', ['expression', 1, 'noCache']],
      ['unrecognized-identifier', ['expression', 2, '$typo2']],
    ])
  })
})

describe("getFragments()' caches", () => {
  test('whether a call can reach a node that caches', () => {
    const caches = Object.fromEntries(
      build()
        .getFragments()
        .map((info) => [info.name, info.caches])
    )
    expect(caches).toEqual({ cached: true, outer: true, echo: false, shielded: false })
  })

  test("follows the host's noCache", () => {
    const off = build({ operatorDefaults: { fetch: { noCache: true } } })
    expect(off.getFragments().find((info) => info.name === 'cached')?.caches).toBe(false)
  })
})
