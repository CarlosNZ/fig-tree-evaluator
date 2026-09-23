/**
 * Phase 8 showcase — `pnpm dev phase8_showcase`. The instance layer: how
 * options combine, what an instance will and will not remember, and the
 * compile cache underneath it all. Every phase closes with one of these
 * (implementation-plan working rule 7).
 *
 * This phase reads differently from its predecessors, because almost none
 * of it shows up in a result. Merging an option changes what a body sees
 * rather than what comes back, and a cache hit looks exactly like a miss
 * from the outside. So each line prints the thing that actually moved: the
 * options an operator received, or the number of compiles an evaluation
 * cost — counted, as the tests count them, by an operator whose validate
 * hook runs once per compile.
 */
import { FigTree, defineOperator, type CallOptions, type FigTreeOptions } from '../index'
import { coreOperators } from '../operators'
import { block, outcome, print, section } from './showcase'

/** Reports the options its body was handed, so a merge becomes visible. */
const peek = defineOperator({
  name: 'peek',
  category: 'other',
  description: 'Return the option block named, as the body received it',
  parameters: { of: { type: 'string', default: 'http' } },
  positionalParams: ['of'],
  evaluate: ({ of }, context) => (context.options as Record<string, unknown>)[of] ?? null,
})

/** Counts the compiles that walked it — the cache's only honest witness. */
let compiles = 0
const counted = defineOperator({
  name: 'counted',
  category: 'other',
  description: 'Pass a value through, counting the compiles that saw it',
  parameters: { value: { type: 'any', nullPolicy: 'value', default: null } },
  positionalParams: ['value'],
  validate: () => {
    compiles += 1
    return []
  },
  evaluate: ({ value }) => value,
})

const main = async () => {
  section('Instance options, and one call’s view of them')

  const fig = new FigTree({
    operators: [coreOperators, peek, counted],
    data: { org: 'Acme' },
    http: { baseEndpoint: 'https://api.example.com', headers: { 'X-App': 'showcase' } },
    maxNodes: 500,
  })
  const show = async (label: string, expression: unknown, options?: CallOptions) =>
    print(label, expression, await outcome(() => fig.evaluate(expression, options)))

  await show('a body receives the whole option set', { $peek: 'http' })
  await show(
    'a per-call option is one of five request-scoped keys; configuration is refused',
    { $peek: 'http' },
    { http: { headers: { Authorization: 'Bearer t0ken' } } } as CallOptions
  )
  await show('per-call data replaces the instance block, by reference', '$data', {
    data: { team: 'Platform' },
  })
  await show('and the next call is back to the instance’s own', '$data')
  await show('an undefined value means “not supplied”, never “remove”', '$data', {
    data: undefined,
  })

  section('updateOptions — the one sanctioned mutation, two levels deep and no deeper')

  console.log(`      before: ${block(fig.getOptions().http)}`)
  fig.updateOptions({ http: { headers: { Authorization: 'Bearer t0ken' } } })
  console.log(
    `      after:  ${block(fig.getOptions().http)}   [baseEndpoint survives; headers replaced as a unit]\n`
  )
  console.log(`      data before: ${block(fig.getOptions().data)}`)
  fig.updateOptions({ data: { team: 'Platform' } })
  console.log(
    `      data after:  ${block(fig.getOptions().data)}   [replaced — data is state, not configuration]\n`
  )

  const snapshot = fig.getOptions()
  snapshot.data = { org: 'Hacked' }
  console.log(`      a mutated snapshot cannot write back: ${block(fig.getOptions().data)}\n`)

  const broken = await outcome(async () => {
    fig.updateOptions({ operators: [{ not: 'a definition' } as never], maxNodes: 1 })
  })
  console.log(`      a rejected update changes nothing:\n    ${broken}`)
  console.log(
    `      the valid key that rode along is not applied either: maxNodes is still ${String(fig.getOptions().maxNodes)}\n`
  )

  section('The compile cache')

  const cached = new FigTree({ operators: [coreOperators, counted] })
  const expression = { $counted: '$data.value' }
  const run = async (label: string, input: unknown, note: string) => {
    const before = compiles
    const result = await outcome(() => cached.evaluate(input, { data: { value: 1 } }))
    print(label, input, result, `${compiles - before} compile(s) — ${note}`)
  }

  await run('first sight of an expression', expression, 'identity miss, content miss')
  await run('the same object again', expression, 'identity hit: a pointer lookup')
  await run(
    'a fresh object of the same content',
    JSON.parse(JSON.stringify(expression)),
    'content hit, re-registered by identity'
  )
  await run(
    'the same content, keys the other way round',
    { value: '$data.value', operator: 'counted' },
    'an honest miss — order is never canonicalized'
  )

  const inert = { title: 'Report', rows: [1, 2, 3] }
  const before = compiles
  const returned = await cached.evaluate(inert)
  print(
    'inert data is never compiled at all',
    inert,
    `→ ${block(returned)}`,
    `${compiles - before} compile(s), and returned by identity: ${String(returned === inert)}`
  )

  section('What invalidates it')

  const seen = async (label: string, update: FigTreeOptions) => {
    const start = compiles
    cached.updateOptions(update)
    await cached.evaluate(expression, { data: { value: 1 } })
    console.log(`  ${label}\n      ${compiles - start} compile(s) on the next evaluation\n`)
  }
  await seen('updateOptions({ data }) — the artifact does not consume it', { data: { a: 1 } })
  await seen('updateOptions({ maxNodes }) — compared per call, never baked in', { maxNodes: 500 })
  await seen('updateOptions({ operatorDefaults }) — baked into shielding, so it drops', {
    operatorDefaults: { counted: { value: 'x' } },
  })
}

void main()
