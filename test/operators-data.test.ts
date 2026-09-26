/**
 * Chunk 7.1 — `get` and `buildObject` (batch 6 in
 * docs-dev/v3-specs/v3-operator-parameters-2.md; register rows 25 and 26
 * in docs-dev/v3-specs/v3-cases-for-review.md).
 *
 * Hand-migrated from test/v2-working/8_objectProperties.test.ts and
 * test/v2-working/14_buildObject.test.ts, with the batch's behaviour
 * changes asserted in place of the v2 rows they replace: a missing path
 * yields null instead of throwing, `additionalData`'s merge becomes
 * `from`'s replace, implicit array projection becomes an explicit `[*]`,
 * v2's alternating key/value form dies, and its silent malformed-entry
 * filter becomes a type error.
 */
import { FigTree, FigTreeError } from '../src'
import { rejection } from './helpers/rejection'

const fig = new FigTree()
const ev = (expression: unknown, data?: Record<string, unknown>) =>
  fig.evaluate(expression, data !== undefined ? { data } : {})
const failure = (expression: unknown, data?: Record<string, unknown>) =>
  rejection<FigTreeError>(ev(expression, data))

const data = {
  user: { id: 2, firstName: 'Steve', lastName: 'Rogers', phone: null },
  organisation: { id: 1, name: 'The Avengers' },
  application: { questions: { q1: 'What is the answer?', q2: 'Enter your name' } },
  weapons: [
    { name: 'Blaster', power: 3 },
    { name: 'Seismic charge', power: 9 },
  ],
  letters: ['a', 'b', 'c'],
  'exotic.key': 'quoted',
}

// ── get ─────────────────────────────────────────────────────────────

describe('get — the sugar contract', () => {
  test('a literal path reads the evaluation data, exactly as the reference would', async () => {
    expect(await ev({ $get: 'user.firstName' }, data)).toBe('Steve')
    expect(await ev({ $get: 'user.firstName' }, data)).toBe(await ev('$data.user.firstName', data))
  })

  test('a dynamic path is the operator whole purpose', async () => {
    expect(await ev({ $get: '$data.chosen' }, { ...data, chosen: 'organisation.name' })).toBe(
      'The Avengers'
    )
  })

  test('the canonical face agrees with the shorthand', async () => {
    expect(await ev({ operator: 'get', path: 'user.lastName' }, data)).toBe('Rogers')
  })

  test('bracket indices, and a path that is an index all the way down', async () => {
    expect(await ev({ $get: 'letters[2]' }, data)).toBe('c')
    expect(await ev({ $get: 'weapons[1].name' }, data)).toBe('Seismic charge')
  })

  test('an empty path is the bare-reference rule — the whole source', async () => {
    expect(await ev({ $get: '' }, { a: 1 })).toEqual({ a: 1 })
    expect(await ev({ $get: { path: [] } }, { a: 1 })).toEqual({ a: 1 })
  })

  test('a null path propagates', async () => {
    expect(await ev({ $get: '$data.absent' }, data)).toBeNull()
  })
})

describe('get — the path grammar', () => {
  test('a segments array takes its strings VERBATIM — no escaping question', async () => {
    expect(await ev({ $get: { path: ['exotic.key'] } }, data)).toBe('quoted')
    expect(await ev({ $get: { path: ['weapons', 0, 'name'] } }, data)).toBe('Blaster')
  })

  test('a quoted bracket segment reaches the same exotic key from the string face', async () => {
    expect(await ev({ $get: '["exotic.key"]' }, data)).toBe('quoted')
  })

  test('[*] projects the remainder over an array, in order', async () => {
    expect(await ev({ $get: 'weapons[*].name' }, data)).toEqual(['Blaster', 'Seismic charge'])
  })

  test('a per-element miss under [*] is a null slot, not a whole-path miss', async () => {
    expect(
      await ev({ $get: { path: 'xs[*].a', default: 'MISSING' } }, { xs: [{ a: 1 }, {}] })
    ).toEqual([1, null])
  })

  test('chained projections nest rather than flatten', async () => {
    const nested = { teams: [{ players: [{ n: 1 }, { n: 2 }] }, { players: [{ n: 3 }] }] }
    expect(await ev({ $get: 'teams[*].players[*].n' }, nested)).toEqual([[1, 2], [3]])
  })

  test('numeric segments read JS-style — an index on an array, a key on an object', async () => {
    expect(await ev({ $get: 'letters.1' }, data)).toBe('b')
    expect(await ev({ $get: { path: ['letters', '2'] } }, data)).toBe('c')
    expect(await ev({ $get: '0' }, { 0: 'zero' })).toBe('zero')
  })

  test('resolution reads own enumerable properties only — no prototype leakage', async () => {
    expect(await ev({ $get: '__proto__' }, data)).toBeNull()
    expect(await ev({ $get: 'user.constructor' }, data)).toBeNull()
    expect(await ev({ $get: 'user.firstName.length' }, data)).toBeNull()
  })

  test('a malformed LITERAL path is an authoring error, caught before evaluation', () => {
    const result = fig.validate({ $get: 'a[' })
    expect(result.valid).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toContain('operator-validate')
  })

  test('a malformed DYNAMIC path is an ordinary runtime failure', async () => {
    const error = await failure({ $get: '$data.bad' }, { bad: 'a[' })
    expect(error.code).toBe('operator-failure')
  })
})

describe('get — absence (register row 26)', () => {
  test('a missing path yields null — absence is not failure', async () => {
    expect(await ev({ $get: 'user.middleName' }, data)).toBeNull()
  })

  test('`default` fires on a missing path', async () => {
    expect(await ev({ $get: ['user.middleName', 'N/A'] }, data)).toBe('N/A')
  })

  test('a STORED null passes through — the default does not fire', async () => {
    expect(await ev({ $get: ['user.phone', 'N/A'] }, data)).toBeNull()
  })

  test('a null partway along the path is a miss — the default fires', async () => {
    expect(await ev({ $get: ['user.phone.number', 'N/A'] }, data)).toBe('N/A')
  })

  test('`default` is lazy — it evaluates only on a miss', async () => {
    expect(await ev({ $get: ['user.firstName', { $divide: [1, 0] }] }, data)).toBe('Steve')
    await expect(failure({ $get: ['user.nope', { $divide: [1, 0] }] }, data)).resolves.toBeDefined()
  })

  test('under strictDataPaths a missing path is a catchable runtime failure', async () => {
    const strict = new FigTree({ strictDataPaths: true })
    const error = await rejection<FigTreeError>(
      strict.evaluate({ $get: 'user.middleName' }, { data })
    )
    expect(error.code).toBe('missing-data-path')
    expect(await strict.evaluate({ $get: 'user.middleName', fallback: 'caught' }, { data })).toBe(
      'caught'
    )
  })

  test('`default` is the per-site strictness opt-out, null included', async () => {
    const strict = new FigTree({ strictDataPaths: true })
    expect(await strict.evaluate({ $get: ['user.middleName', 'N/A'] }, { data })).toBe('N/A')
    expect(
      await strict.evaluate({ $get: { path: 'user.middleName', default: null } }, { data })
    ).toBeNull()
  })
})

describe('get — from', () => {
  test('from REPLACES the evaluation data, it never merges with it', async () => {
    expect(await ev({ $get: { path: 'name', from: '$data.organisation' } }, data)).toBe(
      'The Avengers'
    )
    // `user` is a top-level data key; under v2 merge semantics it would
    // still be reachable through a supplied source
    expect(
      await ev({ $get: { path: 'user.firstName', from: '$data.organisation' } }, data)
    ).toBeNull()
  })

  test('merging stays one node away', async () => {
    expect(
      await ev(
        {
          $get: {
            path: 'name',
            from: { $plus: { values: ['$data.user', '$data.organisation'], expect: 'object' } },
          },
        },
        data
      )
    ).toBe('The Avengers')
  })

  test('a null from is a source where every path is missing', async () => {
    expect(
      await ev({ $get: { path: 'name', from: '$data.absent', default: 'Anonymous' } }, data)
    ).toBe('Anonymous')
  })

  test('drilling into a non-container misses the same way', async () => {
    expect(await ev({ $get: { path: 'anything', from: 42 } })).toBeNull()
    expect(await ev({ $get: { path: 'length', from: 'a string' } })).toBeNull()
  })

  test('from drills into an inline node result', async () => {
    expect(
      await ev(
        {
          $get: {
            path: 'name',
            from: { $find: ['$data.weapons', { $greaterThan: ['$element.power', 5] }] },
          },
        },
        data
      )
    ).toBe('Seismic charge')
  })

  test('from is named-face only — the second positional slot is `default`', async () => {
    expect(await ev({ $get: ['nope', 'the default'] }, data)).toBe('the default')
  })
})

// ── buildObject ─────────────────────────────────────────────────────

describe('buildObject', () => {
  test('the basic entry list, both faces', async () => {
    const expected = { someKey: 'someValue' }
    expect(await ev({ $buildObject: [{ key: 'someKey', value: 'someValue' }] })).toEqual(expected)
    expect(
      await ev({ operator: 'buildObject', entries: [{ key: 'someKey', value: 'someValue' }] })
    ).toEqual(expected)
  })

  test('the point of the operator: keys computed at runtime', async () => {
    expect(
      await ev({ $buildObject: [{ key: '$data.user.firstName', value: '$data.user.id' }] }, data)
    ).toEqual({ Steve: 2 })
  })

  test('keys take the canonical string form', async () => {
    expect(
      await ev({
        $buildObject: [
          { key: 1, value: 'one' },
          { key: true, value: 'yes' },
        ],
      })
    ).toEqual({ 1: 'one', true: 'yes' })
  })

  test('nesting and evaluation on both sides', async () => {
    expect(
      await ev({
        $buildObject: [
          { key: 'someKey', value: 'someValue' },
          {
            key: { $plus: ['built', 'Key'] },
            value: { $buildObject: [{ key: 'inner', value: { $plus: [['one'], [2]] } }] },
          },
        ],
      })
    ).toEqual({ someKey: 'someValue', builtKey: { inner: ['one', 2] } })
  })

  test('a null value KEEPS its key — row 25', async () => {
    expect(await ev({ $buildObject: [{ key: 'phone', value: '$data.user.phone' }] }, data)).toEqual(
      {
        phone: null,
      }
    )
    expect(await ev({ $buildObject: [{ key: 'absent', value: '$data.nope' }] }, data)).toEqual({
      absent: null,
    })
  })

  test('the drop idiom is one filter away', async () => {
    expect(
      await ev(
        {
          $buildObject: {
            entries: {
              $filter: [
                [
                  { key: 'a', value: 1 },
                  { key: 'b', value: null },
                ],
                { $notEqual: ['$element.value', null] },
              ],
            },
          },
        },
        data
      )
    ).toEqual({ a: 1 })
  })

  test('duplicate keys: last wins, in declaration order', async () => {
    expect(
      await ev({
        $buildObject: [
          { key: 'k', value: 'first' },
          { key: 'k', value: 'last' },
        ],
      })
    ).toEqual({ k: 'last' })
  })

  test('empty entries is {}, and a dynamic empty list likewise', async () => {
    expect(await ev({ $buildObject: '$data.none' }, { none: [] })).toEqual({})
  })

  test('a malformed entry is a type error where v2 silently filtered it', async () => {
    const error = await failure(
      { $buildObject: '$data.entries' },
      { entries: [{ value: 'no key' }] }
    )
    expect(error.code).toBe('type-check')
    expect(
      (await failure({ $buildObject: '$data.entries' }, { entries: [{ key: 'k' }] })).code
    ).toBe('type-check')
    expect((await failure({ $buildObject: '$data.entries' }, { entries: ['nope'] })).code).toBe(
      'type-check'
    )
    expect((await failure({ $buildObject: '$data.entries' }, { entries: [null] })).code).toBe(
      'type-check'
    )
  })

  test('a null key and a composite key both reject', async () => {
    expect(
      (await failure({ $buildObject: '$data.entries' }, { entries: [{ key: null, value: 1 }] }))
        .code
    ).toBe('type-check')
    expect(
      (await failure({ $buildObject: '$data.entries' }, { entries: [{ key: [1, 2], value: 3 }] }))
        .code
    ).toBe('type-check')
  })

  test('a whole-null entries is a type error, not a propagated null', async () => {
    expect((await failure({ $buildObject: '$data.nope' }, data)).code).toBe('type-check')
  })

  test('output keys are data, never compiled — the reserved-word escape', async () => {
    expect(
      await ev({
        $buildObject: [
          { key: 'operator', value: 'plus' },
          { key: 'vars', value: 1 },
          // A $-shaped key is authored data, so it takes the quote
          { key: { $literal: '$data' }, value: 2 },
        ],
      })
    ).toEqual({ operator: 'plus', vars: 1, $data: 2 })
  })
})

describe('buildObject — static findings', () => {
  test('duplicate literal keys warn', () => {
    const issues = fig.validate({
      $buildObject: [
        { key: 'k', value: 1 },
        { key: 'k', value: 2 },
      ],
    }).issues
    expect(issues.map((issue) => issue.severity)).toContain('warning')
    expect(issues.map((issue) => issue.code)).toContain('operator-validate')
  })

  test('distinct literal keys draw nothing', () => {
    expect(
      fig.validate({
        $buildObject: [
          { key: 'a', value: 1 },
          { key: 'b', value: 2 },
        ],
      }).issues
    ).toEqual([])
  })

  test('a literal empty entries is a dead expression, warned not errored', () => {
    const result = fig.validate({ $buildObject: [] })
    expect(result.valid).toBe(true)
    expect(result.issues.map((issue) => issue.severity)).toEqual(['warning'])
  })
})
