/*
The `…Default` naming family's check ("Registration & validation" in
docs-dev/v3-specs/v3-operator-contract.md), run over the package's own
definitions by codegen/checkDefinitions.ts and
test/package-definitions.test.ts.

The suffix is a convention for readers of the core set; the engine attaches
no meaning to any parameter name. The failure it guards against is a
family-named parameter left in eager delivery: it resolves as ordinary data
the body ignores, and the node silently does the un-defaulted thing. A
host's definitions are not held to it, so it is no part of
`defineOperator()`.

The check reads the name alone, and the bare word `default` sits outside the
pattern deliberately — `match.default` is an established term.
*/
import type { OperatorDefinition } from '../src/operatorDefinition'

const DEFAULT_FAMILY = /[a-z]Default$/

/** One message per family-named parameter that is not lazy. */
export const defaultFamilyIssues = (definition: OperatorDefinition): string[] =>
  Object.entries(definition.parameters)
    .filter(([name, d]) => DEFAULT_FAMILY.test(name) && d.evaluationMode !== 'lazy')
    .map(
      ([name]) =>
        `${definition.name}: '${name}' is named for the '…Default' family, so it must declare evaluationMode: 'lazy' — add 'replacesNullAt', read it as a LazyValue in the body, or rename it`
    )
