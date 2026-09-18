/**
 * Chunk 6.2 — `map`, `filter`, `find`, `some`, `every` (batch 5 in
 * docs-dev/v3-specs/v3-operator-parameters-2.md; register rows 23 and 24
 * in docs-dev/v3-specs/v3-cases-for-review.md).
 *
 * Batch 5 is "one contract, five operators", so the shared shape is tested
 * once across all five and each operator's own section records only what
 * differs: result shape, decision rule, empty-input identity.
 *
 * There is no hand-migrated block here, and cannot be: v2 had no iterator
 * at all, so every case below is authored from the pass.
 */
import { coreOperators, FigTree, FigTreeError } from '../src'
import { latencyOp } from './fixtures/evalOperators'
import { rejection } from './helpers/rejection'

const fig = new FigTree()
const ev = (expression: unknown, data?: Record<string, unknown>) =>
  fig.evaluate(expression, data !== undefined ? { data } : {})
const failure = (expression: unknown, data?: Record<string, unknown>) =>
  rejection<FigTreeError>(ev(expression, data))

const users = [
  { id: 1, name: 'Ada', admin: true, age: 36 },
  { id: 2, name: 'Alan', admin: false, age: 41 },
  { id: 3, name: 'Grace', admin: false, age: 45 },
]

// ── map ─────────────────────────────────────────────────────────────

describe('map', () => {
  test('the pluck idiom — every result, input order, same length', async () => {
    expect(await ev({ $map: ['$data.users', '$element.name'] }, { users })).toEqual([
      'Ada',
      'Alan',
      'Grace',
    ])
  })

  test('nulls are values and occupy their slot', async () => {
    expect(await ev({ $map: [[{ a: 1 }, {}], '$element.a'] })).toEqual([1, null])
  })

  test('$index is available and zero-based', async () => {
    expect(await ev({ $map: [['a', 'b', 'c'], '$index'] })).toEqual([0, 1, 2])
  })

  test('the named face and the positional face agree', async () => {
    const named = await ev({ $map: { input: ['a'], each: '$element' } })
    expect(named).toEqual(await ev({ $map: [['a'], '$element'] }))
  })

  test('a constant each still yields one result per element', async () => {
    expect(await ev({ $map: [['a', 'b'], 5] })).toEqual([5, 5])
  })

  test('empty input is []', async () => {
    expect(await ev({ $map: ['$data.xs', '$element'] }, { xs: [] })).toEqual([])
  })

  test('any element failing fails the node', async () => {
    const error = await failure({ $map: [[1, 0, 2], { $divide: [10, '$element'] }] })
    expect(error).toBeInstanceOf(FigTreeError)
  })
})

// ── filter ──────────────────────────────────────────────────────────

describe('filter', () => {
  test('keeps the ORIGINAL elements, never the predicate results', async () => {
    expect(
      await ev({ $filter: ['$data.users', { $greaterThan: ['$element.age', 40] }] }, { users })
    ).toEqual([users[1], users[2]])
  })

  test('strip-nulls — the join/split cleanup recipe', async () => {
    expect(
      await ev({
        $filter: {
          input: ['123 Main St', null, 'Springfield'],
          each: { $notEqual: ['$element', null] },
        },
      })
    ).toEqual(['123 Main St', 'Springfield'])
  })

  test('strip-falsy, spelled explicitly', async () => {
    expect(await ev({ $filter: { input: [0, 1, '', 'x', null, 2], each: '$element' } })).toEqual([
      1,
      'x',
      2,
    ])
  })

  test('an all-falsy outcome is [] — an answer, not an anomaly', async () => {
    expect(await ev({ $filter: [[0, '', null], '$element'] })).toEqual([])
  })

  test('empty input is []', async () => {
    expect(await ev({ $filter: [[], '$element'] })).toEqual([])
  })

  test('any predicate failing fails the node — membership is part of the result', async () => {
    const error = await failure({ $filter: [[1, 0], { $divide: [10, '$element'] }] })
    expect(error).toBeInstanceOf(FigTreeError)
  })
})

// ── find ────────────────────────────────────────────────────────────

describe('find', () => {
  test('the first matching element, in input order', async () => {
    expect(await ev({ $find: ['$data.users', { $equal: ['$element.id', 2] }] }, { users })).toEqual(
      users[1]
    )
  })

  test('the element itself, never its index', async () => {
    expect(await ev({ $find: [['a', 'b'], { $equal: ['$element', 'b'] }] })).toBe('b')
  })

  test('no match is null — absence, not failure (register row 23)', async () => {
    expect(
      await ev({ $find: ['$data.users', { $equal: ['$element.id', 42] }] }, { users })
    ).toBeNull()
  })

  test('empty input is the degenerate no-match', async () => {
    expect(await ev({ $find: [[], '$element'] })).toBeNull()
  })

  test('noMatchDefault answers a no-match', async () => {
    expect(
      await ev(
        {
          $find: {
            input: '$data.users',
            each: { $equal: ['$element.id', 42] },
            noMatchDefault: 'none',
          },
        },
        { users }
      )
    ).toBe('none')
  })

  test('noMatchDefault fires on no-match ONLY — a found null passes through', async () => {
    expect(
      await ev({
        $find: { input: [null, 'x'], each: { $equal: ['$element', null] }, noMatchDefault: 'none' },
      })
    ).toBeNull()
  })

  test('noMatchDefault is lazy — it never evaluates when something matches', async () => {
    const slow = latencyOp('slow')
    const instance = new FigTree({ operators: [coreOperators, slow.definition] })
    const result = await instance.evaluate({
      $find: { input: ['a'], each: true, noMatchDefault: { $slow: ['unused', 0] } },
    })
    expect(result).toBe('a')
    expect(slow.started).toEqual([])
  })

  test('a failing noMatchDefault fails the node, and a fallback catches it', async () => {
    expect(
      await ev({
        $find: { input: ['a'], each: false, noMatchDefault: { $divide: [1, 0] } },
        fallback: 'FB',
      })
    ).toBe('FB')
  })

  test('order-aware: the answer does not move when latencies are permuted', async () => {
    const slow = latencyOp('slow')
    const instance = new FigTree({ operators: [coreOperators, slow.definition] })
    // Both elements match; element 0 is far slower, so it settles last
    const expression = (msFirst: number, msSecond: number) => ({
      $find: {
        input: ['first', 'second'],
        each: {
          $slow: [true, { $if: [{ $equal: ['$index', 0] }, msFirst, msSecond] }],
        },
      },
    })
    expect(await instance.evaluate(expression(30, 0))).toBe('first')
    expect(await instance.evaluate(expression(0, 30))).toBe('first')
  })

  test('a failure BEFORE the match fails the node — the result depends on it', async () => {
    const error = await failure({
      $find: [[0, 2], { $greaterThan: [{ $divide: [10, '$element'] }, 1] }],
    })
    expect(error).toBeInstanceOf(FigTreeError)
  })

  test('a failure AFTER the decider is discarded with the cancelled work', async () => {
    expect(
      await ev({ $find: [[2, 0], { $greaterThan: [{ $divide: [10, '$element'] }, 1] }] })
    ).toBe(2)
  })
})

// ── some / every ────────────────────────────────────────────────────

describe('some / every', () => {
  test('membership testing is the everyday some', async () => {
    expect(await ev({ $some: [['user', 'admin'], { $equal: ['$element', 'admin'] }] })).toBe(true)
    expect(await ev({ $some: [['user'], { $equal: ['$element', 'admin'] }] })).toBe(false)
  })

  test('every is the universal quantifier', async () => {
    expect(await ev({ $every: ['$data.users', '$element.age'] }, { users })).toBe(true)
    expect(await ev({ $every: ['$data.users', '$element.admin'] }, { users })).toBe(false)
  })

  test('the results are actual booleans, never elements', async () => {
    expect(await ev({ $some: [['x'], '$element'] })).toBe(true)
  })

  test('the empty identities — some [] is false, every [] is true', async () => {
    expect(await ev({ $some: [[], '$element'] })).toBe(false)
    expect(await ev({ $every: [[], '$element'] })).toBe(true)
  })

  test('Kleene: a failure the decision does not depend on never surfaces', async () => {
    // some(error, truthy) is true
    expect(await ev({ $some: [[0, 1], { $divide: [10, '$element'] }] })).toBe(true)
  })

  test('Kleene: with no decider, the lowest-index failure is raised', async () => {
    const error = await failure({ $every: [[0, 0], { $divide: [10, '$element'] }] })
    expect(error).toBeInstanceOf(FigTreeError)
  })

  test('a predicate propagating null reads falsy at the quantifier', async () => {
    // One absent field makes `every` confidently false, and can never make
    // it true — the and/or cell applied element-wise
    const rows = [{ age: 20 }, {}]
    expect(
      await ev({ $every: ['$data.rows', { $greaterThan: ['$element.age', 18] }] }, { rows })
    ).toBe(false)
  })

  test('early resolution cancels the rest', async () => {
    const slow = latencyOp('slow')
    const instance = new FigTree({ operators: [coreOperators, slow.definition] })
    const result = await instance.evaluate({
      $some: [[0, 50], { $slow: [true, '$element'] }],
    })
    expect(result).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 15))
    expect(slow.aborted).toEqual([true])
  })
})

// ── the shared contract, across all five ────────────────────────────

describe('the shared contract', () => {
  const each = { map: '$element', filter: true, find: true, some: true, every: true }
  const names = Object.keys(each) as (keyof typeof each)[]

  test.each(names)('%s: a null input is a runtime type error (register row 24)', async (name) => {
    const error = await failure({ [`$${name}`]: ['$data.missing', each[name]] })
    expect(error.code).toBe('type-check')
  })

  test.each(names)('%s: a fallback catches that failure', async (name) => {
    expect(await ev({ [`$${name}`]: ['$data.missing', each[name]], fallback: 'FB' })).toBe('FB')
  })

  test.each(names)('%s: nullInputDefault supplies the collection instead', async (name) => {
    const result = await ev({
      [`$${name}`]: { input: '$data.missing', each: each[name], nullInputDefault: [] },
    })
    expect(result).toEqual({ map: [], filter: [], find: null, some: false, every: true }[name])
  })

  test.each(names)('%s: a non-null non-array input is the same type error', async (name) => {
    const error = await failure({ [`$${name}`]: ['a string', each[name]] })
    expect(error.code).toBe('type-check')
  })

  test.each(names)('%s: as, nullInputDefault are named-face only', async (name) => {
    // A third positional element is the standard surplus parse error
    const error = await failure({ [`$${name}`]: [['a'], each[name], 'row'] })
    expect(error).toBeInstanceOf(FigTreeError)
  })

  test('nullInputDefault is host-configurable through operatorDefaults', async () => {
    const instance = new FigTree({ operatorDefaults: { map: { nullInputDefault: [] } } })
    expect(await instance.evaluate({ $map: ['$data.missing', '$element'] })).toEqual([])
  })

  test('elements start in parallel, not in sequence', async () => {
    const slow = latencyOp('slow')
    const instance = new FigTree({ operators: [coreOperators, slow.definition] })
    await instance.evaluate({ $map: [['a', 'b', 'c'], { $slow: ['$element', 0] }] })
    expect(slow.started).toEqual(['a', 'b', 'c'])
  })
})
