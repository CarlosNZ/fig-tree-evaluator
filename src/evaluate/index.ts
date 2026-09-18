/**
 * The evaluator — internal machinery behind `FigTree.evaluate()`. Not
 * barrel surface: the class is the public face.
 */
export { evaluateNode } from './evaluate'
export { mergeOptions, createEvaluationContext, createOperatorContext } from './context'
export type { EvaluationContext } from './context'
