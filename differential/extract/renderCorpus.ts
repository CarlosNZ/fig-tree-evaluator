/**
 * The source of differential/corpus.ts, from the cases the extraction kept.
 * Options that more than one case has are written once, as a named object
 * the cases share. Prettier formats the source before it is written.
 */

export interface WrittenCase {
  /** The v2 test it came from, as `file › test name` */
  from: string
  /** The expression's source, or `massiveQuery` for the case that reads it */
  expression: string
  options?: string
  database?: 'sqlite'
}

export const renderCorpus = (cases: WrittenCase[], version: string): string => {
  const uses = new Map<string, number>()
  for (const { options } of cases)
    if (options !== undefined) uses.set(options, (uses.get(options) ?? 0) + 1)
  const shared = new Map<string, string>()
  const declarations: string[] = []
  for (const { options, from } of cases) {
    if (options === undefined || (uses.get(options) ?? 0) < 2 || shared.has(options)) continue
    const name = `options${shared.size + 1}`
    shared.set(options, name)
    declarations.push(`// ${from.split(' › ')[0]}\nconst ${name}: CaseOptions = ${options}`)
  }

  const entries = cases.map((entry, index) => {
    const fields = [
      `id: ${index + 1}`,
      `from: ${JSON.stringify(entry.from)}`,
      `expression: ${entry.expression}`,
    ]
    if (entry.options !== undefined)
      fields.push(`options: ${shared.get(entry.options) ?? entry.options}`)
    if (entry.database !== undefined) fields.push(`database: ${JSON.stringify(entry.database)}`)
    return `{ ${fields.join(', ')} }`
  })

  const massive = cases.some((entry) => entry.expression === 'massiveQuery')
  const types = declarations.length > 0 ? 'Case, CaseOptions' : 'Case'
  return [
    `/**
 * The differential's corpus ("The corpus" in
 * docs-dev/v3-specs/v3-converter.md): the cases in the tests of
 * fig-tree-evaluator ${version} that evaluate an expression, in the order
 * the tests ran. Each holds the options v2 evaluated it with beyond the
 * runner's defaults (differential/case.ts).
 *
 * Extracted once, by differential/extract/, and kept by hand since: a new
 * case takes the next id, wherever it goes.
 */`,
    [
      ...(massive ? [`import { readFileSync } from 'node:fs'`] : []),
      `import type { ${types} } from './case'`,
    ].join('\n'),
    ...(massive
      ? [
          `// An expression of 20,000 nodes, read from its file rather than held here\nconst massiveQuery: unknown = JSON.parse(readFileSync('test/massiveQuery.json', 'utf8'))`,
        ]
      : []),
    ...declarations,
    `export const corpus: Case[] = [\n${entries.join(',\n')}\n]\n`,
  ].join('\n\n')
}
