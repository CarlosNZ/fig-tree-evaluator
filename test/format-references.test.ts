/**
 * Phase 16.3 — `toGet` and `toReference` ("`toGet` and `toReference`" in
 * docs-dev/v3-specs/v3-format.md): one data read converted between a
 * reference string and a `get` node. Neither takes a registry, and neither
 * throws: `null` is the answer "this has no such form", which the editor
 * uses to decide whether to offer the conversion at all.
 *
 * The evaluation tests at the bottom are the equivalence the conversion
 * rests on: a `get` node and its reference read through the same path
 * resolver, so they agree on every outcome, missing paths and
 * `strictDataPaths` included.
 */
import { FigTree, isFigTreeError } from '../src'
import { toGet, toReference } from '../src/format'

describe('toGet', () => {
  test.each([
    ['$d.a.b', { operator: 'get', path: 'a.b' }],
    ['$data.a.b', { operator: 'get', path: 'a.b' }],
    ['$data[0].x', { operator: 'get', path: '[0].x' }],
    ['$data.user["first name"]', { operator: 'get', path: 'user["first name"]' }],
    ['$data.orders[*].total', { operator: 'get', path: 'orders[*].total' }],
    ['$vars.row.a', { operator: 'get', path: 'a', from: '$vars.row' }],
    ['$v.row.a[1]', { operator: 'get', path: 'a[1]', from: '$v.row' }],
    ['$vars.row[0]', { operator: 'get', path: '[0]', from: '$vars.row' }],
    ['$vars["row"].a', { operator: 'get', path: 'a', from: '$vars["row"]' }],
    ['$params.p.a', { operator: 'get', path: 'a', from: '$params.p' }],
    ['$e.name', { operator: 'get', path: 'name', from: '$e' }],
    ['$element[2]', { operator: 'get', path: '[2]', from: '$element' }],
    // Nothing left to drill: the whole source, as an empty path reads it
    ['$data', { operator: 'get', path: '' }],
    ['$d', { operator: 'get', path: '' }],
    ['$data.', { operator: 'get', path: '' }],
    ['$e', { operator: 'get', path: '', from: '$e' }],
    ['$vars.row', { operator: 'get', path: '', from: '$vars.row' }],
    ['$p.p', { operator: 'get', path: '', from: '$p.p' }],
    ['$params', { operator: 'get', path: '', from: '$params' }],
  ])('%s', (reference, node) => {
    expect(toGet(reference)).toEqual(node)
  })

  test.each([
    ['$index, a number rather than a source', '$index'],
    ['$index by its alias', '$i'],
    ['a drilled $index (invalid)', '$i.x'],
    ['a bare $vars (invalid)', '$vars'],
    ['a var named by an index', '$vars[0].a'],
    ['an unterminated bracket', '$data.items['],
    ['an unrecognized namespace', '$order.x'],
    ['plain text', 'hello'],
    ['a template, not a whole reference', 'Hi $data.name'],
  ])('%s has no get form', (_label, reference) => {
    expect(toGet(reference)).toBeNull()
  })

  test.each([42, null, undefined, { operator: 'get', path: 'a' }, ['$data.a']])(
    'a non-string (%p) has no get form',
    (value) => {
      expect(toGet(value)).toBeNull()
    }
  )

  describe('the spelling of `from`', () => {
    test.each([
      ['preserve', '$v.row.a', '$v.row'],
      ['preserve', '$vars.row.a', '$vars.row'],
      ['canonical', '$v.row.a', '$vars.row'],
      ['alias', '$vars.row.a', '$v.row'],
      ['alias', '$element.x', '$e'],
      ['canonical', '$e.x', '$element'],
    ] as const)('%s: %s', (referenceNames, reference, from) => {
      expect(toGet(reference, { referenceNames })).toMatchObject({ from })
    })

    test('a $data read has no `from`, whatever the spelling', () => {
      expect(toGet('$d.x', { referenceNames: 'canonical' })).toEqual({ operator: 'get', path: 'x' })
    })
  })
})

describe('toReference', () => {
  describe('each form of a get node', () => {
    test.each([
      ['canonical', { operator: 'get', path: 'a.b' }],
      ['single value', { $get: 'a.b' }],
      ['positional', { $get: ['a.b'] }],
      ['named', { $get: { path: 'a.b' } }],
      ['an array path', { operator: 'get', path: ['a', 'b'] }],
      ['a commented node — the comment is dropped', { '//': 'why', operator: 'get', path: 'a.b' }],
      ['a comment in the payload', { $get: { '//': 'why', path: 'a.b' } }],
    ])('%s', (_label, node) => {
      expect(toReference(node)).toBe('$d.a.b')
    })
  })

  test.each([
    ['from a var', { operator: 'get', path: 'a.b', from: '$vars.row' }, '$vars.row.a.b'],
    ['from an alias var', { $get: { path: 'a', from: '$v.row' } }, '$v.row.a'],
    ['from a parameter', { operator: 'get', path: 'a', from: '$params.p' }, '$params.p.a'],
    ['from the element', { operator: 'get', path: 'name', from: '$e' }, '$e.name'],
    ['from a bare $data', { operator: 'get', path: 'x', from: '$data' }, '$data.x'],
    ['from a drilled $data', { operator: 'get', path: 'x', from: '$data.a' }, '$data.a.x'],
    ['an index first', { operator: 'get', path: '[0].x' }, '$d[0].x'],
    ['an array path with an index', { operator: 'get', path: ['items', 0] }, '$d.items[0]'],
    ['a key needing quotes', { operator: 'get', path: ['first.last'] }, '$d["first.last"]'],
    ['a projection', { operator: 'get', path: 'orders[*].total' }, '$d.orders[*].total'],
    ['an empty path', { operator: 'get', path: '' }, '$d'],
    ['an empty array path', { operator: 'get', path: [] }, '$d'],
    ['an empty path from a var', { operator: 'get', path: '', from: '$vars.row' }, '$vars.row'],
  ])('%s', (_label, node, reference) => {
    expect(toReference(node)).toBe(reference)
  })

  test.each([
    ['a fallback', { operator: 'get', path: 'a', fallback: 0 }],
    ['a fallback beside shorthand', { $get: 'a', fallback: 0 }],
    ['useCache', { operator: 'get', path: 'a', useCache: false }],
    ['vars', { operator: 'get', path: 'a', vars: { x: 1 } }],
    ['missingPathDefault', { operator: 'get', path: 'a', missingPathDefault: 0 }],
    ['missingPathDefault, positional', { $get: ['a', 0] }],
    ['missingPathDefault, named', { $get: { path: 'a', missingPathDefault: null } }],
    ['a computed path', { operator: 'get', path: { $plus: ['a', 'b'] } }],
    ['a reference path', { operator: 'get', path: '$data.key' }],
    ['a $-prefixed path, which may be an `as` binding', { $get: '$field' }],
    ['a $-prefixed segment', { operator: 'get', path: ['user', '$field'] }],
    ['a path that does not parse', { operator: 'get', path: 'a[' }],
    ['a negative index segment', { operator: 'get', path: ['a', -1] }],
    ['a fractional segment', { operator: 'get', path: ['a', 1.5] }],
    ['a non-segment in the path', { operator: 'get', path: ['a', true] }],
    ['no path', { operator: 'get' }],
    ['a null path', { operator: 'get', path: null }],
    ['a literal object source', { operator: 'get', path: 'a', from: { a: 1 } }],
    ['a node source', { operator: 'get', path: 'a', from: { $get: 'x' } }],
    ['an $index source', { operator: 'get', path: 'a', from: '$index' }],
    ['a bare $vars source (invalid)', { operator: 'get', path: 'a', from: '$vars' }],
    ['an unrecognized source', { operator: 'get', path: 'a', from: '$order' }],
    ['a plain-string source', { operator: 'get', path: 'a', from: 'data' }],
    ['an unknown key', { operator: 'get', path: 'a', typo: 1 }],
    ['another operator', { operator: 'plus', values: [1] }],
    ['an operator key beside $get', { operator: 'get', $get: 'a' }],
    ['a fragment key', { fragment: 'get', path: 'a' }],
    ['another $key beside $get', { $get: 'a', $x: 1 }],
    ['surplus positional arguments', { $get: ['a', 0, 1] }],
    ['a node-like payload', { $get: { operator: 'plus', values: [] } }],
    ['a $key in the payload', { $get: { $plus: [1] } }],
    ['an unknown key in the payload', { $get: { path: 'a', typo: 1 } }],
    ['a string', '$data.a'],
    ['null', null],
    ['an array', [{ operator: 'get', path: 'a' }]],
  ])('%s has no reference form', (_label, node) => {
    expect(toReference(node)).toBeNull()
  })

  describe('spelling', () => {
    test.each([
      ['preserve', { $get: 'x' }, '$d.x'],
      ['canonical', { $get: 'x' }, '$data.x'],
      ['alias', { $get: 'x' }, '$d.x'],
      ['preserve', { $get: { path: 'x', from: '$vars.r' } }, '$vars.r.x'],
      ['alias', { $get: { path: 'x', from: '$vars.r' } }, '$v.r.x'],
      ['canonical', { $get: { path: 'x', from: '$v.r' } }, '$vars.r.x'],
      ['canonical', { $get: { path: 'x', from: '$d' } }, '$data.x'],
    ] as const)('%s: %p', (referenceNames, node, reference) => {
      expect(toReference(node, { referenceNames })).toBe(reference)
    })
  })

  // A `$data` read keeps no spelling as a get node, so its round trip starts
  // from the alias `preserve` writes back
  test('toGet and toReference invert each other', () => {
    for (const reference of [
      '$d.a.b',
      '$vars.row.a',
      '$params.p[0]',
      '$element.x',
      '$v.r["q.r"]',
      '$d',
      '$vars.row',
      '$e',
    ])
      expect(toReference(toGet(reference))).toBe(reference)
  })
})

describe('a get node and its reference evaluate alike', () => {
  const data = {
    user: { name: 'Ada', tags: ['x', 'y'], 'first.last': 'dotted' },
    orders: [{ total: 3 }, { total: 4 }],
    stored: null,
  }
  type Outcome = { value: unknown } | { error: string }
  const outcome = async (fig: FigTree, expression: unknown): Promise<Outcome> => {
    try {
      return { value: await fig.evaluate(expression, { data }) }
    } catch (error) {
      if (isFigTreeError(error)) return { error: error.code }
      throw error
    }
  }

  // Each read, placed where its namespace is in scope
  const inVars = (read: unknown) => ({ vars: { row: { a: { b: 1 }, list: [5] } }, out: read })
  const inMap = (read: unknown) => ({ $map: [[{ name: 'n1' }, { other: 1 }], read] })
  const reads: [string, unknown, (read: unknown) => unknown][] = [
    ['a data path', { operator: 'get', path: 'user.name' }, (read) => read],
    ['the whole data object', { operator: 'get', path: '' }, (read) => read],
    ['a whole var', { operator: 'get', path: '', from: '$vars.row' }, inVars],
    ['a whole element', { operator: 'get', path: '', from: '$e' }, inMap],
    ['a missing data path', { operator: 'get', path: 'user.nope' }, (read) => read],
    ['a path through a missing key', { operator: 'get', path: 'nope.deeper' }, (read) => read],
    ['a stored null', { operator: 'get', path: 'stored' }, (read) => read],
    ['an index', { $get: 'user.tags[1]' }, (read) => read],
    ['a quoted key', { operator: 'get', path: ['user', 'first.last'] }, (read) => read],
    ['a projection', { $get: 'orders[*].total' }, (read) => read],
    ['a var', { operator: 'get', path: 'a.b', from: '$vars.row' }, inVars],
    ['a missing var path', { operator: 'get', path: 'a.zz', from: '$vars.row' }, inVars],
    ['an element', { operator: 'get', path: 'name', from: '$e' }, inMap],
    ['a missing element path', { $get: { path: 'nope', from: '$element' } }, inMap],
  ]

  describe.each([false, true])('strictDataPaths %p', (strictDataPaths) => {
    const fig = new FigTree({ strictDataPaths })

    test.each(reads)('%s', async (_label, node, place) => {
      const reference = toReference(node)
      expect(reference).not.toBeNull()
      expect(await outcome(fig, place(reference))).toEqual(await outcome(fig, place(node)))
    })

    // A fragment body is fixed at registration, so the read is registered
    // twice, once in each form, and both are called with the same arguments
    test.each([
      ['a parameter path', { v: 7 }],
      ['a missing parameter path', { other: 7 }],
      ['a parameter that is not an object', 'text'],
    ])('%s', async (_label, p) => {
      const node = { operator: 'get', path: 'v', from: '$params.p' }
      const reference = toReference(node)
      expect(reference).toBe('$params.p.v')
      const body = (expression: unknown) => ({
        expression,
        parameters: { p: { type: 'any' as const } },
      })
      const withBodies = new FigTree({
        strictDataPaths,
        fragments: { asNode: body(node), asReference: body(reference) },
      })
      expect(await outcome(withBodies, { fragment: 'asReference', parameters: { p } })).toEqual(
        await outcome(withBodies, { fragment: 'asNode', parameters: { p } })
      )
    })

    test('toGet of each reference evaluates as the reference does', async () => {
      for (const [, node, place] of reads) {
        const reference = toReference(node)!
        expect(await outcome(fig, place(toGet(reference)))).toEqual(
          await outcome(fig, place(reference))
        )
      }
    })
  })
})
