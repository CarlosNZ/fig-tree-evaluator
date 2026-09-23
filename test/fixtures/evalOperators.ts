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
    category: 'other',
    description: 'Return the value received',
    parameters: { value: { type: 'any', nullPolicy: 'value' } },
    positionalParams: ['value'],
    evaluate: ({ value }) => value,
  })

/** Always throws a plain Error carrying its `value` in the message. */
export const boomOp = () =>
  defineOperator({
    name: 'boom',
    category: 'other',
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
    category: 'other',
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
    category: 'other',
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
    category: 'other',
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
 * A compile counter: an operator whose `validate` hook counts how many
 * times it has been run.
 *
 * The hook runs inside the compile seam, once per node of this operator
 * per compile, and not at all when the compile cache answers — so with one
 * such node in an expression the count IS the number of compiles. That is
 * how cache behaviour is asserted without any engine internal appearing
 * in a test.
 *
 * The hook must not throw: a throwing hook becomes an error issue, which
 * would stop the expression evaluating at all.
 */
export interface CompileSpy {
  definition: ValidatedOperatorDefinition
  /** How many compiles this operator has been walked by. */
  compiles: () => number
  reset: () => void
}

export const compileSpyOp = (name = 'counted'): CompileSpy => {
  let count = 0
  const definition = defineOperator({
    name,
    category: 'other',
    description: `compile counter ${name}`,
    parameters: { value: { type: 'any', required: false, default: null } },
    positionalParams: ['value'],
    validate: () => {
      count += 1
      return []
    },
    evaluate: ({ value }) => value,
  })
  return { definition, compiles: () => count, reset: () => (count = 0) }
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
    category: 'other',
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

const abortError = () => {
  const error = new Error('The operation was aborted')
  error.name = 'AbortError'
  return error
}

/**
 * A sleeping operator with a declared `timeout` parameter: the instrument
 * for the two kinds of deadline. It honours the signal the way a real
 * client does — unless `deaf` is set, which is the SQLite case: a driver
 * that cannot be interrupted at all, so only a race against it can end
 * the wait.
 */
export interface Sleeper {
  definition: ValidatedOperatorDefinition
  /** The `ms` of every sleep that began, in start order. */
  started: number[]
  /**
   * Clears the timers a deaf sleep leaves running. A deaf body never clears
   * its own timer, so a 2-second sleep would outlive the test that made it
   * and jest would report an open handle — call this from `afterEach`.
   */
  cleanup: () => void
}

export const sleepOp = (): Sleeper => {
  const started: number[] = []
  const timers: ReturnType<typeof setTimeout>[] = []
  const definition = defineOperator({
    name: 'sleep',
    category: 'other',
    description: 'Resolve after a delay, honouring the signal',
    parameters: {
      ms: { type: 'integer' },
      timeout: { type: 'integer', required: false },
      deaf: { type: 'boolean', default: false },
    },
    positionalParams: ['ms', 'timeout'],
    timeoutParam: 'timeout',
    evaluate: ({ ms, deaf }, context) =>
      new Promise<string>((resolve, reject) => {
        started.push(ms)
        const timer = setTimeout(() => resolve(`slept ${ms}`), ms)
        timers.push(timer)
        if (deaf) return
        context.signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer)
            reject(abortError())
          },
          { once: true }
        )
      }),
  })
  return { definition, started, cleanup: () => timers.forEach(clearTimeout) }
}

/**
 * A body that reports its signal's state on entry and again when the
 * signal fires, then resolves. The state has to be read INSIDE the body:
 * the root scope settles with the evaluation, so a signal inspected after
 * the call has returned is always aborted.
 */
export interface SignalProbe {
  definition: ValidatedOperatorDefinition
  /** `signal.aborted` on entry, then again when the abort lands. */
  seen: boolean[]
}

export const signalProbeOp = (name = 'probe'): SignalProbe => {
  const seen: boolean[] = []
  const definition = defineOperator({
    name,
    category: 'other',
    description: 'Report the signal state on entry, then on abort',
    parameters: {},
    evaluate: (_params, context) =>
      new Promise((resolve) => {
        seen.push(context.signal.aborted)
        context.signal.addEventListener(
          'abort',
          () => {
            seen.push(context.signal.aborted)
            resolve('done')
          },
          { once: true }
        )
      }),
  })
  return { definition, seen }
}
