/**
 * Phase 5 showcase — `pnpm dev phase5_showcase`. Scoping and laziness:
 * `vars` (lexical, lazy, memoized), the lazy delivery modes and their six
 * logic operators, and the `race` delivery with its abort scopes. Every
 * phase closes with one of these (implementation-plan working rule 7).
 *
 * The phase's claims are mostly negative — work that does NOT happen — so
 * most sections print a counter beside the result. The counter is the
 * point; the value is often incidental.
 */
import { FigTree, defineOperator, isFigTreeError, OperatorFailure } from '../index'
import { coreOperators } from '../operators'

/** Counts its own runs, so "never evaluated" is visible on the page. */
let runs: string[] = []
const work = defineOperator({
  name: 'work',
  description: 'Do a unit of (pretend) work, recording that it happened',
  parameters: {
    label: { type: 'string' },
    ms: { type: 'integer', default: 0 },
    fail: { type: 'boolean', default: false },
  },
  positionalParams: ['label', 'ms', 'fail'],
  evaluate: ({ label, ms, fail }, context) =>
    new Promise((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer)
        runs.push(`${label}✂`)
        reject(new Error(`cancelled: ${label}`))
      }
      const timer = setTimeout(() => {
        context.signal.removeEventListener('abort', onAbort)
        runs.push(label)
        if (fail) reject(new OperatorFailure(`${label} failed`))
        else resolve(label)
      }, ms)
      context.signal.addEventListener('abort', onAbort, { once: true })
    }),
})

const fig = new FigTree({ operators: [coreOperators, work] })

/**
 * JSON for reading: compact while it fits on a line, pretty-printed when it
 * does not, with every line after the first aligned to `pad`.
 *
 * The threshold is WIDTH, not nesting depth — measured against these two
 * files' own expressions, depth turned out not to discriminate. An operator
 * call with an array payload is already depth 2, so anything with one
 * operator inside another is depth 4 before it has said anything: a depth
 * rule expands `{"$or":[{"$work":["slow",200]},{"$work":["quick",5]}]}`
 * into sixteen lines, and still misses the 110-character node beside it.
 * Depth is forced by the notation here; width tracks how much there is to
 * read.
 */
const WIDTH = 80

const block = (value: unknown, pad = '      '): string => {
  const compact = JSON.stringify(value)
  if (compact === undefined) return String(value)
  if (compact.length <= WIDTH) return compact
  return JSON.stringify(value, null, 2).split('\n').join(`\n${pad}`)
}

const show = async (
  label: string,
  expression: unknown,
  options: Parameters<FigTree['evaluate']>[1] = {}
) => {
  runs = []
  let outcome: string
  try {
    outcome = `→ ${block(await fig.evaluate(expression, options))}`
  } catch (error) {
    outcome = isFigTreeError(error)
      ? `✗ ${error.code}${error.operator ? ` (${error.operator})` : ''}: ${error.message}`
      : `✗ ${String(error)}`
  }
  // Let any abort land before the tally is read
  await new Promise((resolve) => setTimeout(resolve, 15))
  const tally = runs.length === 0 ? 'nothing ran' : `ran: ${runs.join(', ')}`
  console.log(`  ${label}\n      ${block(expression)}\n    ${outcome}   [${tally}]\n`)
}

const section = (title: string) =>
  console.log(`── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}\n`)

const main = async () => {
  console.log(
    `  Reading this: \`$work\` stands in for something expensive. It records that
` +
      `  it ran and RETURNS ITS OWN LABEL, so \`{"$work":"taken"}\` evaluates to the
` +
      `  string "taken" — the node is evaluated like any other, the result just
` +
      `  resembles it. The [tally] after each result is what actually executed;
` +
      `  \`✂\` marks an operand cancelled mid-flight.\n`
  )
  section('vars — lexical, lazy, memoized')
  await show('referenced twice, evaluated once', {
    vars: { token: { $work: 'fetch-token' } },
    header: '$vars.token',
    footer: '$vars.token',
  })
  await show('declared but never referenced — never evaluated', {
    vars: { used: { $work: 'used' }, unused: { $work: 'unused' } },
    value: '$vars.used',
  })
  await show('an inner block shadows an outer name', {
    vars: { label: 'outer' },
    nested: { vars: { label: 'inner' }, value: '$vars.label' },
    plain: '$vars.label',
  })
  await show('a var may drill, and a miss is null', {
    vars: { user: { $literal: { name: { first: 'Ada' } } } },
    first: '$vars.user.name.first',
    missing: '$vars.user.name.middle',
  })
  await show('vars on a plain literal is consumed from the output', {
    vars: { title: 'Report' },
    heading: '$vars.title',
  })
  await show('rule 5: a fallback sees its node’s vars', {
    operator: 'plus',
    vars: { safe: 'recovered' },
    values: [{ $work: ['boom', 0, true] }, 1],
    fallback: '$vars.safe',
  })

  section('if / match / firstOf — the branch not taken')
  await show('only the chosen branch runs', {
    $if: [true, { $work: 'taken' }, { $work: 'skipped' }],
  })
  await show('an omitted else is null — success, not failure', { $if: [false, 'yes'] })
  await show('match: only the matching branch runs', {
    $match: ['b', { a: { $work: 'branch-a' }, b: { $work: 'branch-b' } }],
  })
  await show('match: no branch, no default — a catchable failure', {
    $match: ['zzz', { a: 'A' }],
  })
  await show('match: the default is lazy too', {
    $match: ['zzz', { a: { $work: 'a' } }, { $work: 'the-default' }],
  })
  await show('firstOf: the backup request never fires', {
    $firstOf: [{ $work: 'primary' }, { $work: 'backup' }],
  })
  await show('firstOf skips only null — "" is an answer', { $firstOf: ['', 'backup'] })
  await show('firstOf: a failing candidate fails the node', {
    $firstOf: [{ $work: ['risky', 0, true] }, 'backup'],
  })
  await show('…demote it to an absence with its own fallback', {
    $firstOf: [{ operator: 'work', label: 'risky', fail: true, fallback: null }, 'backup'],
  })

  section('and / or — parallel, with early resolution and cancellation')
  await show('every operand starts; the decider ends the node', {
    $or: [{ $work: ['slow', 200] }, { $work: ['quick', 5] }],
  })
  await show('a failure that loses the race is discarded', {
    $or: [{ $work: ['flaky', 1, true] }, { $work: ['decider', 20] }],
  })
  await show('…the same failure matters when nothing decides', {
    $or: [{ $work: ['flaky', 1, true] }, { $literal: false }],
  })
  await show('empty input is the vacuous identity', {
    both: { operator: 'and', values: [] },
    either: { operator: 'or', values: [] },
  })
  await show('not: null is falsy, so this is the "is it unset?" test', {
    $not: '$data.user.disabled',
  })

  section('A decision tree — everything at once')
  await show(
    'vars + nested match + lazy branches, for a 12-year-old foursome',
    {
      vars: {
        younger: { $match: ['$data.difficulty', { easy: 'Go Fish', hard: 'Rummy' }] },
        older: { $match: ['$data.difficulty', { easy: 'Rummy', hard: '500' }] },
      },
      operator: 'match',
      value: '$data.players',
      branches: { 1: 'Solitaire' },
      default: {
        $if: [{ $lessThan: ['$data.age', 12] }, '$vars.younger', '$vars.older'],
      },
    },
    { data: { players: 4, age: 12, difficulty: 'easy' } }
  )
}

main()
