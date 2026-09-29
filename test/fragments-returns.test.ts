/**
 * A fragment's result type (#200): inferred at registration from its body's
 * root, reported by `getFragments()` as `returns`, and tested against the
 * receiving parameter wherever a call feeds one — as an operator node's
 * declared `returns` is. Beside it, the same feeding check for a container
 * holding something computed, whose type is known without running it.
 */
import { FigTree, FigTreeError, ErrorCodes, isFigTreeError } from '../src'
import type { FragmentDefinition } from '../src'

const returnsOf = (fragments: Record<string, FragmentDefinition>) =>
  Object.fromEntries(new FigTree({ fragments }).getFragments().map((f) => [f.name, f.returns]))

describe('returns, inferred from the body root', () => {
  test.each([
    ['an operator node: its declared returns', { $upper: '$data.x' }, 'string'],
    ['in the canonical form too', { operator: 'round', value: 1.5 }, 'number'],
    ['taken as declared, not narrowed', { $plus: [1, 2] }, ['number', 'string', 'array', 'object']],
    [
      'a fallback is ignored, as the operator check ignores it',
      { $upper: '$data.x', fallback: 0 },
      'string',
    ],
    ['a string constant', 'hello', 'string'],
    ['a number constant is number, never integer', 5, 'number'],
    ['a boolean constant', true, 'boolean'],
    ['null', null, 'null'],
    ['a constant object', { a: 1 }, 'object'],
    ['a constant array', [1, 2], 'array'],
    ['literal content', { $literal: { $plus: [1, 2] } }, 'object'],
    ['a container holding something computed', { a: '$data.x' }, 'object'],
    ['an array holding something computed', ['$data.x', 1], 'array'],
    ['a reference', '$data.x', 'any'],
    // The type table's `object` admits any non-array object, a Date included
    ['a Date constant, as the type table reads it', new Date('2026-09-30T00:00:00Z'), 'object'],
    ['a constant with no basic type', () => 1, 'any'],
  ])('%s', (_label, expression, expected) => {
    expect(returnsOf({ f: { expression } })).toEqual({ f: expected })
  })

  test("a call takes the called fragment's type, whatever the key order", () => {
    expect(
      returnsOf({
        outer: { expression: { $middle: {} } },
        middle: { expression: { fragment: 'inner' } },
        inner: { expression: { $upper: 'x' } },
      })
    ).toEqual({ outer: 'string', middle: 'string', inner: 'string' })
  })

  test('a body reading its parameter is any: references are untyped', () => {
    expect(
      returnsOf({ f: { expression: '$params.x', parameters: { x: { type: 'string' } } } })
    ).toEqual({ f: 'any' })
  })
})

describe('the feeding check at a call', () => {
  const fig = new FigTree({
    fragments: {
      shout: { expression: { $upper: 'hello' } },
      size: { expression: { $length: { value: [1, 2] } } },
      anything: { expression: '$data.x' },
    },
  })
  const issuesOf = (expression: unknown) => fig.validate(expression).issues

  test('a call whose returns cannot meet the parameter is a returns-mismatch', () => {
    for (const expression of [
      { $round: { value: { fragment: 'shout' } } },
      { $round: { value: { $shout: {} } } },
    ]) {
      const [issue] = issuesOf(expression)
      expect(issue).toMatchObject({
        severity: 'error',
        code: ErrorCodes.returnsMismatch,
        operator: 'round',
        parameter: 'value',
      })
      expect(issue.message).toContain("fragment 'shout' returns")
    }
  })

  test('a call that can meet it, or returns any, passes', () => {
    expect(issuesOf({ $round: { value: { $size: {} } } })).toEqual([])
    expect(issuesOf({ $round: { value: { $anything: {} } } })).toEqual([])
  })

  test('a call to an unknown fragment reports only that', () => {
    const codes = issuesOf({ $round: { value: { fragment: 'nope' } } }).map((i) => i.code)
    expect(codes).toEqual([ErrorCodes.unknownFragment])
  })

  test('a body feeding a mismatched call fails registration, whatever the key order', () => {
    const register = () =>
      new FigTree({
        fragments: {
          caller: { expression: { $round: { value: { $shout: {} } } } },
          shout: { expression: { $upper: 'hello' } },
        },
      })
    let error: unknown
    try {
      register()
    } catch (thrown) {
      error = thrown
    }
    expect(isFigTreeError(error)).toBe(true)
    expect((error as FigTreeError).issues?.map((issue) => issue.code)).toEqual([
      ErrorCodes.returnsMismatch,
    ])
  })

  test('a cycle through body roots is still reported as a cycle', () => {
    let error: unknown
    try {
      new FigTree({
        fragments: { a: { expression: { $b: {} } }, b: { expression: { $a: {} } } },
      })
    } catch (thrown) {
      error = thrown
    }
    expect((error as FigTreeError).issues?.map((issue) => issue.code)).toContain(
      ErrorCodes.fragmentCycle
    )
  })
})

describe('the feeding check at a container holding something computed', () => {
  const fig = new FigTree()

  test.each([
    ['an object at a number', { $round: { value: { a: '$data.x' } } }, ['$round', 'value']],
    ['an array at a string', { $upper: { value: ['$data.x'] } }, ['$upper', 'value']],
  ])('%s is a type-check error, as the literal would be', (_label, expression, path) => {
    const [issue] = fig.validate(expression).issues
    expect(issue).toMatchObject({ severity: 'error', code: ErrorCodes.typeCheck, path })
  })

  test('the same message as a constant container', () => {
    const computed = fig.validate({ $round: { value: { a: '$data.x' } } }).issues[0]
    const constant = fig.validate({ $round: { value: { a: 1 } } }).issues[0]
    expect(computed.message).toBe(constant.message)
  })

  test('a container where one is admitted passes', () => {
    expect(fig.validate({ $length: { value: ['$data.x'] } }).issues).toEqual([])
    expect(fig.validate({ $get: { path: 'a', from: { a: '$data.x' } } }).issues).toEqual([])
  })
})
