/**
 * `fig-tree-evaluator/convert` — converts v2 expression trees to v3
 * ("`./convert`" in docs-dev/v3-specs/v3-packaging.md, and
 * docs-dev/v3-specs/v3-migration.md for what it converts and how). The
 * engine never imports this; this may import the engine.
 *
 * TO-DO: the conversion itself (Phase 15.1). The placeholder returns its
 * input unchanged, with one issue at the root saying so, since an empty
 * `issues` would claim a clean conversion.
 */
import type { ConversionResult } from '../conversionTypes'

export const convertV2ToV3 = (expression: unknown): ConversionResult => ({
  expression,
  issues: [
    {
      tag: 'non-convertible',
      path: [],
      message: 'convertV2ToV3 is a placeholder: the expression is returned unconverted',
    },
  ],
})
