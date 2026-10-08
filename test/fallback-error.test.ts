/**
 * `$error` (#239): inside a fallback, the failure that fallback caught, as a
 * plain `FallbackError` ("FallbackError" in
 * docs-dev/v3-specs/v3-evaluator-methods.md; scope and nesting in "fallback
 * semantics" in docs-dev/v3-specs/v3-api.md). The value, where it may be
 * read, nesting, fragments, the strict-path exemption, and the static checks
 * that read it.
 */
import { FigTree, OperatorFailure, coreOperators, defineOperator, isFigTreeError } from '../src'
import type { FallbackError, FigTreeError, FragmentDefinition } from '../src'
import { fallbackCoverage } from '../src/authoring'
import { boomOp, echoOp } from './fixtures/evalOperators'
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
}

const operators = [coreOperators, echoOp(), boomOp(), refuse]
const fig = new FigTree({ operators, fragments })
const strict = new FigTree({ operators, fragments, strictDataPaths: true })

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

  test('a $data miss beside it still fails', async () => {
    const error = await rejection<FigTreeError>(
      strict.evaluate({ $boom: 1, fallback: { a: '$error.nope', b: '$data.nope' } })
    )
    expect(error.code).toBe('missing-data-path')
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
