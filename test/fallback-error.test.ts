/**
 * `$error` (#239): inside a fallback, the failure that fallback caught, as a
 * plain `FallbackError` ("FallbackError" in
 * docs-dev/v3-specs/v3-evaluator-methods.md; scope and nesting in "fallback
 * semantics" in docs-dev/v3-specs/v3-api.md). The value, where it may be
 * read, nesting, fragments, the strict-path exemption, and the static checks
 * that read it.
 */
import { FigTree, OperatorFailure, coreOperators, defineOperator, isFigTreeError } from '../src'
import type {
  CoveredFinding,
  EvaluationResult,
  FallbackError,
  FigTreeError,
  FragmentDefinition,
  TraceNode,
} from '../src'
import { fallbackCoverage } from '../src/authoring'
import { boomOp, echoOp, sleepOp } from './fixtures/evalOperators'
import { rejection } from './helpers/rejection'

/** Every `errorData` `refuse` built, so a test can check what it received. */
const supplied: Record<string, unknown>[] = []

/** Fails with `http-status`, building its `errorData` fresh each time. */
const refuse = defineOperator({
  name: 'refuse',
  category: 'other',
  description: 'Fail with an OperatorFailure carrying errorData',
  parameters: { status: { type: 'number' } },
  positionalParams: ['status'],
  evaluate: ({ status }) => {
    const errorData = { status, response: { message: 'Invalid country' } }
    supplied.push(errorData)
    throw new OperatorFailure(`request failed (${String(status)})`, {
      code: 'http-status',
      errorData,
    })
  },
})

const fragments: Record<string, FragmentDefinition> = {
  breaks: { expression: { msg: { $boom: 'in body' } } },
  catches: { expression: { msg: { $boom: 'in body', fallback: '$error' } } },
  nestsCatching: { expression: { inner: { fragment: 'breaks', fallback: '$error' } } },
  reads: {
    expression: { $echo: '$params.value', fallback: '$error' },
    parameters: { value: { type: 'any' } },
  },
  passes: { expression: '$params.value', parameters: { value: { type: 'any' } } },
  says: {
    expression: { $buildString: 'Said: {{$params.message}}' },
    parameters: { message: { type: 'string' } },
  },
  givesNull: {
    expression: {
      $boom: 'in body',
      fallback: { operator: 'plus', values: ['$error.message', { a: 1 }] },
    },
  },
}

const operators = [coreOperators, echoOp(), boomOp(), refuse]
const fig = new FigTree({ operators, fragments })
const strict = new FigTree({ operators, fragments, strictDataPaths: true })

/** The trace entry for the node at `path`. */
const entryAt = (entry: TraceNode, path: (string | number)[]): TraceNode | undefined => {
  if (JSON.stringify(entry.path) === JSON.stringify(path)) return entry
  for (const child of entry.children ?? []) {
    const found = entryAt(child, path)
    if (found !== undefined) return found
  }
  return undefined
}

/** The paths of the issues `validate()` reports under `code`. */
const issuesAt = (code: string, expression: unknown) =>
  fig
    .validate(expression)
    .issues.filter((issue) => issue.code === code)
    .map(({ path }) => path)

describe('the value', () => {
  test('is the caught failure as a plain object', async () => {
    const { regions } = (await fig.evaluate({ regions: { $refuse: 400, fallback: '$error' } })) as {
      regions: FallbackError
    }
    // Strict: a plain object, carrying none of the class's other fields
    expect(regions).toStrictEqual({
      code: 'http-status',
      message: 'refuse – request failed (400)',
      path: ['regions'],
      operator: 'refuse',
      errorData: { status: 400, response: { message: 'Invalid country' } },
    })
    // As the operator supplied it, not a copy
    expect(regions.errorData).toBe(supplied.at(-1))
  })

  test('$err is $error, and drills read into it', async () => {
    const fallback = {
      code: '$err.code',
      status: '$error.errorData.status',
      server: '$err.errorData.response.message',
      at: '$error.path[0]',
    }
    expect(await fig.evaluate({ lookup: { $refuse: 404, fallback } })).toEqual({
      lookup: { code: 'http-status', status: 404, server: 'Invalid country', at: 'lookup' },
    })
  })

  test('a failure from a reference carries no operator', async () => {
    const error = await strict.evaluate({ $echo: '$data.missing', fallback: '$error' })
    expect(error).toMatchObject({ code: 'missing-data-path' })
    expect(error).not.toHaveProperty('operator')
  })

  test('each catch sees its own failure, side by side and per element', async () => {
    expect(
      await fig.evaluate({
        a: { $boom: 'first', fallback: '$error.message' },
        b: { $boom: 'second', fallback: '$error.message' },
      })
    ).toEqual({ a: 'boom – boom first', b: 'boom – boom second' })
    expect(
      await fig.evaluate({
        operator: 'map',
        input: ['1', 'x', '3'],
        each: { operator: 'convert', value: '$element', to: 'number', fallback: '$error.message' },
      })
    ).toEqual([1, expect.stringContaining("'x'"), 3])
  })

  test('a value built from it is plain data: a node it makes fail sees its own failure', async () => {
    const error = (await fig.evaluate({
      operator: 'round',
      value: { operator: 'convert', value: 'abc', to: 'number', fallback: '$error' },
      fallback: '$error',
    })) as FallbackError
    expect(error).toMatchObject({ code: 'type-check', operator: 'round' })
    expect(error.message).toContain('received object')
  })
})

describe('scope', () => {
  test.each([
    ['at the root', '$error', []],
    ['by its alias', '$err.message', []],
    ['in a node’s parameters', { operator: 'echo', value: '$error' }, ['value']],
    [
      'in the failing node’s own vars, which also feed its parameters',
      { operator: 'echo', vars: { e: '$error' }, value: '$vars.e', fallback: '$vars.e' },
      ['vars', 'e'],
    ],
    ['beside a fallback', { a: { $boom: 1, fallback: 0 }, b: '$error.message' }, ['b']],
  ])('outside a fallback it is a static error: %s', (_label, expression, path) => {
    expect(issuesAt('unresolved-binding', expression)).toEqual([path])
  })

  test('a plain object’s `fallback` key is data, and the error says whose fallback it needs', () => {
    expect(fig.validate({ label: 'Regions', fallback: '$err.message' }).issues).toEqual([
      expect.objectContaining({
        code: 'unresolved-binding',
        path: ['fallback'],
        message:
          "'$err.message' is only available inside the fallback of an operator node or fragment call",
      }),
    ])
  })

  test('beneath a $ key that names nothing, only that error is reported', () => {
    // The object was meant as a node, and its `fallback` as that node's:
    // a scope error would only repeat the unrecognized key
    const { issues } = fig.validate({ lookup: { $refuze: 404, fallback: { code: '$err.code' } } })
    expect(issues.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: 'unrecognized-identifier', path: ['lookup', '$refuze'] },
    ])
  })

  test('a fragment body reads it only inside its own fallbacks', () => {
    // A body compiles in isolation, so a call inside a fallback lends it
    // nothing
    let error: unknown
    try {
      new FigTree({ operators, fragments: { leaks: { expression: { $echo: '$error' } } } })
    } catch (thrown) {
      error = thrown
    }
    expect(isFigTreeError(error) && error.issues?.map(({ code }) => code)).toEqual([
      'unresolved-binding',
    ])
  })

  test('inside a fallback it may be read at any depth', async () => {
    const expression = {
      $boom: 1,
      fallback: {
        summary: { $buildString: 'Failed: {{$error.message}}' },
        codes: ['$err.code'],
      },
    }
    expect(fig.validate(expression).issues).toEqual([])
    expect(await fig.evaluate(expression)).toEqual({
      summary: 'Failed: boom – boom 1',
      codes: ['operator-failure'],
    })
  })

  test('a fragment argument inside a fallback reads the caller’s', async () => {
    expect(
      await fig.evaluate({
        $boom: 1,
        fallback: { fragment: 'says', parameters: { message: '$error.message' } },
      })
    ).toBe('Said: boom – boom 1')
  })
})

describe('nesting', () => {
  test('a fallback inside a fallback rebinds it; the outer reads keep the outer failure', async () => {
    expect(
      await fig.evaluate({
        $boom: 'outer',
        fallback: {
          outer: '$error.message',
          inner: { $boom: 'inner', fallback: '$error.message' },
        },
      })
    ).toEqual({ outer: 'boom – boom outer', inner: 'boom – boom inner' })
  })

  test('a var declared inside the fallback keeps the outer failure for an inner one', async () => {
    expect(
      await fig.evaluate({
        $boom: 'outer',
        fallback: {
          operator: 'boom',
          value: 'inner',
          vars: { outer: '$error' },
          fallback: { $buildString: '{{$vars.outer.message}} / {{$error.message}}' },
        },
      })
    ).toBe('boom – boom outer / boom – boom inner')
  })
})

describe('fragments', () => {
  test('a call node’s fallback: the call in the input, and where in the body', async () => {
    expect(await fig.evaluate({ result: { fragment: 'breaks', fallback: '$error' } })).toEqual({
      result: {
        code: 'operator-failure',
        message: 'boom – boom in body',
        path: ['result'],
        operator: 'boom',
        fragment: 'breaks',
        fragmentPath: ['expression', 'msg'],
      },
    })
  })

  test('a fallback inside the body: where the host would have seen it escape', async () => {
    const escaped = await rejection<FigTreeError>(fig.evaluate({ result: { fragment: 'breaks' } }))
    const { result } = (await fig.evaluate({ result: { fragment: 'catches' } })) as {
      result: { msg: FallbackError }
    }
    expect(result.msg).toEqual({
      code: escaped.code,
      message: escaped.message,
      operator: 'boom',
      path: escaped.path,
      fragment: 'catches',
      fragmentPath: escaped.fragmentPath,
    })
    expect(result.msg).toMatchObject({ path: ['result'], fragmentPath: ['expression', 'msg'] })
  })

  test('nested calls: the innermost body, and the outermost call', async () => {
    expect(await fig.evaluate({ result: { fragment: 'nestsCatching' } })).toEqual({
      result: {
        inner: {
          code: 'operator-failure',
          message: 'boom – boom in body',
          path: ['result'],
          operator: 'boom',
          fragment: 'breaks',
          fragmentPath: ['expression', 'msg'],
        },
      },
    })
  })

  test('a failed argument caught inside the body is where it was written, in the input', async () => {
    expect(
      await fig.evaluate({ result: { fragment: 'reads', parameters: { value: { $boom: 'arg' } } } })
    ).toEqual({
      result: {
        code: 'operator-failure',
        message: 'boom – boom arg',
        path: ['result', 'parameters', 'value'],
        operator: 'boom',
      },
    })
  })

  test('a call whose fallback re-reads its failed var does not make the error its own cause', async () => {
    const error = await rejection<FigTreeError>(
      fig.evaluate({
        fragment: 'passes',
        vars: { risky: { $boom: 'in the var' } },
        parameters: { value: '$vars.risky' },
        fallback: '$vars.risky',
      })
    )
    expect(error.path).toEqual(['vars', 'risky'])
    expect(error.cause).toBeUndefined()
  })
})

describe('strictDataPaths', () => {
  test('a miss inside $error is null whatever it says', async () => {
    expect(
      await strict.evaluate({
        $boom: 1,
        fallback: {
          a: '$error.nope',
          b: '$err.nope.deeper',
          c: '$error.path[3]',
          d: '$error.errorData.items[*].x',
          e: { $buildString: '[{{$error.nope}}]' },
        },
      })
    ).toEqual({ a: null, b: null, c: null, d: null, e: '[]' })
  })

  test('a $data miss beside it still fails, and the fallback gives null for it', async () => {
    const { result, trace } = (await strict.evaluate(
      { $boom: 1, fallback: { a: '$error.nope', b: '$data.nope' } },
      { trace: true }
    )) as EvaluationResult
    expect(result).toBeNull()
    expect(entryAt(trace, ['fallback', 'b'])).toMatchObject({
      status: 'failed',
      error: { code: 'missing-data-path' },
    })
  })

  test('fallbackCoverage reports nothing escaping a drill into it', async () => {
    const { uncovered } = await fallbackCoverage(strict, { $boom: 1, fallback: '$error.nope' })
    expect(uncovered).toEqual([])
    const missing = await fallbackCoverage(strict, { $boom: 1, fallback: '$data.nope' })
    expect(missing.uncovered.map(({ code }) => code)).toEqual(['missing-data-path'])
  })
})

describe('static checks', () => {
  test('bare $error is an object, so a fallback that can never fit its position warns', () => {
    expect(
      issuesAt('fallback-mismatch', { operator: 'round', value: { $boom: 1, fallback: '$error' } })
    ).toEqual([['value', 'fallback']])
    expect(issuesAt('fallback-mismatch', { $echo: { $boom: 1, fallback: '$error' } })).toEqual([])
    // What is drilled from it is not known
    expect(
      issuesAt('fallback-mismatch', {
        operator: 'round',
        value: { $boom: 1, fallback: '$error.errorData.status' },
      })
    ).toEqual([])
  })

  test('bare $error where an object can never fit is a type-check error', () => {
    const { issues } = fig.validate({
      $boom: 1,
      fallback: { operator: 'regex', value: '$error', pattern: 'x' },
    })
    expect(
      issues.map(({ severity, code, path, message }) => ({ severity, code, path, message }))
    ).toEqual([
      {
        severity: 'error',
        code: 'type-check',
        path: ['fallback', 'value'],
        message: "'regex.value': expected string | null, received object",
      },
    ])
  })

  test('an operatorDefaults fallback may not read it', () => {
    // TO-DO: allow one built only from literals and `$error` (#239, chunk 4)
    expect(
      () => new FigTree({ operators, operatorDefaults: { boom: { fallback: '$error' } } })
    ).toThrow(/must be a constant value/)
  })
})

/**
 * A fallback that reads its own `$error`, and always fails: `plus` of a
 * string and an object.
 */
const FAILS = { operator: 'plus', values: ['$error.message', { a: 1 }] }

describe('a fallback that reads its own $error never fails', () => {
  const cleanups: (() => void)[] = []
  afterEach(() => {
    cleanups.splice(0).forEach((clear) => clear())
  })
  const sleeping = () => {
    const sleep = sleepOp()
    cleanups.push(sleep.cleanup)
    return new FigTree({ operators: [...operators, sleep.definition] })
  }

  test('where it fails, its node gives null', async () => {
    expect(await fig.evaluate({ result: { $boom: 1, fallback: FAILS } })).toEqual({ result: null })
  })

  test('so does a fragment call’s', async () => {
    expect(await fig.evaluate({ result: { fragment: 'breaks', fallback: FAILS } })).toEqual({
      result: null,
    })
  })

  test('a node inside it with its own fallback still catches first', async () => {
    expect(
      await fig.evaluate({ $boom: 1, fallback: { ...FAILS, fallback: 'Lookup failed' } })
    ).toBe('Lookup failed')
    // And inside that fallback, `$error` is the inner failure
    expect(await fig.evaluate({ $boom: 1, fallback: { ...FAILS, fallback: '$error.code' } })).toBe(
      'type-check'
    )
  })

  test('a fallback without $error fails its node, as rule 4 says', async () => {
    const error = await rejection<FigTreeError>(
      fig.evaluate({ $boom: 'primary', fallback: { $boom: 'backup' } })
    )
    expect(error.message).toBe('boom – boom backup')
    expect(error.cause).toMatchObject({ message: 'boom – boom primary' })
  })

  test('so does one whose only $error belongs to a fallback nested inside it', async () => {
    const error = await rejection<FigTreeError>(
      fig.evaluate({
        $boom: 'primary',
        fallback: {
          regions: { $boom: 'regions', fallback: '$error.message' },
          countries: { $boom: 'countries' },
        },
      })
    )
    expect(error.message).toBe('boom – boom countries')
  })

  test('a var inside it that captures $error counts', async () => {
    expect(
      await fig.evaluate({
        $boom: 'primary',
        fallback: { operator: 'boom', vars: { first: '$error' }, value: '$vars.first.message' },
      })
    ).toBeNull()
  })

  test('it is decided by what is written, so an $error in a branch not taken counts', async () => {
    const expression = {
      $boom: 'primary',
      fallback: { operator: 'if', condition: '$data.backup', then: { $boom: 'b' }, else: '$err' },
    }
    expect(await fig.evaluate(expression, { data: { backup: true } })).toBeNull()
  })

  test('inside another fallback, the null is an ordinary value', async () => {
    expect(
      await fig.evaluate({
        $boom: 'outer',
        fallback: { inner: { $boom: 'inner', fallback: FAILS }, outer: '$error.message' },
      })
    ).toEqual({ inner: null, outer: 'boom – boom outer' })
  })

  test('re-reading the var that failed gives null, not rule 5’s failure', async () => {
    expect(
      await fig.evaluate({
        operator: 'echo',
        vars: { risky: { $boom: 'in the var' } },
        value: '$vars.risky',
        fallback: { $buildString: '{{$vars.risky}}: {{$error.message}}' },
      })
    ).toBeNull()
  })

  test('the whole-evaluation timeout still cuts through it', async () => {
    const expression = {
      $boom: 1,
      fallback: { message: '$error.message', slow: { operator: 'sleep', ms: 200 } },
    }
    const error = await rejection<FigTreeError>(sleeping().evaluate(expression, { timeout: 20 }))
    expect(error.code).toBe('timeout')
  })

  test('so does the caller’s signal', async () => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 20)
    const expression = {
      $boom: 1,
      fallback: { message: '$error.message', slow: { operator: 'sleep', ms: 200 } },
    }
    const error = await rejection<FigTreeError>(
      sleeping().evaluate(expression, { signal: controller.signal })
    )
    expect(error.code).toBe('aborted')
  })

  test('trace shows the node answered by its fallback, and the fallback failed', async () => {
    const { result, trace } = (await fig.evaluate(
      { $boom: 'primary', fallback: FAILS },
      { trace: true }
    )) as EvaluationResult
    expect(result).toBeNull()
    expect(trace).toMatchObject({
      status: 'fallback',
      value: null,
      error: { message: 'boom – boom primary' },
    })
    expect(entryAt(trace, ['fallback'])).toMatchObject({
      status: 'failed',
      error: { code: 'type-check' },
    })
  })
})

describe('fallbackCoverage', () => {
  const brief = ({ path, code, certainty, coveredBy, givesNull }: CoveredFinding) => ({
    path,
    code,
    certainty,
    coveredBy,
    ...(givesNull ? { givesNull } : {}),
  })

  test('a failure in a fallback that reads its own $error is covered, and gives null', async () => {
    const { uncovered, covered } = await fallbackCoverage(fig, { $boom: 1, fallback: FAILS })
    expect(uncovered).toEqual([])
    expect(covered.map(brief)).toEqual([
      { path: [], code: 'operator-failure', certainty: 'may', coveredBy: [] },
      {
        path: ['fallback'],
        code: 'type-check',
        certainty: 'may',
        coveredBy: [],
        givesNull: true,
      },
    ])
  })

  test('inside a fragment body, as the call reports it', async () => {
    const { uncovered, covered } = await fallbackCoverage(fig, { fragment: 'givesNull' })
    expect(uncovered).toEqual([])
    expect(covered.find(({ givesNull }) => givesNull)).toMatchObject({
      path: [],
      fragment: 'givesNull',
      fragmentPath: ['expression', 'fallback'],
      coveredBy: [],
      coveredByFragmentPath: ['expression'],
      givesNull: true,
    })
  })

  test('a failure in any other fallback still escapes', async () => {
    const { uncovered } = await fallbackCoverage(fig, {
      $boom: 1,
      fallback: { operator: 'plus', values: ['$data.x', { a: 1 }] },
    })
    expect(uncovered.map(({ path, code }) => ({ path, code }))).toEqual([
      { path: ['fallback'], code: 'type-check' },
    ])
  })

  test('it knows the fields $error always has', async () => {
    // `code` is a string, so nothing can fail
    const { covered } = await fallbackCoverage(fig, {
      $boom: 1,
      fallback: { operator: 'split', value: '$error.code', delimiter: '-' },
    })
    expect(covered.map(brief)).toEqual([
      { path: [], code: 'operator-failure', certainty: 'may', coveredBy: [] },
    ])
  })
})

describe('the static check knows the fields $error always has', () => {
  const typeErrors = (fallback: unknown) =>
    fig
      .validate({ $boom: 1, fallback })
      .issues.filter((issue) => issue.code === 'type-check')
      .map(({ path, message }) => ({ path, message }))

  test('code and message are strings, path an array', () => {
    expect(typeErrors({ operator: 'round', value: '$error.message' })).toEqual([
      {
        path: ['fallback', 'value'],
        message: "'round.value': expected number | null, received string",
      },
    ])
    expect(typeErrors({ operator: 'regex', value: '$err.path', pattern: 'x' })).toEqual([
      {
        path: ['fallback', 'value'],
        message: "'regex.value': expected string | null, received array",
      },
    ])
  })

  test('a string may be one a literal type lists', () => {
    expect(
      typeErrors({ operator: 'regex', value: 'x', pattern: 'x', mode: '$error.code' })
    ).toEqual([])
  })

  test('an optional field is not checked: absent, it is null, which may mean unset', () => {
    expect(typeErrors({ operator: 'round', value: '$error.operator' })).toEqual([])
  })
})
