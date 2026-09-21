/**
 * Chunk 7.2 — `regex` (batch 4 in
 * docs-dev/v3-specs/v3-operator-parameters.md; register row 21 in
 * docs-dev/v3-specs/v3-cases-for-review.md).
 *
 * Hand-migrated from test/v2-working/7_regex.test.ts, which is the
 * thinnest file in the corpus: two boolean tests, converting by a pure
 * rename (`testString` → `value`, the `patternMatch` alias dropped).
 * `mode`, `flags`, `noMatchDefault` and everything about extraction are
 * new in v3 and authored from the pass.
 */
import { FigTree, FigTreeError } from '../src'
import { rejection } from './helpers/rejection'

const fig = new FigTree()
const ev = (expression: unknown, data?: Record<string, unknown>) =>
  fig.evaluate(expression, data !== undefined ? { data } : {})
const failure = (expression: unknown, data?: Record<string, unknown>) =>
  rejection<FigTreeError>(ev(expression, data))
const codes = (expression: unknown) => fig.validate(expression).issues.map((issue) => issue.code)

const EMAIL = '^[A-Za-z0-9.]+@[A-Za-z0-9]+\\.[A-Za-z0-9.]+$'

describe('regex — test (the default mode, exact v2 parity)', () => {
  test('email validation, positional face', async () => {
    expect(await ev({ $regex: ['info@somwhere.net', EMAIL] })).toBe(true)
  })

  test('email validation, named face, no match', async () => {
    expect(await ev({ operator: 'regex', value: 'info@wherever$net', pattern: EMAIL })).toBe(false)
  })

  test('the result is an actual boolean, matching anywhere in the string', async () => {
    expect(await ev({ $regex: ['abc123', '\\d+'] })).toBe(true)
    expect(await ev({ $regex: ['abc', '\\d+'] })).toBe(false)
  })

  test('it reads well in condition position', async () => {
    expect(await ev({ $if: [{ $regex: ['a@b.co', EMAIL] }, 'valid', 'invalid'] })).toBe('valid')
  })
})

describe('regex — extract', () => {
  test('the first matching substring', async () => {
    expect(await ev({ $regex: { value: 'a1b22c', pattern: '\\d+', mode: 'extract' } })).toBe('1')
  })

  test('no match is absence, not failure (row 21)', async () => {
    expect(
      await ev({ $regex: { value: 'no digits', pattern: '\\d+', mode: 'extract' } })
    ).toBeNull()
  })

  test('noMatchDefault answers instead', async () => {
    expect(
      await ev({
        $regex: { value: 'no digits', pattern: '\\d+', mode: 'extract', noMatchDefault: 0 },
      })
    ).toBe(0)
  })

  test('a matched empty string is a MATCH and passes through', async () => {
    expect(
      await ev({ $regex: { value: 'abc', pattern: 'x*', mode: 'extract', noMatchDefault: 'NONE' } })
    ).toBe('')
  })

  test('noMatchDefault is lazy — it evaluates only on a no-match', async () => {
    expect(
      await ev({
        $regex: {
          value: 'a1',
          pattern: '\\d',
          mode: 'extract',
          noMatchDefault: { $divide: [1, 0] },
        },
      })
    ).toBe('1')
  })

  test('capture groups affect matching, never the return shape', async () => {
    expect(
      await ev({ $regex: { value: 'key=value', pattern: '(\\w+)=(\\w+)', mode: 'extract' } })
    ).toBe('key=value')
  })

  test('the numeric-mining pipeline the Operators table owed', async () => {
    expect(
      await ev(
        {
          $convert: {
            value: {
              $regex: { value: '$data.weight', pattern: '\\d+(\\.\\d+)?', mode: 'extract' },
            },
            to: 'number',
          },
        },
        { weight: '15 grams' }
      )
    ).toBe(15)
  })

  test('…and a weight with no digits propagates null rather than inventing one', async () => {
    expect(
      await ev(
        {
          $convert: {
            value: { $regex: { value: '$data.weight', pattern: '\\d+', mode: 'extract' } },
            to: 'number',
          },
        },
        { weight: 'no digits' }
      )
    ).toBeNull()
  })
})

describe('regex — match', () => {
  test('every matching substring, in order', async () => {
    expect(await ev({ $regex: { value: 'a1b22c333', pattern: '\\d+', mode: 'match' } })).toEqual([
      '1',
      '22',
      '333',
    ])
  })

  test('no match is [] — a list of findings is naturally empty', async () => {
    expect(await ev({ $regex: { value: 'abc', pattern: '\\d+', mode: 'match' } })).toEqual([])
  })

  test('noMatchDefault never fires here', async () => {
    expect(
      await ev({ $regex: { value: 'abc', pattern: '\\d', mode: 'match', noMatchDefault: 'NONE' } })
    ).toEqual([])
  })

  test('capture groups still yield whole-match text', async () => {
    expect(
      await ev({ $regex: { value: 'a=1 b=2', pattern: '(\\w)=(\\d)', mode: 'match' } })
    ).toEqual(['a=1', 'b=2'])
  })

  // The pattern dialect is JS's, so the scan is JS's too: without `u` it
  // walks UTF-16 units and tears a surrogate pair, with `u` it walks code
  // points. The batch's code-point unit ruling covers `split('')` and
  // `length`; inside a pattern the flag is the author's to set
  test('the scan follows the JS rule, and `u` is what buys code points', async () => {
    expect(await ev({ $regex: { value: '😀', pattern: '.', mode: 'match' } })).toHaveLength(2)
    expect(await ev({ $regex: { value: '😀', pattern: '.', mode: 'match', flags: 'u' } })).toEqual([
      '😀',
    ])
    // Zero-length matches advance by the same unit, so the count follows
    expect(await ev({ $regex: { value: 'a😀b', pattern: 'x*', mode: 'match' } })).toHaveLength(5)
    expect(
      await ev({ $regex: { value: 'a😀b', pattern: 'x*', mode: 'match', flags: 'u' } })
    ).toHaveLength(4)
  })

  test('no lastIndex leaks between evaluations — the same node twice agrees', async () => {
    const node = { $regex: { value: 'a1b2', pattern: '\\d', mode: 'match' } }
    expect(await ev(node)).toEqual(['1', '2'])
    expect(await ev(node)).toEqual(['1', '2'])
  })
})

describe('regex — flags', () => {
  test('the admitted subset applies', async () => {
    expect(await ev({ $regex: { value: 'ABC', pattern: 'abc', flags: 'i' } })).toBe(true)
    expect(await ev({ $regex: { value: 'a\nb', pattern: 'a.b', flags: 's' } })).toBe(true)
    expect(await ev({ $regex: { value: 'a\nb', pattern: '^b$', flags: 'm' } })).toBe(true)
  })

  test('g is barred, loudly, with the hint — a literal is caught at authoring', () => {
    const result = fig.validate({ $regex: { value: 'a', pattern: 'a', flags: 'g' } })
    expect(result.valid).toBe(false)
    expect(result.issues[0].message).toContain("mode: 'match'")
  })

  test('y is barred too, and an unknown letter', () => {
    expect(codes({ $regex: { value: 'a', pattern: 'a', flags: 'y' } })).toContain(
      'operator-validate'
    )
    expect(codes({ $regex: { value: 'a', pattern: 'a', flags: 'q' } })).toContain(
      'operator-validate'
    )
  })

  test('duplicate letters error, as in JS', () => {
    expect(codes({ $regex: { value: 'a', pattern: 'a', flags: 'ii' } })).toContain(
      'operator-validate'
    )
  })

  test('a DYNAMIC bad flag set is an ordinary runtime failure', async () => {
    const error = await failure(
      { $regex: { value: 'a', pattern: 'a', flags: '$data.f' } },
      { f: 'g' }
    )
    expect(error.code).toBe('operator-failure')
  })
})

describe('regex — the pattern', () => {
  test('a malformed LITERAL pattern is an authoring error', () => {
    const result = fig.validate({ $regex: ['x', '(['] })
    expect(result.valid).toBe(false)
    expect(result.issues[0].message).toContain('does not compile')
  })

  test('a malformed DYNAMIC pattern is a catchable runtime failure', async () => {
    const error = await failure({ $regex: ['x', '$data.p'] }, { p: '([' })
    expect(error.code).toBe('operator-failure')
    expect(await ev({ $regex: ['x', '$data.p'], fallback: 'caught' }, { p: '([' })).toBe('caught')
  })

  test('a missing value or pattern propagates null', async () => {
    expect(await ev({ $regex: ['$data.absent', 'a'] })).toBeNull()
    expect(await ev({ $regex: ['a', '$data.absent'] })).toBeNull()
  })

  test('a null result is falsy in condition position', async () => {
    expect(await ev({ $if: [{ $regex: ['$data.absent', 'a'] }, 'yes', 'no'] })).toBe('no')
  })

  test('a non-string value is a type error, never a coercion', async () => {
    expect((await failure({ $regex: ['$data.n', '\\d'] }, { n: 42 })).code).toBe('type-check')
  })

  test('mode is a literal union — a bad literal is caught at parse', () => {
    expect(codes({ $regex: { value: 'a', pattern: 'a', mode: 'multiline' } })).toContain(
      'type-check'
    )
  })

  test('a dynamic mode is legal and lands on the runtime check', async () => {
    expect(
      await ev({ $regex: { value: 'a1', pattern: '\\d', mode: '$data.m' } }, { m: 'extract' })
    ).toBe('1')
    expect(
      (await failure({ $regex: { value: 'a', pattern: 'a', mode: '$data.m' } }, { m: 'nope' })).code
    ).toBe('type-check')
  })
})
