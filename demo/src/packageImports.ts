/**
 * Quickly switch between importing from local src or installed packages
 */

// import { FigTreeEditor } from 'fig-tree-expression-builder'
import { FigTreeEditor } from './expression-builder/src'

// Published packages
export * from 'fig-tree-evaluator'
// export * from 'fig-tree-react'

// Local src
// export * from './fig-tree-evaluator/src'
export { FigTreeEditor }
