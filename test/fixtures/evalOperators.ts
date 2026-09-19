/**
 * Spy operators for the Phase-4 evaluator suites. Each is a minimal
 * `defineOperator()` definition whose body records what it received, so
 * the engine layers (null policy, defaults, type checks, truthiness,
 * fallback, boundary) are observable from outside: results, thrown errors,
 * and call logs — never engine internals.
 */
import { defineOperator, OperatorFailure } from '../../src'
import type { OperatorContext, ParameterDeclaration, ValidatedOperatorDefinition } from '../../src'

/** Returns its `value` parameter verbatim; null is a value here. */
export const echoOp = () =>
  defineOperator({
    name: 'echo',
    description: 'Return the value received',
    parameters: { value: { type: 'any', nullPolicy: 'value' } },
    positionalParams: ['value'],
    evaluate: ({ value }) => value,
  })

/** Always throws a plain Error carrying its `value` in the message. */
export const boomOp = () =>
  defineOperator({
    name: 'boom',
    description: 'Fail with a plain Error',
    parameters: { value: { type: 'any', nullPolicy: 'value', required: false } },
    positionalParams: ['value'],
    evaluate: ({ value }) => {
      throw new Error(`boom ${String(value)}`)
    },
  })

/** Throws an OperatorFailure with the code / errorData it is handed. */
export const failOp = () =>
  defineOperator({
    name: 'fail',
    description: 'Fail with an OperatorFailure',
    parameters: {
      message: { type: 'string' },
      code: { type: 'string', required: false },
      errorData: { type: 'object', required: false },
    },
    positionalParams: ['message', 'code'],
    evaluate: ({ message, code, errorData }) => {
      throw new OperatorFailure(message as string, {
        ...(code !== undefined ? { code: code as string } : {}),
        ...(errorData !== undefined ? { errorData: errorData as Record<string, unknown> } : {}),
      })
    },
  })

/** Returns whatever raw JS value the test wants to see cross the boundary. */
export const rawOp = (name: string, produce: () => unknown) =>
  defineOperator({
    name,
    description: 'Produce a raw result for boundary tests',
    parameters: {},
    evaluate: produce,
  })

/** A counting spy: how many times did the body run, with what params. */
export interface Spy {
  definition: ValidatedOperatorDefinition
  calls: Record<string, unknown>[]
  contexts: OperatorContext[]
}

export const spyOp = (
  name: string,
  parameters: Record<string, ParameterDeclaration>,
  extra: {
    positionalParams?: string[]
    returns?: 'string'
    result?: unknown
  } = {}
): Spy => {
  const calls: Record<string, unknown>[] = []
  const contexts: OperatorContext[] = []
  const definition = defineOperator({
    name,
    description: `spy ${name}`,
    parameters,
    ...(extra.positionalParams !== undefined ? { positionalParams: extra.positionalParams } : {}),
    evaluate: (params, context) => {
      calls.push(params)
      contexts.push(context)
      return 'result' in extra ? extra.result : 'ok'
    },
  })
  return { definition, calls, contexts }
}

/**
 * A latency-scripted operator: resolves (or fails) after `ms`, and honours
 * the abort signal. The instrument for completion-order and cancellation
 * assertions — the outcome of a race must not depend on which operand
 * happens to finish first, and the only way to show that is to script the
 * order and permute it.
 */
export interface LatencySpy {
  definition: ValidatedOperatorDefinition
  /** Values whose work began, in start order. */
  started: unknown[]
  /** Values whose wait ran to completion, in completion order. */
  finished: unknown[]
  /** Values cut short by the signal. */
  aborted: unknown[]
}

export const latencyOp = (name = 'slow'): LatencySpy => {
  const started: unknown[] = []
  const finished: unknown[] = []
  const aborted: unknown[] = []
  const definition = defineOperator({
    name,
    description: 'Answer after a scripted delay',
    parameters: {
      value: { type: 'any', nullPolicy: 'value' },
      ms: { type: 'integer', default: 0 },
      fail: { type: 'boolean', default: false },
    },
    positionalParams: ['value', 'ms', 'fail'],
    evaluate: ({ value, ms, fail }, context: OperatorContext) =>
      new Promise((resolve, reject) => {
        started.push(value)
        const onAbort = () => {
          clearTimeout(timer)
          aborted.push(value)
          reject(new Error(`aborted: ${String(value)}`))
        }
        const timer = setTimeout(() => {
          context.signal.removeEventListener('abort', onAbort)
          finished.push(value)
          if (fail) reject(new OperatorFailure(`scripted failure: ${String(value)}`))
          else resolve(value)
        }, ms as number)
        context.signal.addEventListener('abort', onAbort, { once: true })
      }),
  })
  return { definition, started, finished, aborted }
}
