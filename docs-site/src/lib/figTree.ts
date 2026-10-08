import { FigTree } from 'fig-tree-evaluator'

/**
 * The one instance the site evaluates with: at build time for the static
 * examples, and in the browser for the widgets, so both give the same answer.
 * Core operators only — the build has no HTTP client or database.
 */
export const figTree = new FigTree()
