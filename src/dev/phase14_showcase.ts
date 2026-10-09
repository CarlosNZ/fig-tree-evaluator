/**
 * Phase 14 showcase — `pnpm dev phase14_showcase`. Packaging: what a host
 * imports, what it pays for, and what a tool gets from the catalog
 * subpath. Every phase closes with one of these (implementation-plan
 * working rule 7).
 *
 * Runs offline. Most of the phase is build machinery that `pnpm build` and
 * `pnpm check:package` exercise, so the last section runs those reports
 * when build/ exists. Before that are the parts a host or a tool author
 * meets: the root's export list, a host definition going through
 * `defineOperator()`'s checks, and the catalog's starting nodes, which
 * evaluate.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import * as root from '../index'
import { FigTree, coreOperators, defineOperator, isFigTreeError } from '../index'
import type { CatalogOperator, FragmentListing } from '../index'
import { getCatalog } from '../catalog'
import { block, outcome, section } from './showcase'

const fig = new FigTree({
  operators: [coreOperators],
  fragments: {
    greeting: {
      expression: { $buildString: ['Hello, %1', '$params.name'] },
      parameters: { name: { type: 'string' } },
      description: 'A greeting',
      // A fragment's listing is its own metadata
      metadata: {
        displayName: 'Greeting',
        backgroundColor: '#477799',
        textColor: '#ffffff',
        seeds: { name: 'Ada' },
      } satisfies FragmentListing,
    },
  },
})

/** What an editor inserts for a new node: its required parameters, seeded. */
const startingNode = (operator: CatalogOperator, extra: string[] = []) => {
  const node: Record<string, unknown> = { operator: operator.name }
  for (const [name, parameter] of Object.entries(operator.parameters))
    if (parameter.required || extra.includes(name)) node[name] = parameter.seed
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

  section('getCatalog(): an operator list, grouped and labelled')

  const { categories, operators, fragments } = getCatalog(fig)
  for (const category of categories) {
    const names = operators
      .filter((operator) => operator.category === category.name)
      .map((operator) => operator.displayName)
    if (names.length > 0) console.log(`  ${category.displayName.padEnd(20)}${names.join(', ')}`)
  }
  console.log(
    "\n  Categories in their order, each operator under its definition's category\n" +
      "  — the grouping is data the package ships, not the editor's own table.\n"
  )

  section('getCatalog(): new nodes, seeded, and what they evaluate to')

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
    const operator = operators.find((entry) => entry.name === name)
    if (operator === undefined) continue
    const node = startingNode(operator, extra)
    const label = extra
      ? `${operator.displayName}, with ${extra.join(', ')} added`
      : operator.displayName
    console.log(
      `  ${label}\n      ${block(node)}\n    ${await outcome(() => fig.evaluate(node))}\n`
    )
  }
  console.log(
    '  Every seeded node validates — test/catalog.test.ts checks each\n' +
      "  operator's starting node alone and with each optional parameter added.\n"
  )

  section('A fragment lists itself in its own metadata')

  for (const fragment of fragments) {
    const node = {
      [`$${fragment.name}`]: Object.fromEntries(
        Object.entries(fragment.parameters).map(([name, parameter]) => [name, parameter.seed])
      ),
    }
    console.log(
      `  ${fragment.name}: shown as "${fragment.displayName}", ` +
        `${fragment.backgroundColor ?? '(editor default)'} on ${fragment.textColor ?? '—'}, ` +
        `"${fragment.description}"`
    )
    console.log(`      ${block(node)} ${await outcome(() => fig.evaluate(node))}\n`)
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
