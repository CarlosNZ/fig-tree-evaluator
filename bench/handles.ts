/**
 * What a compiled-expression handle costs to make and to read, on v3 alone
 * — v2 has no `compile()`. The parse cache already holds the compiled
 * form, so a `compile()` of an expression the instance has seen does no
 * compiling: what it pays for is the handle itself. That is the cost this
 * bench isolates, with what `inspect()` pays to read one back.
 *
 * Three sweeps, over the same three shapes: an inert constant (the
 * handle's lazy flavour, holding only the probe's verdict), one small
 * expression, and a 41-node one.
 *
 * - Evaluating through a handle: a held expression evaluated directly,
 *   the same expression compiled on every call and then evaluated, and a
 *   held handle. The gap between the first two is the price of a handle,
 *   in the context a host would pay it.
 * - `compile()` alone, where the handle is the whole of the work, so a
 *   change to what a handle costs shows at full size.
 * - `inspect()` of a held handle: reading the handle's state from outside
 *   the class, plus building the report.
 *
 * The expressions are held, so the parse cache's identity layer serves
 * every compile, and the data is fresh every iteration, so no result is
 * reused.
 */
import { FigTree, coreOperators, inspect, type CompiledExpression } from '../src'
import { finish, runCase, section, type Sweep } from './harness'
import { data, holeV3 } from './shapes'

/** One line for the bench list and the browser index. */
export const description =
  'What a compiled-expression handle costs to make, to evaluate through, and to inspect.'

/** `(a + 1) + (a + 1) + …` over twenty operands: 41 nodes. */
const sum = {
  $plus: Array.from({ length: 20 }, () => ({ $plus: ['$data.a', 1] })),
}

/** The shared data, with the number the sum reads. */
const dataFor = (i: number) => ({ ...data(i), a: i })

const inert = Array.from({ length: 20 }, (_, i) => ({ label: `Option ${i}`, value: i }))

const shapes: [label: string, expression: unknown, iterations: number][] = [
  ['inert constant', inert, 20_000],
  ['one expression (4 nodes)', holeV3, 20_000],
  ['41 nodes', sum, 4_000],
]

const fig = new FigTree({ operators: [coreOperators] })

const evaluating: Sweep = {
  title: 'Evaluating through a handle',
  note: 'The ratio is the price of compiling a handle per call, over evaluating directly.',
  arms: ['evaluate', 'compile + evaluate', 'held handle'],
  ratios: [['compile + evaluate', 'evaluate']],
}

/**
 * A handle costs tens of nanoseconds, below the table's resolution for a
 * single call, so each iteration makes a batch of them: the figure is per
 * batch, and one handle is a hundredth of it.
 */
const BATCH = 100

/**
 * Where each batch's handles go, as a host keeps the handles it compiles —
 * a handle made and dropped on the spot is one the optimizer may never
 * allocate at all.
 */
const held: CompiledExpression[] = []

const compiling: Sweep = {
  title: 'compile() alone',
  note:
    'The compiled form is cached, so this is the cost of making the handle. ' +
    `Each iteration makes ${BATCH} handles.`,
  arms: [`compile ×${BATCH}`],
}

const inspecting: Sweep = {
  title: 'inspect() of a held handle',
  note: 'Reading the handle from outside the class, and building the report.',
  arms: ['inspect'],
}

const main = async () => {
  section(evaluating)
  for (const [label, expression, iterations] of shapes) {
    const handle = fig.compile(expression)
    await runCase(evaluating, {
      label,
      iterations,
      arms: {
        evaluate: (i) => fig.evaluate(expression, { data: dataFor(i) }),
        'compile + evaluate': (i) => fig.compile(expression).evaluate({ data: dataFor(i) }),
        'held handle': (i) => handle.evaluate({ data: dataFor(i) }),
      },
    })
  }

  section(compiling)
  for (const [label, expression, iterations] of shapes)
    await runCase(compiling, {
      label,
      iterations,
      arms: {
        [`compile ×${BATCH}`]: async () => {
          for (let k = 0; k < BATCH; k++) held[k] = fig.compile(expression)
          return held[BATCH - 1].expression
        },
      },
    })

  section(inspecting)
  for (const [label, expression, iterations] of shapes) {
    const handle = fig.compile(expression)
    await runCase(inspecting, {
      label,
      iterations,
      arms: { inspect: async () => inspect(handle).nodeCount },
    })
  }
  finish()
}

main()
