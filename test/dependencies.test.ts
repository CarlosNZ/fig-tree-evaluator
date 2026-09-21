/**
 * Chunk 13.2 — `fig.getDependencies()` ("getDependencies()" in
 * docs-dev/v3-specs/v3-evaluator-methods.md).
 *
 * Black-box throughout: the method is the public face of a record the
 * parse walk already builds, so what is under test is the reshape — what
 * counts as a read, what makes the read-set unenumerable, and the two
 * orderings (traversal for paths, discovery for the other two).
 */
import { FigTree, coreOperators } from '../src'
import type { FragmentDefinition } from '../src'
import { compileSpyOp } from './fixtures/evalOperators'

const build = (fragments?: Record<string, FragmentDefinition>): FigTree =>
  new FigTree({ operators: [coreOperators], ...(fragments !== undefined ? { fragments } : {}) })

const fig = build()
const paths = (expression: unknown): string[] => fig.getDependencies(expression).data.paths

describe('what counts as a data read', () => {
  test('the shape is synchronous and total', () => {
    expect(fig.getDependencies({ $plus: ['$data.a', 1] })).toEqual({
      data: { paths: ['a'], dynamic: false },
      operators: ['plus'],
      fragments: [],
    })
  })

  test('references and literal get paths, on the sugar equivalence', () => {
    expect(paths({ a: '$data.user.name', b: { $get: 'orders[0].total' } })).toEqual([
      'orders[0].total',
      'user.name',
    ])
  })

  test('projection segments appear as written', () => {
    expect(paths({ $get: 'orders[*].total' })).toEqual(['orders[*].total'])
  })

  test('a get with `from` reads no $data path at all', () => {
    expect(paths({ $get: { path: 'name', from: { $plus: [1, 2] } } })).toEqual([])
  })

  test('internal namespaces name nothing outside the expression', () => {
    const expression = {
      vars: { n: 3 },
      value: { $map: ['$data.items', { $plus: ['$element', '$index', '$vars.n'] }] },
    }
    expect(paths(expression)).toEqual(['items'])
  })

  test('a dotted key and a two-level path are two different reads', () => {
    // Traversal order puts the two-level read first: at the first
    // segment, 'first' precedes the single key 'first.last'
    expect(paths({ a: { $get: { path: ['first.last'] } }, b: '$data.first.last' })).toEqual([
      'first.last',
      '["first.last"]',
    ])
  })

  test('the same read spelled two ways is one entry', () => {
    expect(paths({ a: '$data.user.name', b: { $get: 'user.name' }, c: '$d.user.name' })).toEqual([
      'user.name',
    ])
  })

  test('a digit-only key and an index are one read, so one entry', () => {
    // resolvePath reads the key '0' and the index 0 identically, against
    // arrays and objects alike — the record must not keep them apart
    expect(
      paths({
        a: { $get: 'x.0' },
        b: { $get: 'x[0]' },
        c: { $get: { path: ['x', '0'] } },
        d: { $get: { path: ['x', 0] } },
        e: '$data.x.0',
      })
    ).toEqual(['x[0]'])
  })
})

describe('`dynamic` — the honesty bit', () => {
  test('a bare $data makes the read-set unenumerable', () => {
    expect(fig.getDependencies({ $plus: ['$data', 1] }).data.dynamic).toBe(true)
  })

  test('a computed get path does too, and known paths still list', () => {
    const { data } = fig.getDependencies({ $get: '$data.chosen' })
    expect(data.dynamic).toBe(true)
    expect(data.paths).toEqual(['chosen'])
  })

  test('a statically enumerable expression says so', () => {
    expect(fig.getDependencies({ $get: 'user.name' }).data.dynamic).toBe(false)
  })

  test('a literal path the recorder cannot enumerate flips the bit rather than vanishing', () => {
    // A non-segment element still reads a key at runtime (`'[object
    // Object]'`), a non-array literal fails the type check but reads all
    // the same — neither may be reported as "reads nothing"
    for (const path of [['a', { x: 1 }], 5, 'a[']) {
      const { data } = fig.getDependencies({ $get: { path } })
      expect(data.dynamic).toBe(true)
      expect(data.paths).toEqual([])
    }
  })

  test('an empty get path is the whole data object, like a bare $data', () => {
    for (const expression of [{ $get: '' }, { $get: { path: [] } }, '$data'])
      expect(fig.getDependencies(expression).data).toEqual({ paths: [], dynamic: true })
  })
})

describe('transitivity through fragments', () => {
  const fragged = build({
    inner: { expression: { $get: 'settings.theme' } },
    outer: {
      expression: { $plus: [{ fragment: 'inner' }, '$data.count'] },
    },
    dyn: { expression: '$params.whatever', parameters: { whatever: {} } },
  })

  test('a call site pulls in the registered body’s reads', () => {
    const result = fragged.getDependencies({ fragment: 'outer' })
    expect(result.data.paths).toEqual(['count', 'settings.theme'])
    // The nested call is a dependency too — the rollup composes it in
    expect(result.fragments).toEqual(['outer', 'inner'])
    expect(result.operators).toEqual(['plus', 'get'])
  })

  test('a dynamic-arguments call makes the read-set unenumerable', () => {
    expect(
      fragged.getDependencies({ fragment: 'dyn', parameters: '$data.formValues' }).data.dynamic
    ).toBe(true)
  })
})

describe('ordering', () => {
  test('paths sort in traversal order, not as text', () => {
    // Every row here is a case a string sort gets wrong: numeric indices
    // compare as text, a sibling holding a character below `.` wedges
    // itself inside the subtree, and `[*]` lands wherever `*` falls
    expect(
      paths({
        a: '$data.orders[10].total',
        b: '$data.orders[2].total',
        c: '$data["user-id"]',
        d: '$data.user.name',
        e: '$data.user',
        f: { $get: 'list[*].id' },
        g: { $get: 'list[0].id' },
      })
    ).toEqual([
      'list[*].id',
      'list[0].id',
      'orders[2].total',
      'orders[10].total',
      'user',
      'user.name',
      'user-id',
    ])
  })

  test('operators and fragments keep discovery order', () => {
    const fragged = build({ summary: { expression: 1 }, detail: { expression: 2 } })
    const result = fragged.getDependencies({
      z: { $split: 'a,b' },
      y: { $plus: [1, 2] },
      x: { fragment: 'detail' },
      w: { fragment: 'summary' },
    })
    expect(result.operators).toEqual(['split', 'plus'])
    expect(result.fragments).toEqual(['detail', 'summary'])
  })
})

describe('the method’s own posture', () => {
  test('never throws on expression content', () => {
    const contents = [
      { operator: 'flibble' },
      { operator: 'plus', fragment: 'f' },
      { vars: 'high' },
      { $get: 'a[' },
      () => 'opaque',
      undefined,
    ]
    for (const expression of contents) {
      expect(() => fig.getDependencies(expression)).not.toThrow()
    }
  })

  test('a fresh array every call — the caller may keep and mutate it', () => {
    const expression = { $plus: ['$data.a', '$data.b'] }
    const first = fig.getDependencies(expression)
    first.data.paths.push('injected')
    expect(fig.getDependencies(expression).data.paths).toEqual(['a', 'b'])
  })

  test('does not warm the parse cache', () => {
    const spy = compileSpyOp()
    const instance = new FigTree({ operators: [coreOperators, spy.definition] })
    const expression = { $counted: '$data.a' }
    instance.getDependencies(expression)
    // Had the read warmed the cache, the evaluation would have reused the
    // artifact and the hook would never have run
    return instance.evaluate(expression).then(() => expect(spy.compiles()).toBe(1))
  })
})
