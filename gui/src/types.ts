import { EvaluatorOptions, EvaluatorOutput } from './expression-evaluator/types'
import EvaluatorDev from './expression-evaluator/evaluator'
import EvaluatorPublished from 'expression-evaluator'

export interface InputState {
  expression: string
  objects: string
}

export interface IsValidState {
  expression: boolean
  objects: boolean
}

export interface ConfigState {
  evaluator: EvaluatorDev | EvaluatorPublished
  strictJsonExpression: boolean
  strictJsonObjects: boolean
  options: EvaluatorOptions
}

export interface Result {
  output: EvaluatorOutput
  error: string | false
}
