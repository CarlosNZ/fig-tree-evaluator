/**
 * Phase 6 showcase — `pnpm dev phase6_showcase`. The iterators: the
 * `perElement` delivery with its `$element` / `$index` bindings and the
 * `as` renaming, and the five operators built on it — `map`, `filter`,
 * `find`, `some`, `every`. Every phase closes with one of these
 * (implementation-plan working rule 7).
 *
 * Two claims run through the phase and neither is visible in a result
 * value, so most sections print a tally beside it: elements start
 * TOGETHER, and the ones whose outcome cannot change the answer are cut
 * short. The tally is the point; the value is sometimes incidental.
 */
import { FigTree, defineOperator, OperatorFailure } from '../index'
import { coreOperators } from '../operators'
import { outcome, print, section } from './showcase'

/** Records what ran, in the order it actually happened. */
let runs: string[] = []
const work = defineOperator({
  name: 'work',
  description: 'Do a unit of (pretend) work, recording that it happened',
  parameters: {
    label: { type: 'any' },
    ms: { type: 'integer', default: 0 },
    fail: { type: 'boolean', default: false },
  },
  positionalParams: ['label', 'ms', 'fail'],
  evaluate: ({ label, ms, fail }, context) =>
    new Promise((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer)
        runs.push(`${String(label)}✂`)
        reject(new Error(`cancelled: ${String(label)}`))
      }
      const timer = setTimeout(() => {
        context.signal.removeEventListener('abort', onAbort)
        runs.push(String(label))
        if (fail) reject(new OperatorFailure(`${String(label)} failed`))
        else resolve(label)
      }, ms)
      context.signal.addEventListener('abort', onAbort, { once: true })
    }),
})

const data = {
  users: [
    { id: 1, name: 'Ada', admin: true, age: 36 },
    { id: 2, name: 'Alan', admin: false, age: 41 },
    { id: 3, name: 'Grace', admin: false, age: 45 },
  ],
  orders: [
    {
      id: 'A-1',
      items: [
        { name: 'Blaster', qty: 2 },
        { name: 'Charge', qty: 1 },
      ],
    },
    { id: 'A-2', items: [{ name: 'Cloak', qty: 1 }] },
  ],
  tags: ['  alpha ', 'beta', ''],
  empty: [],
}

const fig = new FigTree({ operators: [coreOperators, work], data })

const show = async (
  label: string,
  expression: unknown,
  options: Parameters<FigTree['evaluate']>[1] = {}
) => {
  runs = []
  const result = await outcome(() => fig.evaluate(expression, options))
  // Let any abort land before the tally is read
  await new Promise((resolve) => setTimeout(resolve, 20))
  print(label, expression, result, runs.length === 0 ? undefined : `ran: ${runs.join(', ')}`)
}

const lint = (label: string, expression: unknown) => {
  const issues = fig
    .validate(expression)
    .issues.map((issue) => `${issue.severity} ${issue.code}`)
    .join(', ')
  print(label, expression, `⚑ ${issues === '' ? 'no issues' : issues}`)
}

const main = async () => {
  console.log(
    `  Reading this: \`$work\` stands in for something expensive. It records that
  it ran and returns its own label. The [tally] after a result is what
  actually executed, in the order it happened; \`✂\` marks an element cut
  short because the answer no longer depended on it.\n`
  )

  section('map and filter — the everyday shapes')
  await show('the pluck idiom', { $map: ['$data.users', '$element.name'] })
  await show('$index is zero-based', { $map: [['a', 'b', 'c'], '$index'] })
  await show('filter keeps the ORIGINAL elements, not the predicate results', {
    $filter: ['$data.users', { $greaterThan: ['$element.age', 40] }],
  })
  await show('strip-falsy, spelled explicitly', {
    $filter: { input: '$data.tags', each: { $trim: '$element' } },
  })
  await show('a pipeline: trim, drop the empties, count what is left', {
    $length: {
      $filter: {
        input: { $map: ['$data.tags', { $trim: '$element' }] },
        each: '$element',
      },
    },
  })

  section('the bindings, and the `as` renaming')
  await show('nested iteration reaches the outer element by name', {
    operator: 'map',
    input: '$data.orders',
    as: 'order',
    each: {
      operator: 'map',
      input: '$order.items',
      // `plus` refuses mixed operands — no implicit coercion, ever — so
      // the quantity is converted deliberately
      each: {
        $plus: [
          '$element.name',
          ' × ',
          { $convert: ['$element.qty', 'string'] },
          ' (order ',
          '$order.id',
          ')',
        ],
      },
    },
  })
  await show('the renamed index binding', {
    operator: 'map',
    input: ['first', 'second'],
    as: 'row',
    each: { $plus: [{ $convert: ['$rowIndex', 'string'] }, ': ', '$row'] },
  })

  section('parallel always — elements start together')
  await show('three elements, one round of latency, not three', {
    $map: [[40, 40, 40], { $work: ['$element', '$element'] }],
  })

  section('the deciders stop early')
  const latency2 = { $if: [{ $equal: ['$index', 0] }, 60, 0] }
  const latency = { $if: [{ $equal: ['$index', 0] }, 0, 60] }
  await show('some: the first truthy answers, the rest is cut short', {
    $some: { input: ['quick', 'slow'], each: { $work: ['$element', latency] } },
  })
  await show('every: the first falsy answers', {
    $every: { input: [0, 'slow'], each: { $work: ['$element', latency] } },
  })
  await show('find is order-aware: the SLOW first element still wins', {
    $find: {
      input: ['first', 'second'],
      // Both match; element 0 is far the slower, so it settles LAST
      each: { $work: ['$element', latency2] },
    },
  })

  section('Kleene — a failure the answer does not depend on never surfaces')
  await show('some(failure, truthy) is true — the failure never surfaces', {
    $some: {
      input: ['broken', 'fine'],
      each: { $work: ['$element', 0, { $equal: ['$element', 'broken'] }] },
    },
  })
  await show('with no decider it IS the answer — lowest index, not first back', {
    $every: {
      input: ['slow-failure', 'quick-failure'],
      each: { $work: ['$element', latency2, true] },
    },
  })

  section('absence — register rows 23 and 24')
  await show('no match is an answer, not a failure', {
    $find: ['$data.users', { $equal: ['$element.id', 42] }],
  })
  await show('noMatchDefault fires on no-match only', {
    $find: {
      input: '$data.users',
      each: { $equal: ['$element.id', 42] },
      noMatchDefault: 'nobody',
    },
  })
  await show('a null input is a type error — the collection is genuinely missing', {
    $every: ['$data.checks', '$element.passed'],
  })
  await show('…which a fallback catches like any other failure', {
    $every: ['$data.checks', '$element.passed'],
    fallback: 'unknown',
  })
  await show('…and nullInputDefault reads absence as emptiness instead', {
    $every: { input: '$data.checks', each: '$element.passed', nullInputDefault: [] },
  })
  await show('the empty identities — every contract here is total', {
    map: { $map: ['$data.empty', '$element'] },
    filter: { $filter: ['$data.empty', '$element'] },
    find: { $find: ['$data.empty', '$element'] },
    some: { $some: ['$data.empty', '$element'] },
    every: { $every: ['$data.empty', '$element'] },
  })

  section('what validate() says before anything runs')
  lint('a binding used outside its each subtree', {
    operator: 'map',
    input: '$order.items',
    as: 'order',
    each: '$order.name',
  })
  lint('an each that reads none of its own bindings', {
    operator: 'map',
    input: [1, 2],
    each: 'constant',
  })
  lint('a literal empty input is a dead expression', { $map: [[], '$element'] })
  lint('as may not collide with a reserved namespace', {
    operator: 'map',
    input: [1],
    as: 'index',
    each: 1,
  })
}

main()
