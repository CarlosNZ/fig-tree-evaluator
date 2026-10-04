/**
 * The fallback feeding-position check (#210): a node's `fallback` stands in
 * for its value at the position the node fills, so it is checked against
 * that position's declaration, as the node itself is by `returns-mismatch`.
 * A mismatch is a warning, since it breaks only the failure path. Message
 * wording is never asserted — codes, severities and paths only.
 */
import { FigTree } from '../src'

const fig = new FigTree()

const issuesOf = (expression: unknown) => fig.validate(expression).issues

const codesOf = (expression: unknown, severity: 'error' | 'warning') =>
  issuesOf(expression)
    .filter((issue) => issue.severity === severity)
    .map((issue) => issue.code)

const divide = { $divide: ['$data.a', '$data.b'] }
const inValue = (fallback: unknown) => ({ $round: { value: { ...divide, fallback } } })

describe('fallback feeding-position check', () => {
  test('a constant fallback its position can never take warns, at the fallback', async () => {
    const expression = inValue('n/a')
    const result = fig.validate(expression)
    expect(result.valid).toBe(true)
    expect(result.issues).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'fallback-mismatch',
        path: ['$round', 'value', 'fallback'],
        operator: 'round',
        parameter: 'value',
      }),
    ])
    // A warning never blocks evaluation
    await expect(fig.evaluate(expression, { data: { a: 6, b: 2 } })).resolves.toBe(3)
  })

  test('a fallback that fits, or a null the position admits, is silent', () => {
    expect(issuesOf(inValue(0))).toEqual([])
    // round.value names null
    expect(issuesOf(inValue(null))).toEqual([])
    // round.decimals is optional and excludes null: a null there is unset
    expect(issuesOf({ $round: { value: 1.5, decimals: { ...divide, fallback: null } } })).toEqual(
      []
    )
  })

  test('positions the returns check does not cover are not checked', () => {
    const unfit = { ...divide, fallback: 'n/a' }
    for (const expression of [
      unfit, // the root
      { a: unfit }, // a plain object
      [unfit, 1], // an array
      { $not: unfit }, // an any-typed parameter
      { $plus: [unfit, 1] }, // an element of an element-addressable parameter
    ])
      expect(issuesOf(expression)).toEqual([])
  })

  test('an operator fallback is checked by its returns', () => {
    expect(codesOf(inValue({ $upper: 'x' }), 'warning')).toEqual(['fallback-mismatch'])
    expect(codesOf(inValue({ $length: { value: 'x' } }), 'warning')).toEqual([])
  })

  test('a container fallback is checked as a literal one; a reference is not checked', () => {
    expect(codesOf(inValue({ a: 1 }), 'warning')).toEqual(['fallback-mismatch'])
    expect(codesOf(inValue(['$data.x']), 'warning')).toEqual(['fallback-mismatch'])
    expect(codesOf(inValue('$data.x'), 'warning')).toEqual([])
  })

  test('the chain is checked to its end, each fallback at its own path', () => {
    const chain = inValue({ $upper: '$data.s', fallback: 'n/a' })
    expect(issuesOf(chain).map(({ code, path }) => ({ code, path }))).toEqual([
      { code: 'fallback-mismatch', path: ['$round', 'value', 'fallback'] },
      { code: 'fallback-mismatch', path: ['$round', 'value', 'fallback', 'fallback'] },
    ])
    expect(issuesOf(inValue({ ...divide, fallback: 'n/a' })).map((issue) => issue.path)).toEqual([
      ['$round', 'value', 'fallback', 'fallback'],
    ])
  })

  test('a null fallback counts as replaced only where the runtime replaces a whole null', () => {
    const input = { $get: 'list', fallback: null }
    // map.input excludes null; nullInputDefault replaces a null input
    expect(codesOf({ $map: { input, each: '$element' } }, 'warning')).toEqual(['fallback-mismatch'])
    expect(codesOf({ $map: { input, nullInputDefault: [], each: '$element' } }, 'warning')).toEqual(
      []
    )
    // plus.values declares an element null policy: nullValueDefault replaces
    // null operands, never a null in place of the whole array
    expect(codesOf({ $plus: { values: input, nullValueDefault: 0 } }, 'warning')).toEqual([
      'fallback-mismatch',
    ])
  })
})

describe('an operatorDefaults fallback', () => {
  const withDefault = (fallback: unknown) =>
    new FigTree({ operatorDefaults: { divide: { fallback } } })
  const issuesUnder = (fallback: unknown, expression: unknown) =>
    withDefault(fallback)
      .validate(expression)
      .issues.map(({ severity, code, path }) => ({ severity, code, path }))

  test("is checked where the node has no fallback of its own, on the node's path", () => {
    expect(issuesUnder('n/a', { $round: { value: divide } })).toEqual([
      { severity: 'warning', code: 'fallback-mismatch', path: ['$round', 'value'] },
    ])
    expect(issuesUnder(0, { $round: { value: divide } })).toEqual([])
    expect(issuesUnder(null, { $round: { value: divide } })).toEqual([])
  })

  test("is ignored where the node's own fallback takes its place", () => {
    expect(issuesUnder('n/a', inValue(0))).toEqual([])
  })

  test('is checked at the end of a chain', () => {
    expect(issuesUnder('n/a', inValue(divide))).toEqual([
      { severity: 'warning', code: 'fallback-mismatch', path: ['$round', 'value', 'fallback'] },
    ])
  })

  test('is not checked at a position the returns check does not cover', () => {
    expect(issuesUnder('n/a', { a: divide })).toEqual([])
  })
})

describe('a literal whole null at a replacesNullAt target', () => {
  test('is replaced at a whole-value target, and a type error at an element-policy one', () => {
    expect(codesOf({ $map: { input: null, nullInputDefault: [], each: 1 } }, 'error')).toEqual([])
    expect(codesOf({ $plus: { values: null, nullValueDefault: [1] } }, 'error')).toEqual([
      'type-check',
    ])
  })
})
