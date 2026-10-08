/**
 * The fallback code list ("The code vocabulary" in
 * docs-dev/v3-specs/v3-evaluator-methods.md; #239).
 *
 * `KnownFallbackErrorCode` promises that a fallback can receive exactly
 * these codes from the engine and the package's own operators, so it is
 * held in step both ways:
 *
 * - every listed code reaches a fallback: one expression per code, failing
 *   with it under a fallback that catches it. `REACHES` is a record over
 *   the type, so `pnpm typecheck` fails when a listed code has no case, or
 *   a case names a code that is not listed;
 * - every code the package throws at a fallback is listed: the core
 *   operators' failure rules, and the findings of the #217 corpus, which
 *   test/coverage-cases.test.ts holds to what the engine throws over a
 *   spread of data.
 *
 * The type assertions run under `pnpm typecheck`, not Jest: ts-jest only
 * transpiles.
 */
import { ErrorCodes, FigTree, OperatorFailure, coreOperators, defineOperator } from '../src'
import type { EvaluationResult, FigTreeOptions, FragmentDefinition, TraceNode } from '../src'
import type { FallbackErrorCode, FigTreeErrorCode, KnownFallbackErrorCode } from '../src/errorCodes'
import { CORE_RULES } from '../src/authoring/rules'
import { sections } from './coverage-cases'
import { sleepOp } from './fixtures/evalOperators'

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((clear) => clear())
})

/** A body that hands its lazy parameter back instead of demanding it. */
const leaky = defineOperator({
  name: 'leaky',
  category: 'other',
  description: 'Hand the handle back',
  parameters: { branch: { type: 'any', evaluation: 'lazy' } },
  positionalParams: ['branch'],
  evaluate: ({ branch }) => branch as never,
})

const fragments: Record<string, FragmentDefinition> = {
  needsA: { expression: '$params.a', parameters: { a: { type: 'number', required: true } } },
}

interface Case {
  expression: unknown
  data?: Record<string, unknown>
  options?: FigTreeOptions
}

const REACHES: Record<KnownFallbackErrorCode, Case> = {
  'type-check': { expression: { $round: '$data.x', fallback: 0 }, data: { x: 'one' } },
  'operator-failure': {
    expression: { operator: 'convert', value: '$data.x', to: 'number', fallback: 0 },
    data: { x: { a: 1 } },
  },
  'request-timeout': { expression: { operator: 'sleep', ms: 200, timeout: 20, fallback: 0 } },
  'non-finite-result': { expression: { $divide: [1, '$data.by'], fallback: 0 }, data: { by: 0 } },
  'escaped-handle': { expression: { $leaky: 1, fallback: 0 } },
  'empty-aggregate': { expression: { $min: '$data.list', fallback: 0 }, data: { list: [] } },
  'missing-data-path': {
    expression: { $plus: ['$data.missing', 1], fallback: 0 },
    options: { strictDataPaths: true },
  },
  // A dynamic-mode call checks its arguments at runtime
  'missing-required': {
    expression: { fragment: 'needsA', parameters: '$data.args', fallback: 0 },
    data: { args: {} },
  },
  // Never caught: a shielded fallback answers it
  timeout: { expression: { operator: 'sleep', ms: 200, fallback: 0 }, options: { timeout: 20 } },
}

const LISTED = new Set<string>(Object.keys(REACHES))

/** The code of every failure a fallback answered, in tree order. */
const caughtCodes = (entry: TraceNode): string[] => [
  ...(entry.status === 'fallback' && entry.error !== undefined ? [entry.error.code] : []),
  ...(entry.children ?? []).flatMap(caughtCodes),
]

describe('every listed code reaches a fallback', () => {
  test.each(Object.entries(REACHES))('%s', async (code, { expression, data, options }) => {
    const sleep = sleepOp()
    cleanups.push(sleep.cleanup)
    const fig = new FigTree({
      operators: [coreOperators, sleep.definition, leaky],
      fragments,
      ...options,
    })
    const { result, trace } = (await fig.evaluate(expression, {
      data,
      trace: true,
    })) as EvaluationResult
    expect(result).toBe(0)
    expect(caughtCodes(trace)).toEqual([code])
  })
})

describe('every code the package throws at a fallback is listed', () => {
  test('the core operators’ failure rules', () => {
    const unlisted = Object.entries(CORE_RULES).flatMap(([operator, rules]) =>
      rules.filter(({ code }) => !LISTED.has(code)).map(({ code }) => `${operator}: ${code}`)
    )
    expect(unlisted).toEqual([])
  })

  test('the failures the #217 corpus sees', () => {
    const unlisted = Object.values(sections)
      .flat()
      .flatMap(({ name, uncovered = [], covered = [] }) =>
        [...uncovered, ...covered]
          .filter(({ code }) => !LISTED.has(code))
          .map(({ code }) => `${name}: ${code}`)
      )
    expect(unlisted).toEqual([])
  })
})

test('the code types stay open to host codes, and only the known lists are closed', () => {
  const hostCode: FallbackErrorCode = 'my-host-code'
  const failure = new OperatorFailure('refused', { code: hostCode })
  const fallbackCode: FallbackErrorCode = ErrorCodes.requestTimeout
  const wider: FigTreeErrorCode = fallbackCode
  // @ts-expect-error — the kill switch's other half never reaches a fallback
  const aborted: KnownFallbackErrorCode = ErrorCodes.aborted
  // @ts-expect-error — nor does a static error
  const malformed: KnownFallbackErrorCode = ErrorCodes.malformedNode

  // The assignments above are the assertion; this keeps the runtime honest
  // about what it just proved
  expect([failure.code, wider, aborted, malformed]).toEqual([
    'my-host-code',
    'request-timeout',
    'aborted',
    'malformed-node',
  ])
})
