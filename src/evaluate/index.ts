/**
 * The evaluator — internal machinery behind `FigTree.evaluate()`. Not
 * barrel surface: the class is the public face.
 */
export { runEvaluation } from './run'
export { effectiveUseCache } from './operator'
export {
  mergeOptions,
  copyOptions,
  createEvaluationContext,
  createOperatorContext,
} from './context'
export type { EvaluationContext } from './context'
