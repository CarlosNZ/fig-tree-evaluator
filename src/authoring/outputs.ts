/**
 * Rule 7 of the coverage walk ("The seven rules" in
 * docs-dev/v3-specs/v3-fallback-coverage.md): what an operator node
 * returns. The `gamut` of its analysis where it has one (./core.ts for the
 * core operators, a host's `declareAnalysis` for its own), which can bound
 * what it returns ("Value ranges"); its `returns` otherwise.
 *
 * Then the result boundary: the engine refuses a NaN result from an operator
 * declared to return a number, and nothing else. Under `strictNumbers`,
 * where a number from the data may be NaN, such a node that may return one
 * may fail there, and what passes its boundary is never NaN. An infinity
 * passes every boundary.
 */
import type { OperatorNode } from '../compile/artifact'
import { typeNamesNumber } from '../typeCheck'
import {
  NOTHING,
  exactly,
  fits,
  mayBeNaN,
  mayBeNonFinite,
  ofType,
  union,
  unionOf,
  withoutNaN,
} from './known'
import type { Known } from './known'
import type { Inputs } from './inputs'
import type { Failure } from './findings'
import { gamutOf } from './helpers'
import type { Hooked } from './helpers'

const INFINITE: Known = [{ type: 'infinite' }]
const NAN: Known = [{ type: 'nan' }]

/** The NaN or infinity a value is exactly: an infinity of either sign. */
const constantNonFinite = (known: Known): Known =>
  unionOf(
    known.map((member): Known => {
      if (!('exact' in member) || typeof member.exact !== 'number' || Number.isFinite(member.exact))
        return NOTHING
      return Number.isNaN(member.exact) ? [member] : [{ exact: Infinity }, { exact: -Infinity }]
    })
  )

/**
 * The node's output, and its failure at the result boundary if it can have
 * one. Without a run, a null that must propagate is all the node returns.
 */
export const operatorOutput = (
  node: OperatorNode,
  inputs: Inputs,
  strictNumbers: boolean,
  analysis?: Hooked
): { output: Known; boundary?: Failure } => {
  if (inputs.propagates === 'yes') return { output: exactly(null) }
  let output =
    (analysis !== undefined ? gamutOf(analysis) : undefined) ??
    ofType(node.entry.definition.returns)
  // A number computed from an infinity may be one too (floor, a sum), and
  // one from NaN is NaN, which only an `any` parameter can have received (a
  // conversion). A constant one stays a constant, of either sign for an
  // infinity, since only a constant counts at the ordinary level. NaN made
  // from infinities (Infinity - Infinity) is the overflow entries' to report
  if (fits(output, 'number') !== 'no') {
    const received = Object.values(inputs.received)
    if (received.some((known) => mayBeNonFinite(known) !== 'no')) output = union(output, INFINITE)
    if (received.some((known) => mayBeNaN(known) !== 'no')) output = union(output, NAN)
    output = unionOf([output, ...received.map(constantNonFinite)])
  }
  if (inputs.propagates === 'maybe') output = union(output, exactly(null))
  return atBoundary(node, output, strictNumbers, inputs.propagates === 'no')
}

/**
 * What passes the result boundary, and the failure there if a NaN can reach
 * it: certain where nothing else can, and `certain` allows. Only an
 * operator declared to return a number refuses one; any other hands it on.
 */
export const atBoundary = (
  node: OperatorNode,
  output: Known,
  strictNumbers: boolean,
  certain: boolean
): { output: Known; boundary?: Failure } => {
  if (!typeNamesNumber(node.entry.definition.returns)) return { output }
  const counted = mayBeNaN(strictNumbers ? output : exactOnly(output))
  const passed = withoutNaN(output)
  if (counted === 'no') return { output: passed }
  const certainty = passed.length === 0 && certain ? 'always' : 'may'
  return {
    output: passed,
    boundary: {
      path: node.path,
      code: 'non-finite-result',
      message: `${node.name} – non-finite-result${certainty === 'may' ? ' possible' : ''} when it gives NaN`,
      certainty,
      operator: node.name,
      order: [node.order],
    },
  }
}

/**
 * Only a NaN known exactly, a constant passed through, counts at the
 * ordinary level: there the data carries none.
 */
const exactOnly = (known: Known): Known => known.filter((member) => 'exact' in member)
