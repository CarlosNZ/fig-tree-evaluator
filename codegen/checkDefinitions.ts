/*
Runs the package's own operator definitions — the core operators and the
I/O operators — through `defineOperator()`'s full checks, and fails if any
is malformed.

The package builds these with `buildOperator` (src/buildOperator.ts), which
trusts its input so that a bundle importing only `FigTree` and
`coreOperators` never carries the checks. They are checked here instead, in
`pnpm build` (and so in `prepublishOnly`), and in
test/package-definitions.test.ts, which also holds each built artifact equal
to the checked one. Each is checked with its `./editor-hints` text in place
(codegen/packageDefinitions.ts), since `defineOperator()` requires it.
*/
import { defineOperator } from '../src/defineOperator'
import { packageDefinitions, withHintText } from './packageDefinitions'

const definitions = packageDefinitions()

for (const definition of definitions) defineOperator(withHintText(definition))

console.log(`Checked ${definitions.length} package operator definitions`)
