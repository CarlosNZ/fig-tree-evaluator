/**
 * What v2 operators did that no data file says ("`behaviour.ts`" in
 * docs-dev/v3-specs/v3-converter.md), each entry read from the operator's own
 * code.
 */
import type { V2Operator } from './operators.generated'

export interface V2OperatorBehaviour {
  /**
   * Object parameters whose values the operator evaluated itself. With
   * `evaluateFullObject` off, v2 treated a plain object as data, except inside
   * one of these, so the `literal`-wrap rule walks such an object rather than
   * wrapping it.
   */
  evaluatesContents?: readonly string[]
  /** The parameter that the node's undeclared keys went into. */
  extraKeys?: string
}

export const V2_BEHAVIOUR: Partial<Record<V2Operator, V2OperatorBehaviour>> = {
  // `evaluateObject` on each
  GET: { evaluatesContents: ['parameters', 'headers'] },
  POST: { evaluatesContents: ['parameters', 'headers'] },
  // `evaluateObject` on `variables`; its `headers` are not evaluated
  GRAPHQL: { evaluatesContents: ['variables'] },
  // The `key` and `value` of each element of `properties`
  BUILD_OBJECT: { evaluatesContents: ['properties'] },
  // The branch that matches. Branches could also sit on the node itself.
  MATCH: { evaluatesContents: ['branches'], extraKeys: 'branches' },
  // The substitution each named token reads, drilled, in `getReplacement`
  STRING_SUBSTITUTION: { evaluatesContents: ['substitutions'] },
  // `evaluateObject` on `input`. A call naming the function in `operator` had
  // its undeclared keys gathered into `input`, but that was how v2 rewrote
  // the call, not how CUSTOM_FUNCTIONS behaved, so it is not `extraKeys`.
  CUSTOM_FUNCTIONS: { evaluatesContents: ['input'] },
}
