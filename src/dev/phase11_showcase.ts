/**
 * Phase 11 showcase — `pnpm dev phase11_showcase`. Fragments: config-level
 * presets, registered on the instance and called with declared arguments.
 * Every phase closes with one of these (implementation-plan working rule
 * 7).
 *
 * Runs offline. The thread through it is that registration is the
 * fragment's parse moment — a bad fragment never reaches a call site —
 * and that a call behaves as its expansion does, laziness, scoping and
 * timeout shielding included.
 */
import { FigTree, isFigTreeError, coreOperators, defineOperator } from '../index'
import { block, outcome, print, section } from './showcase'

/** A counting spy, so laziness can be read off a call log. */
const counter = () => {
  const calls: string[] = []
  const definition = defineOperator({
    name: 'work',
    description: 'Record that it ran, and answer',
    parameters: { label: { type: 'string' }, value: { type: 'any', default: null } },
    positionalParams: ['label', 'value'],
    evaluate: ({ label, value }) => {
      calls.push(label as string)
      return value
    },
  })
  return { definition, calls }
}

/** What a registration throw says, in one line. */
const registration = (options: object): string => {
  try {
    new FigTree(options)
    return '→ registered'
  } catch (error) {
    if (!isFigTreeError(error)) return `✗ ${String(error)}`
    const count = error.issues?.length ?? 0
    return `✗ ${error.issues?.[0].code}: ${error.message}${count > 1 ? ` (${count} issues)` : ''}`
  }
}

const main = async () => {
  const work = counter()

  const fig = new FigTree({
    operators: [coreOperators, work.definition],
    fragments: {
      greeting: {
        expression: { $buildString: ['%1, %2!', '$params.salutation', '$params.name'] },
        parameters: {
          name: { type: 'string', description: 'Who is being greeted' },
          salutation: { type: 'string', default: 'Hello' },
        },
        description: 'A greeting with a defaulted salutation',
        metadata: { backgroundColor: '#B2E0FF', team: 'config-admins' },
      },
      banner: {
        expression: { $buildString: ['*** %1 ***', { $greeting: { name: '$params.who' } }] },
        parameters: { who: { type: 'string' } },
      },
      summary: {
        expression: '$params',
        parameters: { a: { type: 'number' }, b: { type: 'string', default: 'unset' } },
      },
      roleLine: {
        expression: {
          $buildString: [
            '%1 — %2',
            '$params.name',
            { $join: { values: '$params.roles', delimiter: ', ' } },
          ],
        },
        // `roles` is declared loosely on purpose: a declared type would be
        // refused at the call boundary, and the failure below would never
        // reach the body at all
        parameters: { name: { type: 'string' }, roles: { type: 'any', default: [] } },
      },
      pick: {
        expression: { $if: ['$params.flag', '$params.whenTrue', '$params.whenFalse'] },
        parameters: { flag: {}, whenTrue: {}, whenFalse: {} },
      },
    },
  })

  section('Calling a fragment')

  const call = { $greeting: { name: 'Ada' } }
  print(
    'the shorthand face, with the declared default applied',
    call,
    await outcome(() => fig.evaluate(call))
  )

  const canonical = { fragment: 'greeting', parameters: { name: 'Ada', salutation: 'Kia ora' } }
  print(
    'the canonical face, both arguments supplied',
    canonical,
    await outcome(() => fig.evaluate(canonical))
  )

  const nested = { $banner: { who: 'Grace' } }
  print('a fragment calling a fragment', nested, await outcome(() => fig.evaluate(nested)))

  section('Arguments are lazy, memoized, and the caller’s')

  const lazy = {
    $pick: {
      flag: true,
      whenTrue: { $work: ['taken', 'the taken branch'] },
      whenFalse: { $work: ['skipped', 'the other one'] },
    },
  }
  print(
    'the untaken branch’s argument never evaluates',
    lazy,
    await outcome(() => fig.evaluate(lazy)),
    `ran: ${block(work.calls)}`
  )

  work.calls.length = 0
  const scoped = {
    vars: { subject: { $work: ['from the caller’s vars', 'Ada'] } },
    out: { $greeting: { name: '$vars.subject', salutation: '$vars.subject' } },
  }
  print(
    'an argument reads the caller’s vars, and evaluates once however often it is read',
    scoped,
    await outcome(() => fig.evaluate(scoped)),
    `ran ${work.calls.length}×`
  )

  section('Both argument modes')

  const dynamic = { fragment: 'summary', parameters: '$data.row' }
  print(
    'the whole arguments object from one evaluation — extras ignored, defaults still applied',
    dynamic,
    await outcome(() => fig.evaluate(dynamic, { data: { row: { a: 1, unread: 'inert' } } }))
  )
  print(
    'and its signature is checked where the object arrives',
    dynamic,
    await outcome(() => fig.evaluate(dynamic, { data: { row: { b: 'no a' } } }), true)
  )

  const bare = { $summary: { a: 1 } }
  print(
    'bare $params inside the body is the declared set, resolved',
    bare,
    await outcome(() => fig.evaluate(bare))
  )

  section('A failure inside a body points at both ends')

  const twoEnds = async (label: string, expression: unknown, data: Record<string, unknown>) => {
    try {
      const result = await fig.evaluate(expression, { data })
      print(label, expression, `→ ${block(result)}`)
    } catch (error) {
      if (!isFigTreeError(error)) throw error
      print(
        label,
        expression,
        `✗ ${error.code}: ${error.message}`,
        `path ${block(error.path)}${
          error.fragmentPath ? `, in '${error.fragment}' at ${block(error.fragmentPath)}` : ''
        }`
      )
    }
  }

  await twoEnds(
    'a body failure: the call is located in the input, the failing node in the definition',
    { header: { $roleLine: { name: 'Ada', roles: '$data.roles' } } },
    { roles: 42 }
  )
  await twoEnds(
    'an argument the declaration refuses never enters the body — one end is enough',
    { header: { $greeting: { name: '$data.user' } } },
    { user: 42 }
  )

  section('Registration is the fragment’s parse moment')

  console.log(
    [
      `  an unknown operator in a body\n    ${registration({ fragments: { f: { expression: { operator: 'flibble' } } } })}`,
      `  a default that contradicts its type\n    ${registration({ fragments: { f: { expression: 1, parameters: { x: { type: 'string', default: 7 } } } } })}`,
      `  a typo'd declaration key\n    ${registration({ fragments: { f: { expression: 1, parameters: { x: { type: 'string', defualt: 'a' } } } } })}`,
      `  a name an operator already owns\n    ${registration({ fragments: { plus: { expression: 1 } } })}`,
      `  a body reaching a caller's scope\n    ${registration({ fragments: { f: { expression: '$vars.theirs' } } })}`,
      `  recursion, guarded or not\n    ${registration({ fragments: { loop: { expression: { $if: [false, { $loop: {} }, 'done'] } } } })}`,
      `  and the good one, for contrast\n    ${registration({ fragments: { f: { expression: { $plus: [1, 2] } } } })}`,
    ].join('\n\n') + '\n'
  )
}

main()
