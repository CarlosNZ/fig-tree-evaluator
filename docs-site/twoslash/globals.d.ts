/**
 * Globals every type-checked snippet can use without setting them up, so a
 * snippet shows only what it's about. ec.config.mjs adds this file to each
 * snippet's program; the site's own tsconfig leaves it out.
 *
 * A snippet that's about setup (imports, constructor options) writes its own,
 * and its own `fig` takes the place of this one.
 */
import type { FigTree } from 'fig-tree-evaluator'

declare global {
  /** An instance with the default options, as `new FigTree()` makes. */
  const fig: FigTree
}
