/**
 * The v2 converter's two generated tables ("The v2 reference table" and
 * "v3's operator names" in docs-dev/v3-specs/v3-converter.md): extracted as
 * data, and rendered as the modules checked in under src/migrate/.
 *
 * codegen/extractV2Table.ts writes the modules. test/migrate-table.test.ts
 * extracts afresh and holds the checked-in modules' data to the result, so
 * a hand edit to a generated file, a v2 release that changes a name or
 * alias, and a core operator renamed or re-aliased each fail `pnpm test`.
 * The test compares data rather than text, since Prettier cannot run inside
 * Jest; `pnpm format:check` covers the text.
 */
import type { OperatorMetadata } from 'fig-tree-evaluator-v2'

export interface V2Table {
  version: string
  /** v2's alias table: every name, mapped to its operator. */
  names: Record<string, string>
  /** Each operator's parameters in declaration order, with their aliases. */
  parameters: Record<string, { name: string; aliases: string[] }[]>
}

// MATCH declares `[...branches]`, meaning "branches may sit on the node
// itself". It is not a parameter, and V2_BEHAVIOUR records what it meant.
const PSEUDO_PARAMETERS = new Set(['[...branches]'])

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

export const extractV2Table = (
  operators: readonly OperatorMetadata[],
  version: string
): V2Table => {
  const names: Record<string, string> = {}
  const parameters: V2Table['parameters'] = {}

  for (const operator of operators) {
    for (const alias of operator.aliases) {
      if (Object.hasOwn(names, alias))
        throw new Error(`v2 name "${alias}" is claimed by ${names[alias]} and ${operator.name}`)
      names[alias] = operator.name
    }

    parameters[operator.name] = operator.parameters
      .filter(({ name }) => !PSEUDO_PARAMETERS.has(name))
      .map(({ name, aliases }) => {
        // A new pseudo-parameter must be looked at, not tabled as a real one
        if (!IDENTIFIER.test(name))
          throw new Error(`v2 parameter "${name}" on ${operator.name} is not a plain name`)
        return { name, aliases: [...aliases] }
      })
  }

  return { version, names, parameters }
}

/** The shape of a definition this reads: its name and its one alias. */
interface NamedDefinition {
  name: string
  alias?: string
}

/**
 * Every name and alias of the core and I/O operators, mapped to the
 * operator's name.
 */
export const extractV3Names = (definitions: readonly NamedDefinition[]): Record<string, string> => {
  const names: Record<string, string> = {}
  for (const { name, alias } of definitions) {
    for (const key of alias === undefined ? [name] : [name, alias]) {
      if (Object.hasOwn(names, key))
        throw new Error(`v3 name "${key}" is claimed by ${names[key]} and ${name}`)
      names[key] = name
    }
  }
  return names
}

// Written on one line: Prettier, run by the writing script, breaks it where
// it runs past the width, and settles the quotes
const literal = (value: unknown) => JSON.stringify(value)

const HEADER = `/**
 * AUTO-GENERATED — do not edit by hand.
 *`

export const renderV2Table = ({ version, names, parameters }: V2Table): string => `${HEADER}
 * Written by codegen/extractV2Table.ts (\`pnpm extractV2Table\`) from the
 * published v2 package, fig-tree-evaluator ${version} (the devDependency
 * \`fig-tree-evaluator-v2\`): each operator's name, aliases and parameters,
 * as its \`getOperators()\` reports them. test/migrate-table.test.ts holds
 * this module to a fresh extraction ("The v2 reference table" in
 * docs-dev/v3-specs/v3-converter.md).
 */

/** The v2 release this table was extracted from. */
export const V2_VERSION = ${literal(version)}

/** The ${Object.keys(parameters).length} v2 operators, by their canonical names. */
export type V2Operator = ${Object.keys(parameters)
  .map((name) => literal(name))
  .join(' | ')}

/** A v2 parameter by its canonical name, with its property aliases. */
export interface V2Parameter {
  name: string
  aliases: readonly string[]
}

/**
 * v2's alias table: every name an operator node could give, mapped to its
 * operator. v2 standardized a name before looking it up (./names.ts), so
 * some keys can never match (\`GET\` standardizes to \`get\`), and they are
 * kept, since the table is v2's own.
 */
export const V2_NAMES: Record<string, V2Operator> = ${literal(names)}

/** Each operator's parameters in declaration order, with their aliases. */
export const V2_PARAMETERS: Record<V2Operator, readonly V2Parameter[]> = ${literal(parameters)}
`

export const renderV3Names = (names: Record<string, string>): string => `${HEADER}
 * Written by codegen/extractV2Table.ts (\`pnpm extractV2Table\`) from the
 * core and I/O operators' definitions. The converter carries it so that it
 * can rename a v2 function or fragment whose name v3 already uses, without
 * importing the engine. test/migrate-table.test.ts holds this module to a
 * fresh extraction ("v3's operator names" in
 * docs-dev/v3-specs/v3-converter.md).
 */

/**
 * Every name and alias of a core or I/O operator, mapped to the operator's
 * name.
 */
export const V3_NAMES: Record<string, string> = ${literal(names)}
`
