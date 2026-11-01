/**
 * Rule 5 of the coverage walk ("Operator rules" in
 * docs-dev/v3-specs/v3-fallback-coverage.md): an operator's own failures,
 * the entries its analysis's `failures` gives for what its parameters
 * receive (./core.ts for the core operators, a host's `declareAnalysis`
 * for its own). Everything else that can make an operator throw is a type
 * check, a null refusal or a constraint, which rule 2 reads from the
 * definition. An operator with no analysis, the I/O operators included, is
 * external: it may fail whatever its inputs.
 */
import type { FailureEntry } from '../authoringTypes'
import type { OperatorNode } from '../compile/artifact'
import { entriesOf } from './helpers'
import type { Hooked } from './helpers'
import { mayBeInfinite } from './known'
import type { Inputs } from './inputs'
import type { Failure } from './findings'

const NON_FINITE = 'non-finite-result'
const OPERATOR = 'operator-failure'

export interface RuleOptions {
  /** Whether overflow and non-finite numbers from the data count */
  strictNumbers: boolean
  /** The evaluation options in force, which an entry's `options` must match */
  evaluation: Record<string, unknown>
}

const infiniteOperand = (inputs: Inputs, strictNumbers: boolean): boolean =>
  Object.values(inputs.received).some((known) => mayBeInfinite(known, strictNumbers))

/**
 * Whether an entry counts here at all: one that needs an option only under
 * it, and an overflow only under `strictNumbers`, or where an operand is an
 * infinity known exactly, since arithmetic on one can make NaN
 * (Infinity - Infinity).
 */
export const counts = (entry: FailureEntry, inputs: Inputs, options: RuleOptions): boolean =>
  !(entry.overflow && !options.strictNumbers && !infiniteOperand(inputs, false)) &&
  Object.entries(entry.options ?? {}).every(
    ([key, value]) => (options.evaluation[key] ?? false) === value
  )

const describe = (operator: string, entry: FailureEntry): string =>
  `${operator} – ${entry.code}${entry.may ? ' possible' : ''}${
    entry.message !== undefined
      ? ` when ${entry.message}`
      : entry.overflow
        ? ' on extreme numbers'
        : ''
  }`

/**
 * The node's own failures: one finding for each entry that can occur,
 * `always` where it must and no null can end the node first. An overflow
 * takes extreme numbers, which nothing can ask for, so it is never certain;
 * nor is a non-finite result where an operand may be an infinity, which
 * the body carries through instead of failing (`Infinity / 0`). An
 * external operator may fail whatever its inputs, with whatever code its
 * own code throws, which the one `operator-failure` finding stands for.
 */
export const ownFailures = (
  node: OperatorNode,
  inputs: Inputs,
  options: RuleOptions,
  analysis: Hooked | 'external'
): Failure[] => {
  const at = { path: node.path, operator: node.name, order: [node.order] }
  const entries = analysis === 'external' ? analysis : entriesOf(analysis)
  if (entries === 'external')
    return [
      {
        ...at,
        code: OPERATOR,
        message: `${node.name} – may fail whatever its inputs: nothing describes what it fails on`,
        certainty: 'may',
      },
    ]
  const failures: Failure[] = []
  const carried = infiniteOperand(inputs, options.strictNumbers)
  for (const entry of entries) {
    const answer = entry.occurs ?? 'maybe'
    if (answer === 'no' || !counts(entry, inputs, options)) continue
    failures.push({
      ...at,
      code: entry.code,
      message: describe(node.name, entry),
      certainty:
        answer === 'yes' &&
        !entry.may &&
        !entry.overflow &&
        !(entry.code === NON_FINITE && carried) &&
        inputs.propagates === 'no'
          ? 'always'
          : 'may',
      ...(entry.parameter !== undefined ? { parameter: entry.parameter } : {}),
    })
  }
  return failures
}
