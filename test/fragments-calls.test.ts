/**
 * Chunk 11.2 — fragment calls at runtime ("Call-site semantics: two
 * argument modes" and "Composition & recursion" in the Fragments area of
 * docs-dev/v3-specs/v3-api.md).
 *
 * Laziness is asserted the way `vars.test.ts` asserts it: every argument
 * that matters is a spy, and the test reads its call log. Lazy, memoized
 * and shared-in-flight are one observable claim — the argument ran at most
 * once, and only if the body reached it.
 */
import { FigTree, FigTreeError, ErrorCodes, isFigTreeError, coreOperators } from '../src'
import { boomOp, echoOp, spyOp } from './fixtures/evalOperators'
import type { FragmentDefinition } from '../src'

const rejection = async (promise: Promise<unknown>): Promise<FigTreeError> => {
  try {
    await promise
  } catch (error) {
    if (isFigTreeError(error)) return error
    throw error
  }
  throw new Error('expected a rejection')
}

const build = (fragments: Record<string, FragmentDefinition>, operators: unknown[] = []): FigTree =>
  new FigTree({
    operators: [coreOperators, ...(operators as never[])],
    fragments,
  })

/** A spy with no parameters, answering `result` — one argument's worth. */
const source = (name: string, result: unknown) => spyOp(name, {}, { result })

// ── Lazy, memoized, caller-scoped arguments ─────────────────────────

describe('arguments are lazy and memoized per call', () => {
  test('two references in the body, one evaluation', async () => {
    const a = source('a', 7)
    const fig = build(
      { twice: { expression: { $plus: ['$params.n', '$params.n'] }, parameters: { n: {} } } },
      [a.definition]
    )
    expect(await fig.evaluate({ $twice: { n: { $a: {} } } })).toBe(14)
    expect(a.calls).toHaveLength(1)
  })

  test('an argument the body never reaches never evaluates', async () => {
    const taken = source('taken', 'yes')
    const skipped = source('skipped', 'no')
    const fig = build(
      {
        pick: {
          expression: { $if: [true, '$params.a', '$params.b'] },
          parameters: { a: {}, b: {} },
        },
      },
      [taken.definition, skipped.definition]
    )
    expect(await fig.evaluate({ $pick: { a: { $taken: {} }, b: { $skipped: {} } } })).toBe('yes')
    expect(taken.calls).toHaveLength(1)
    expect(skipped.calls).toHaveLength(0)
  })

  test('two call sites are two instances, each with its own arguments', async () => {
    const a = source('a', 1)
    const fig = build({ echoFrag: { expression: '$params.n', parameters: { n: {} } } }, [
      a.definition,
    ])
    expect(
      await fig.evaluate({
        $plus: [{ $echoFrag: { n: { $a: {} } } }, { $echoFrag: { n: { $a: {} } } }],
      })
    ).toBe(2)
    // Memoization is per call instance, not per fragment
    expect(a.calls).toHaveLength(2)
  })

  test('an argument evaluates in the caller scope, not the body', async () => {
    const fig = build({ read: { expression: '$params.v', parameters: { v: {} } } })
    const result = await fig.evaluate({
      vars: { fromCaller: 'seen' },
      out: { $read: { v: '$vars.fromCaller' } },
    })
    expect(result).toEqual({ out: 'seen' })
  })

  test('an argument may read a caller iterator binding', async () => {
    const fig = build({ row: { expression: '$params.r', parameters: { r: {} } } })
    expect(
      await fig.evaluate({
        $map: { input: [1, 2], each: { $row: { r: '$element' } } },
      })
    ).toEqual([1, 2])
  })
})

// ── Sealing ─────────────────────────────────────────────────────────

describe('a body is sealed from its caller', () => {
  // The static half is registration's (a body compiles in isolation, so an
  // unbound reference is refused there). What is left to prove at runtime
  // is that a body declaring its OWN var of the same name gets its own
  test('a body var shadows nothing — the caller var is simply not there', async () => {
    const fig = build({
      inner: { expression: { vars: { x: 'body' }, seen: '$vars.x' } },
    })
    const result = await fig.evaluate({ vars: { x: 'caller' }, out: { $inner: {} } })
    expect(result).toEqual({ out: { seen: 'body' } })
  })

  test('a body iterator binds its own element', async () => {
    const fig = build({
      doubler: {
        expression: { $map: { input: '$params.rows', each: { $plus: ['$element', '$element'] } } },
        parameters: { rows: { type: 'array' } },
      },
    })
    expect(
      await fig.evaluate({ $map: { input: [[1], [2]], each: { $doubler: { rows: '$element' } } } })
    ).toEqual([[2], [4]])
  })
})

// ── The declaration layers ──────────────────────────────────────────

describe('declarations govern what a body receives', () => {
  const fig = () =>
    build({
      frag: {
        expression: '$params',
        parameters: {
          required: { type: 'any' },
          withDefault: { type: 'string', default: 'fallen back' },
          bare: { required: false },
          nullable: { type: ['string', 'null'], required: false },
        },
      },
    })

  test('a default applies where the argument is absent', async () => {
    expect(await fig().evaluate({ $frag: { required: 1 } })).toEqual({
      required: 1,
      withDefault: 'fallen back',
      bare: null,
      nullable: null,
    })
  })

  test('null at an optional parameter means unset', async () => {
    const result = (await fig().evaluate({ $frag: { required: 1, withDefault: null } })) as Record<
      string,
      unknown
    >
    expect(result.withDefault).toBe('fallen back')
  })

  test('a type that names null receives null as a value', async () => {
    const result = (await fig().evaluate({ $frag: { required: 1, nullable: null } })) as Record<
      string,
      unknown
    >
    expect(result.nullable).toBeNull()
  })

  test('an optional parameter with no default yields null', async () => {
    const result = (await fig().evaluate({ $frag: { required: 1 } })) as Record<string, unknown>
    expect(result.bare).toBeNull()
  })

  test('a dynamic argument of the wrong type fails at the call', async () => {
    const error = await rejection(
      fig().evaluate({ $frag: { required: 1, withDefault: '$data.n' } }, { data: { n: 7 } })
    )
    expect(error.code).toBe(ErrorCodes.typeCheck)
    expect(error.message).toContain("parameter 'withDefault': expected string, received number")
  })

  test('runtimeTypeCheck: false removes the check but not the null reading', async () => {
    const loose = fig()
    const result = (await loose.evaluate(
      { $frag: { required: 1, withDefault: '$data.n' } },
      { data: { n: 7 }, runtimeTypeCheck: false }
    )) as Record<string, unknown>
    expect(result.withDefault).toBe(7)
  })

  test('a literal argument of the wrong type is refused before evaluation', () => {
    const issues = fig().validate({ $frag: { required: 1, withDefault: 7 } }).issues
    expect(issues[0].code).toBe(ErrorCodes.typeCheck)
  })
})

// ── Call faces ──────────────────────────────────────────────────────

describe('the call faces', () => {
  const fig = () =>
    build({ greet: { expression: '$params.name', parameters: { name: { type: 'string' } } } })

  test('the canonical face', async () => {
    expect(await fig().evaluate({ fragment: 'greet', parameters: { name: 'Ada' } })).toBe('Ada')
  })

  test('the shorthand face', async () => {
    expect(await fig().evaluate({ $greet: { name: 'Ada' } })).toBe('Ada')
  })

  test('a zero-argument call takes either spelling', async () => {
    const zero = build({ zero: { expression: 'constant' } })
    expect(await zero.evaluate({ fragment: 'zero' })).toBe('constant')
    expect(await zero.evaluate({ $zero: {} })).toBe('constant')
  })

  test('a reference-string payload stays a hard error in shorthand position', () => {
    const issues = fig().validate({ $greet: '$data.args' }).issues
    expect(issues[0].code).toBe(ErrorCodes.malformedNode)
    expect(issues[0].message).toContain('no single-value or positional form')
  })
})

// ── Dynamic arguments ───────────────────────────────────────────────

describe('dynamic arguments', () => {
  const fig = () =>
    build({
      frag: {
        expression: '$params',
        parameters: { a: { type: 'number' }, b: { type: 'string', default: 'dflt' } },
      },
    })

  test('the whole object arrives from one evaluation', async () => {
    expect(
      await fig().evaluate(
        { fragment: 'frag', parameters: '$data.args' },
        { data: { args: { a: 1, b: 'given' } } }
      )
    ).toEqual({ a: 1, b: 'given' })
  })

  test('extra keys are ignored — declarations define the read-set', async () => {
    expect(
      await fig().evaluate(
        { fragment: 'frag', parameters: '$data.args' },
        { data: { args: { a: 1, unread: 'inert' } } }
      )
    ).toEqual({ a: 1, b: 'dflt' })
  })

  test('a missing required parameter is a runtime error', async () => {
    const error = await rejection(
      fig().evaluate({ fragment: 'frag', parameters: '$data.args' }, { data: { args: { b: 'x' } } })
    )
    expect(error.code).toBe(ErrorCodes.missingRequired)
    expect(error.message).toContain("requires 'a'")
    // One condition, one code, on both sides of the boundary: the static
    // form of the same call classifies identically, and reads identically
    const [statically] = fig().validate({ fragment: 'frag', parameters: { b: 'x' } }).issues
    expect(statically.code).toBe(error.code)
    expect(statically.message).toBe(error.message)
    // The issue names its owner, as an operator issue names its operator
    expect(statically.fragment).toBe('frag')
    expect(statically.parameter).toBe('a')
    expect(statically.operator).toBeUndefined()
  })

  test('a non-object result is a runtime type error', async () => {
    const error = await rejection(
      fig().evaluate({ fragment: 'frag', parameters: '$data.args' }, { data: { args: 7 } })
    )
    expect(error.code).toBe(ErrorCodes.typeCheck)
    expect(error.message).toContain('must evaluate to an object, received number')
  })

  // The one exception to laziness, inherent to the mode: there is no
  // per-argument expression to address, so the check is whole and eager
  test('the signature is checked even where the body reads nothing', async () => {
    const ignores = build({
      ignores: { expression: 'constant', parameters: { a: { type: 'number' } } },
    })
    const error = await rejection(
      ignores.evaluate({ fragment: 'ignores', parameters: '$data.args' }, { data: { args: {} } })
    )
    expect(error.code).toBe(ErrorCodes.missingRequired)
  })

  test('a fallback on the call catches a bad arguments object', async () => {
    expect(
      await fig().evaluate(
        { fragment: 'frag', parameters: '$data.args', fallback: 'caught' },
        { data: { args: 7 } }
      )
    ).toBe('caught')
  })
})

// ── Bare $params ────────────────────────────────────────────────────

describe('bare $params', () => {
  test('is the declared parameters resolved, defaults applied', async () => {
    const fig = build({
      frag: {
        expression: '$params',
        parameters: { a: {}, b: { type: 'string', default: 'x' } },
      },
    })
    expect(await fig.evaluate({ $frag: { a: 1 } })).toEqual({ a: 1, b: 'x' })
  })

  test('demands every argument — laziness is gone for that call', async () => {
    const unread = source('unread', 'evaluated')
    const fig = build({ frag: { expression: '$params', parameters: { a: {}, b: {} } } }, [
      unread.definition,
    ])
    await fig.evaluate({ $frag: { a: 1, b: { $unread: {} } } })
    expect(unread.calls).toHaveLength(1)
  })

  test('is an error outside a fragment body', () => {
    const issues = build({}).validate({ $not: '$params' }).issues
    expect(issues[0].code).toBe(ErrorCodes.unresolvedParam)
  })

  test('bare $vars is an error with its own code', () => {
    const issues = build({}).validate({ $not: '$vars' }).issues
    expect(issues[0].code).toBe(ErrorCodes.bareVars)
    expect(issues[0].message).toContain('must name a var')
  })
})

// ── Composition, fallback and caching ───────────────────────────────

describe('composition', () => {
  test('a fragment calls a fragment, arguments and all', async () => {
    const fig = build({
      outer: {
        expression: { $inner: { doubled: { $plus: ['$params.n', '$params.n'] } } },
        parameters: { n: { type: 'number' } },
      },
      inner: { expression: '$params.doubled', parameters: { doubled: {} } },
    })
    expect(await fig.evaluate({ $outer: { n: 4 } })).toBe(8)
  })

  test('a call-site fallback catches a body failure', async () => {
    const fig = build({ frag: { expression: { $boom: {} } } }, [boomOp()])
    expect(await fig.evaluate({ fragment: 'frag', fallback: 'caught' })).toBe('caught')
    expect(await fig.evaluate({ $frag: {}, fallback: 'caught' })).toBe('caught')
  })

  test('a fallback inside the body catches it first', async () => {
    const fig = build({ frag: { expression: { $boom: {}, fallback: 'inner' } } }, [boomOp()])
    expect(await fig.evaluate({ $frag: {}, fallback: 'outer' })).toBe('inner')
  })

  test('a failing fallback attaches the original as cause', async () => {
    const fig = build({ frag: { expression: { $boom: { value: 'body' } } } }, [boomOp(), echoOp()])
    const error = await rejection(
      fig.evaluate({ $frag: {}, fallback: { $boom: { value: 'fallback' } } })
    )
    expect(error.message).toContain('fallback')
    expect((error.cause as FigTreeError).message).toContain('body')
  })

  test('useCache is refused on a call node — caching stays operator-level', () => {
    const fig = build({ frag: { expression: 1 } })
    expect(fig.validate({ fragment: 'frag', useCache: true }).issues[0].code).toBe(
      ErrorCodes.malformedNode
    )
  })
})

// ── The v2 corpus, migrated ─────────────────────────────────────────

/**
 * `test/v2-working/22_fragments.test.ts`, worked through and retired. Most
 * cases carry over directly; the ones that do not are recorded here with
 * the mechanism they died with, because a deleted behaviour is as much a
 * migration result as a kept one.
 *
 * Gone with their mechanisms, tested elsewhere or not at all:
 *   - root-level `$param` hoisting on the call node (no-hoisting rule);
 *   - per-call `fragments` (registry stability — test/evaluate-core.test.ts);
 *   - alias nodes as fragment arguments, which are `vars` here;
 *   - the `...getOptions().fragments` idiom, unnecessary since the merge
 *     rule adds rather than clobbers — and impossible, since the snapshot
 *     no longer reports the registry keys.
 */
describe('v2 corpus', () => {
  const v2 = () =>
    build({
      simpleFragment: { expression: 'The flag of Brazil is: ' },
      adder: {
        expression: { $plus: { values: '$params.values' } },
        parameters: { values: { type: 'array' } },
      },
      flag: {
        expression: { $buildString: ['flag(%1)', '$params.country'] },
        parameters: { country: { type: 'string', default: 'New Zealand' } },
      },
      weatherMatcher: {
        expression: {
          $match: {
            value: '$data.weather',
            branches: {
              sunny: {
                $match: { value: '$data.humidity', branches: { high: 'NO', normal: 'YES' } },
              },
              cloudy: 'YES',
              rainy: { $match: { value: '$data.wind', branches: { strong: 'NO', weak: 'YES' } } },
            },
          },
        },
      },
      addAndDouble: {
        expression: { $multiply: [{ $adder: { values: '$params.numbers' } }, 2] },
        parameters: { numbers: { type: 'array' } },
      },
      falsy: { expression: false },
      empty: { expression: '' },
      zero: { expression: 0 },
    })

  test('two fragments joined, one of them parameterised from data', async () => {
    expect(
      await v2().evaluate(
        { $plus: [{ $simpleFragment: {} }, { $flag: { country: '$data.myCountry' } }] },
        { data: { myCountry: 'Brazil' } }
      )
    ).toBe('The flag of Brazil is: flag(Brazil)')
  })

  test('one fragment called several times with different arguments, nested', async () => {
    expect(
      await v2().evaluate([
        { $adder: { values: [{ $adder: { values: [7, 8, 9] } }, 1] } },
        {
          $adder: {
            values: [{ $flag: { country: 'New Zealand' } }, { $flag: { country: 'Brazil' } }],
          },
        },
      ])
    ).toEqual([25, 'flag(New Zealand)flag(Brazil)'])
  })

  test('a default argument value', async () => {
    expect(await v2().evaluate({ fragment: 'flag' })).toBe('flag(New Zealand)')
  })

  test('a decision tree as a fragment, reading the evaluation data', async () => {
    expect(
      await v2().evaluate(
        { fragment: 'weatherMatcher' },
        { data: { weather: 'rainy', humidity: 'high', wind: 'strong' } }
      )
    ).toBe('NO')
  })

  test('a fragment calling a fragment', async () => {
    expect(await v2().evaluate({ $addAndDouble: { numbers: [3, 4, 5] } })).toBe(24)
  })

  // v2's alias nodes, which fragments could both define and consume
  test('a call feeding a var, referenced twice', async () => {
    const result = await v2().evaluate({
      vars: { nz: { $flag: { country: 'New Zealand' } } },
      out: { $if: [{ $notEqual: ['$vars.nz', null] }, '$vars.nz', 'Not New Zealand'] },
    })
    expect(result).toEqual({ out: 'flag(New Zealand)' })
  })

  test('a var feeding a call argument', async () => {
    expect(
      await v2().evaluate(
        {
          vars: {
            selected: { $get: { path: 'myFavouriteCountry' }, fallback: 'Country not found' },
          },
          out: { $flag: { country: '$vars.selected' } },
        },
        { data: { myFavouriteCountry: 'New Zealand' } }
      )
    ).toEqual({ out: 'flag(New Zealand)' })
  })

  test('a falsy body is returned as it is', async () => {
    expect(
      await v2().evaluate([{ fragment: 'falsy' }, { fragment: 'empty' }, { fragment: 'zero' }])
    ).toEqual([false, '', 0])
  })

  // v2 answered a missing fragment with an error STRING, and a fallback
  // could catch it. In v3 an unknown name is a static error, which sits on
  // the other side of the error partition: no fallback can answer it
  test('an unknown fragment is a static error, and a fallback cannot rescue it', async () => {
    const fig = v2()
    expect(fig.validate({ fragment: 'newFragment' }).issues[0].code).toBe(
      ErrorCodes.unknownFragment
    )
    const error = await rejection(
      fig.evaluate({ fragment: 'newFragment', fallback: 'This appears instead' })
    )
    expect(error.code).toBe(ErrorCodes.unknownFragment)
  })

  test('updateOptions adds a fragment without clobbering the others', async () => {
    const fig = v2()
    fig.updateOptions({ fragments: { extra: { expression: 'added' } } })
    expect(await fig.evaluate({ $plus: [{ $extra: {} }, { $simpleFragment: {} }] })).toBe(
      'addedThe flag of Brazil is: '
    )
  })
})
