/**
 * Chunk 7.2 — `regex` (batch 4 in
 * docs-dev/v3-specs/v3-operator-parameters.md; register row 21 in
 * docs-dev/v3-specs/v3-cases-for-review.md).
 *
 * Hand-migrated from test/v2-working/7_regex.test.ts, which is the
 * thinnest file in the corpus: two boolean tests, converting by a pure
 * rename (`testString` → `value`, the `patternMatch` alias dropped).
 * `mode`, `flags`, `noMatchDefault`, `replacement` and everything about
 * extraction and replacement are new in v3, authored from the pass and #272.
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
        $regex: { value: 'no digits', pattern: '\\d+', mode: 'extract', noMatchDefault: 'none' },
      })
    ).toBe('none')
  })

  test('noMatchDefault is a string, as a match is, so the declared returns holds', async () => {
    const extract = (noMatchDefault: unknown) => ({
      $regex: { value: 'no digits', pattern: '\\d+', mode: 'extract', noMatchDefault },
    })
    expect(codes(extract(0))).toContain('type-check')
    expect((await failure(extract('$data.d'), { d: 0 })).code).toBe('type-check')
    // So regex never feeds a number position, whatever its default (#218)
    expect(codes({ $round: [1.2345, extract('2')] })).toContain('returns-mismatch')
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
          noMatchDefault: { $convert: [{ a: 1 }, 'string'] },
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

  test('…or answers a number, as a string default converted', async () => {
    expect(
      await ev(
        {
          $convert: {
            value: {
              $regex: {
                value: '$data.weight',
                pattern: '\\d+',
                mode: 'extract',
                noMatchDefault: '0',
              },
            },
            to: 'number',
          },
        },
        { weight: 'no digits' }
      )
    ).toBe(0)
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

describe('regex — replace', () => {
  const replace = (value: unknown, pattern: string, extra: Record<string, unknown> = {}) => ({
    $regex: { value, pattern, mode: 'replace', ...extra },
  })

  test('every match is replaced, with no g flag', async () => {
    expect(await ev(replace('a1b22c333', '\\d+', { replacement: '#' }))).toBe('a#b#c#')
  })

  test('the default replacement removes every match', async () => {
    expect(await ev(replace('(021) 555-1234', '[^0-9]'))).toBe('0215551234')
  })

  test('a null replacement is unset, so it removes them too', async () => {
    expect(await ev(replace('(021) 555-1234', '[^0-9]', { replacement: null }))).toBe('0215551234')
  })

  test('no match returns the value unchanged', async () => {
    expect(await ev(replace('no digits', '\\d', { replacement: '#' }))).toBe('no digits')
  })

  test('the JS replacement patterns apply: groups, named groups, the match, $$', async () => {
    const date = '(\\d{4})-(\\d{2})-(\\d{2})'
    expect(await ev(replace('2026-10-23', date, { replacement: '$3/$2/$1' }))).toBe('23/10/2026')
    expect(
      await ev(
        replace('2026-10', '(?<year>\\d{4})-(?<month>\\d{2})', { replacement: '$<month>/$<year>' })
      )
    ).toBe('10/2026')
    expect(await ev(replace('a1b2', '\\d', { replacement: '[$&]' }))).toBe('a[1]b[2]')
    expect(await ev(replace('5 and 7', '\\d', { replacement: '$$$&' }))).toBe('$5 and $7')
  })

  test('…and validate() reads none of them as a mistyped reference (#249)', () => {
    for (const replacement of ['$1', '$1-$2', '$<year>', '$&', '$$', "$'", '$`'])
      expect(fig.validate(replace('a', 'a', { replacement })).issues).toEqual([])
  })

  test('a replacement from the data is a pattern too: $$ writes a dollar', async () => {
    const node = replace('total: 5', '\\d+', { replacement: '$data.r' })
    expect(await ev(node, { r: '$&.00' })).toBe('total: 5.00')
    expect(await ev(node, { r: '$$&' })).toBe('total: $&')
  })

  test('flags apply', async () => {
    expect(await ev(replace('Rata ST', '\\bst$', { flags: 'i', replacement: 'Street' }))).toBe(
      'Rata Street'
    )
  })

  test('a fixed text with regex characters in it is written escaped', async () => {
    expect(await ev(replace('1.5.2', '\\.', { replacement: '-' }))).toBe('1-5-2')
  })

  test('replacement is a string — never a coercion', async () => {
    expect(codes(replace('a1', '\\d', { replacement: 0 }))).toContain('type-check')
    expect((await failure(replace('a1', '\\d', { replacement: '$data.n' }), { n: 0 })).code).toBe(
      'type-check'
    )
  })

  test('the result is a string, so it feeds a string position', async () => {
    const node = { $upper: replace('a-b', '-', { replacement: ' ' }) }
    expect(fig.validate(node).issues).toEqual([])
    expect(await ev(node)).toBe('A B')
  })

  test('no lastIndex leaks between evaluations — the same node twice agrees', async () => {
    const node = replace('a1b2', '\\d', { replacement: '#' })
    expect(await ev(node)).toBe('a#b#')
    expect(await ev(node)).toBe('a#b#')
  })
})

describe('regex — a parameter written for another mode', () => {
  const warnings = (expression: unknown, figTree: FigTree = fig) =>
    figTree
      .validate(expression)
      .issues.filter((issue) => issue.severity === 'warning')
      .map((issue) => [issue.code, issue.parameter])

  test('replacement with mode left to its test default warns — the likely slip', async () => {
    const node = { $regex: { value: '(021) 555', pattern: '[^0-9]', replacement: '' } }
    expect(warnings(node)).toEqual([['operator-validate', 'replacement']])
    // A warning, so the node still runs, in the mode it has
    expect(await ev(node)).toBe(true)
  })

  test('replacement in extract or match warns', () => {
    for (const mode of ['extract', 'match'])
      expect(warnings({ $regex: { value: 'a', pattern: 'a', mode, replacement: '-' } })).toEqual([
        ['operator-validate', 'replacement'],
      ])
  })

  test('noMatchDefault outside extract warns', () => {
    expect(warnings({ $regex: { value: 'a', pattern: 'a', noMatchDefault: 'none' } })).toEqual([
      ['operator-validate', 'noMatchDefault'],
    ])
    for (const mode of ['match', 'replace'])
      expect(
        warnings({ $regex: { value: 'a', pattern: 'a', mode, noMatchDefault: 'none' } })
      ).toEqual([['operator-validate', 'noMatchDefault']])
  })

  test('each is quiet in its own mode', () => {
    expect(
      warnings({ $regex: { value: 'a', pattern: 'a', mode: 'extract', noMatchDefault: 'none' } })
    ).toEqual([])
    expect(
      warnings({ $regex: { value: 'a', pattern: 'a', mode: 'replace', replacement: '-' } })
    ).toEqual([])
  })

  test('a dynamic replacement is written on the node, so it warns too', () => {
    expect(warnings({ $regex: { value: 'a', pattern: 'a', replacement: '$data.r' } })).toEqual([
      ['operator-validate', 'replacement'],
    ])
  })

  test('a dynamic mode may be the right one, so it is silent', () => {
    expect(
      warnings({ $regex: { value: 'a', pattern: 'a', mode: '$data.m', replacement: '-' } })
    ).toEqual([])
  })

  test('a host default is not written on the node, so it never warns', () => {
    const hosted = new FigTree({
      operatorDefaults: { regex: { replacement: '-', noMatchDefault: 'none' } },
    })
    expect(warnings({ $regex: ['a', 'a'] }, hosted)).toEqual([])
  })

  test("…while a host mode counts as the node's mode", async () => {
    const replacing = new FigTree({ operatorDefaults: { regex: { mode: 'replace' } } })
    const node = { $regex: { value: 'a1', pattern: '\\d', replacement: '#' } }
    expect(warnings(node, replacing)).toEqual([])
    expect(await replacing.evaluate(node)).toBe('a#')
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

  test('mode is a literal union — a bad literal is caught at compile', () => {
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
