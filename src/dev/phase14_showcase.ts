/**
 * Phase 14 showcase — `pnpm dev phase14_showcase`. Packaging: what a host
 * imports, what it pays for, and what a tool gets from the editor-hints
 * subpath. Every phase closes with one of these (implementation-plan
 * working rule 7).
 *
 * Runs offline. Most of the phase is build machinery that `pnpm build` and
 * `pnpm check:package` exercise, so the last section runs those reports
 * when build/ exists. Before that are the parts a host or a tool author
 * meets: the root's export list, a host definition going through
 * `defineOperator()`'s checks, and editor-hints turned into starting nodes
 * that evaluate.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import * as root from '../index'
import { FigTree, coreOperators, defineOperator, isFigTreeError } from '../index'
import type { ExpectedType, FragmentHints, OperatorInfo } from '../index'
import { categoryHints, operatorHints, typeSeeds } from '../editor-hints'
import { block, outcome, section } from './showcase'

const fig = new FigTree({
  operators: [coreOperators],
  fragments: {
    greeting: {
      expression: { $buildString: ['Hello, %1', '$params.name'] },
      parameters: { name: { type: 'string' } },
      description: 'A greeting',
      // A fragment's display hints travel in its own metadata, in the
      // operator hints' shape with `docUrl` optional
      metadata: {
        displayName: 'Greeting',
        backgroundColor: '#477799',
        textColor: '#ffffff',
      } satisfies FragmentHints,
    },
  },
})

/** A parameter's starting value, by the rule on `OperatorHints.seeds`. */
const startingValue = (operator: string, parameter: string, type: ExpectedType): unknown => {
  const seeds = operatorHints[operator]?.seeds ?? {}
  if (parameter in seeds) return seeds[parameter]
  if (typeof type === 'string') return typeSeeds[type]
  if ('literal' in type) return type.literal[0]
  return typeSeeds[type.find((member) => member !== 'null') ?? 'null']
}

/** What an editor inserts for a new node: its required parameters, seeded. */
const startingNode = (info: OperatorInfo, extra: string[] = []) => {
  const node: Record<string, unknown> = { operator: info.name }
  for (const [name, parameter] of Object.entries(info.parameters))
    if (parameter.required || extra.includes(name))
      node[name] = startingValue(info.name, name, parameter.type)
  return node
}

const main = async () => {
  section('The root entry: every value it exports is contract')

  const exported = Object.entries(root)
  const kinds = new Map<string, string[]>()
  for (const [name, value] of exported) {
    const kind =
      typeof value === 'function'
        ? /^[A-Z]/.test(name)
          ? 'classes'
          : 'functions'
        : Array.isArray(value)
          ? 'arrays'
          : typeof value === 'symbol'
            ? 'symbols'
            : typeof value === 'string'
              ? 'strings'
              : 'objects'
    kinds.set(kind, [...(kinds.get(kind) ?? []), name])
  }
  for (const [kind, names] of kinds) console.log(`  ${kind.padEnd(10)}${names.join(', ')}`)
  console.log(
    `\n  ${exported.length} values — exactly the spec's list, which test/exports.test.ts\n` +
      '  holds the root to. The type checker, trim, toCodePoints and roundDecimal\n' +
      "  are gone from it: a validate hook's toolbox carries what hooks need.\n"
  )

  section("defineOperator(): a host's definition, checked")

  try {
    defineOperator({
      name: 'percent',
      description: 'A value as a percentage of a total',
      // @ts-expect-error — a category from outside the closed vocabulary
      category: 'maths',
      parameters: {
        value: { type: 'number' },
        total: { type: 'number', default: 0, required: true },
        missingDefault: { type: 'number', required: false },
      },
      // Never runs: the checks reject the definition first
      evaluate: () => null,
    })
  } catch (error) {
    if (!isFigTreeError(error)) throw error
    console.log(`  ✗ ${error.code}: ${error.issues?.length} problems, reported together`)
    for (const issue of error.issues ?? [])
      console.log(`      ${JSON.stringify(issue.path).padEnd(36)} ${issue.message}`)
  }

  const percent = defineOperator({
    name: 'percent',
    description: 'A value as a percentage of a total',
    category: 'math',
    parameters: { value: { type: 'number' }, total: { type: 'number' } },
    positionalParams: ['value', 'total'],
    evaluate: ({ value, total }) => (value / total) * 100,
  })
  const withPercent = new FigTree({ operators: [coreOperators, percent] })
  console.log(
    `\n  Fixed, it registers: { $percent: [3, 12] } ${await outcome(() =>
      withPercent.evaluate({ $percent: [3, 12] })
    )}`
  )
  console.log(
    "\n  The package's own 43 definitions skip these checks at import — they are\n" +
      '  constants, checked in CI and in `pnpm build` instead — which is what keeps\n' +
      '  the validator out of a bundle that never calls defineOperator().\n'
  )

  section('editor-hints: an operator list, grouped and labelled')

  const operators = fig.getOperators()
  const categories = Object.entries(categoryHints).sort(([, a], [, b]) => a.order - b.order)
  for (const [category, hints] of categories) {
    const names = operators
      .filter((info) => info.category === category)
      .map((info) => operatorHints[info.name]?.displayName ?? info.name)
    if (names.length > 0) console.log(`  ${hints.displayName.padEnd(20)}${names.join(', ')}`)
  }
  console.log(
    '\n  Labels and order from categoryHints, each operator from its definition\n' +
      "  — the grouping is data the package ships, not the editor's own table.\n"
  )

  section('editor-hints: new nodes, seeded, and what they evaluate to')

  const showcase: [string, string[]?][] = [
    ['plus'],
    ['buildString', ['substitutions']],
    ['round', ['decimals']],
    ['match', ['default']],
    ['map'],
    ['get', ['from']],
    ['convert'],
    ['split', ['delimiter']],
  ]
  for (const [name, extra] of showcase) {
    const info = operators.find((entry) => entry.name === name)
    if (info === undefined) continue
    const node = startingNode(info, extra)
    const label = extra
      ? `${operatorHints[name].displayName}, with ${extra.join(', ')} added`
      : operatorHints[name].displayName
    console.log(
      `  ${label}\n      ${block(node)}\n    ${await outcome(() => fig.evaluate(node))}\n`
    )
  }
  console.log(
    '  Every seeded node validates — test/editor-hints.test.ts checks each\n' +
      "  operator's starting node alone and with each optional parameter added.\n"
  )

  section('A fragment describes itself in its own metadata')

  for (const info of fig.getFragments()) {
    const hints = info.metadata as FragmentHints | undefined
    console.log(
      `  ${info.name}: shown as "${hints?.displayName ?? info.name}", ` +
        `${hints?.backgroundColor ?? '(editor default)'} on ${hints?.textColor ?? '—'}, ` +
        `docs ${hints?.docUrl ?? 'none (optional for fragments)'}`
    )
    console.log(
      `      ${block({ $greeting: { name: 'Carl' } })} ${await outcome(() =>
        fig.evaluate({ $greeting: { name: 'Carl' } })
      )}\n`
    )
  }

  section('The package as built')

  if (!existsSync('build/index.js')) {
    console.log('  No build/ — run `pnpm build`, then this section shows the reports.\n')
    return
  }
  for (const script of ['codegen/bundleSize.mjs', 'codegen/checkPackage.mjs']) {
    const result = spawnSync('node', [script], { encoding: 'utf8' })
    const lines = result.stdout.split('\n').filter((line) => !/^\s+[\d.]+%/.test(line))
    console.log(lines.join('\n').trimEnd() + '\n')
  }
}

main()
