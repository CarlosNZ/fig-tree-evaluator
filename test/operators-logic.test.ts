/**
 * Chunk 5.2 — `if`, `match` and `firstOf` (batch 1 in
 * docs-dev/v3-specs/v3-operator-parameters.md; register rows 1, 5, 6, 7, 8
 * in docs-dev/v3-specs/v3-cases-for-review.md).
 *
 * The claim these operators exist to make is negative: work they did not
 * choose never happens. So the assertions that matter are counts, taken
 * from a spy standing in for the expensive thing.
 */
import { coreOperators, defineOperator, FigTree, FigTreeError } from '../src'
import { rejection } from './helpers/rejection'

const fig = new FigTree()
const ev = (expression: unknown, data?: Record<string, unknown>) =>
  fig.evaluate(expression, data !== undefined ? { data } : {})
const failure = (expression: unknown, data?: Record<string, unknown>) =>
  rejection<FigTreeError>(ev(expression, data))

/** A stand-in for an expensive branch: counts, then answers. */
const tracked = () => {
  const calls: unknown[] = []
  const definition = defineOperator({
    name: 'track',
    description: 'Record that this branch ran',
    parameters: { value: { type: 'any', nullPolicy: 'value' } },
    positionalParams: ['value'],
    evaluate: ({ value }) => {
      calls.push(value)
      return value
    },
  })
  // `operators` REPLACES the core set, so the core list comes along
  return { calls, fig: new FigTree({ operators: [coreOperators, definition] }) }
}

// ── if ──────────────────────────────────────────────────────────────

describe('if', () => {
  test('picks a branch by truthiness, with null falsy', async () => {
    expect(await ev({ $if: [true, 'yes', 'no'] })).toBe('yes')
    expect(await ev({ $if: [false, 'yes', 'no'] })).toBe('no')
    expect(await ev({ $if: ['$data.missing', 'yes', 'no'] })).toBe('no')
    expect(await ev({ $if: ['', 'yes', 'no'] })).toBe('no')
    expect(await ev({ $if: [[], 'yes', 'no'] })).toBe('yes')
  })

  test('exactly one branch evaluates — the other never runs', async () => {
    const { calls, fig } = tracked()
    expect(
      await fig.evaluate({ $if: [true, { $track: 'taken' }, { $track: 'skipped' }] })
    ).toBe('taken')
    expect(calls).toEqual(['taken'])
  })

  test('the condition is evaluated, the branches are not, before the choice', async () => {
    const { calls, fig } = tracked()
    await fig.evaluate({
      $if: [{ $track: 0 }, { $track: 'a' }, { $track: 'b' }],
    })
    expect(calls).toEqual([0, 'b'])
  })

  test('an omitted else is null — success, not failure (register row 1)', async () => {
    expect(await ev({ $if: [false, 'yes'] })).toBe(null)
    // A fallback does not stand in for a missing else: nothing failed
    expect(await ev({ operator: 'if', condition: false, then: 'yes', fallback: 'fb' })).toBe(null)
  })

  test('an explicit null branch is an ordinary value', async () => {
    expect(await ev({ $if: [true, null, 'no'] })).toBe(null)
  })

  test('a fallback still catches a genuine failure in the taken branch', async () => {
    expect(
      await ev({ operator: 'if', condition: true, then: { $divide: [1, 0] }, fallback: 'fb' })
    ).toBe('fb')
  })

  test('the named face and the alias agree', async () => {
    expect(await ev({ operator: 'if', condition: true, then: 'a', else: 'b' })).toBe('a')
    expect(await ev({ '$?': [true, 'a', 'b'] })).toBe('a')
  })
})

// ── match ───────────────────────────────────────────────────────────

describe('match', () => {
  const branches = { open: 'Open', shut: 'Closed' }

  test('matches by the canonical string form of the value', async () => {
    expect(await ev({ $match: ['open', branches] })).toBe('Open')
    expect(await ev({ $match: [1, { 1: 'one', 2: 'two' }] })).toBe('one')
    expect(await ev({ $match: [true, { true: 'yes', false: 'no' }] })).toBe('yes')
  })

  test('only the matching branch evaluates', async () => {
    const { calls, fig } = tracked()
    const result = await fig.evaluate({
      $match: ['b', { a: { $track: 'a' }, b: { $track: 'b' }, c: { $track: 'c' } }],
    })
    expect(result).toBe('b')
    expect(calls).toEqual(['b'])
  })

  test('the default is taken on no match, and is itself lazy', async () => {
    const { calls, fig } = tracked()
    expect(
      await fig.evaluate({
        $match: ['zzz', { a: { $track: 'a' } }, { $track: 'fallback' }],
      })
    ).toBe('fallback')
    expect(calls).toEqual(['fallback'])
  })

  test('no match and no default is a failure a fallback catches (row 7)', async () => {
    expect((await failure({ $match: ['zzz', branches] })).code).toBe('operator-failure')
    expect(await ev({ operator: 'match', value: 'zzz', branches, fallback: 'fb' })).toBe('fb')
  })

  test('a null value matches no branch and falls to the default (row 8)', async () => {
    expect(await ev({ $match: ['$data.missing', { '': 'empty' }, 'defaulted'] })).toBe('defaulted')
    expect((await failure({ $match: ['$data.missing', branches] })).code).toBe('operator-failure')
  })

  test('a prototype key is not a branch', async () => {
    expect((await failure({ $match: ['toString', branches] })).code).toBe('operator-failure')
    expect((await failure({ $match: ['constructor', branches] })).code).toBe('operator-failure')
  })

  test('a dynamic branch map is evaluated whole, and its value returns verbatim', async () => {
    const labels = { open: 'Open', shut: '$data.neverRead' }
    // Values extracted from a data-sourced map are runtime data, never
    // re-parsed — the injection path v2 left open
    expect(await ev({ $match: ['shut', '$data.labels'] }, { labels })).toBe('$data.neverRead')
  })

  test('a dynamic map that is not an object is a type error', async () => {
    expect((await failure({ $match: ['a', '$data.nope'] })).code).toBe('type-check')
  })
})

// ── firstOf ─────────────────────────────────────────────────────────

describe('firstOf', () => {
  test('returns the first candidate that is not null', async () => {
    expect(await ev({ $firstOf: ['$data.nickname', '$data.name', 'Anonymous'] }, { name: 'Ada' }))
      .toBe('Ada')
  })

  test('skips only null — "", 0 and false are answers', async () => {
    expect(await ev({ $firstOf: ['', 'backup'] })).toBe('')
    expect(await ev({ $firstOf: [0, 'backup'] })).toBe(0)
    expect(await ev({ $firstOf: [false, 'backup'] })).toBe(false)
  })

  test('later candidates never evaluate — the whole point', async () => {
    const { calls, fig } = tracked()
    expect(await fig.evaluate({ $firstOf: [{ $track: 'primary' }, { $track: 'backup' }] })).toBe(
      'primary'
    )
    expect(calls).toEqual(['primary'])
  })

  test('candidates are tried in order until one answers', async () => {
    const { calls, fig } = tracked()
    expect(
      await fig.evaluate({
        $firstOf: [{ $track: null }, { $track: null }, { $track: 'third' }],
      })
    ).toBe('third')
    expect(calls).toEqual([null, null, 'third'])
  })

  test('all candidates null, or none at all, is null (row 5)', async () => {
    expect(await ev({ $firstOf: ['$data.a', '$data.b'] })).toBe(null)
    expect(await ev({ operator: 'firstOf', values: [] })).toBe(null)
    expect(await ev({ operator: 'firstOf', values: '$data.empty' }, { empty: [] })).toBe(null)
  })

  test('a failing candidate fails the node — it skips nulls, not errors (row 6)', async () => {
    expect((await failure({ $firstOf: [{ $divide: [1, 0] }, 'backup'] })).code).toBe(
      'non-finite-result'
    )
    // The recorded idiom: demote a risky candidate with its own fallback
    expect(
      await ev({ $firstOf: [{ $divide: [1, 0], fallback: null }, 'backup'] })
    ).toBe('backup')
  })

  test('a literal empty list warns as a dead expression', () => {
    const issues = fig.validate({ operator: 'firstOf', values: [] }).issues
    expect(issues.map((issue) => issue.severity)).toContain('warning')
  })
})
