import { EvaluatorOutput } from './fig-tree-evaluator/src/types'

export interface InputState {
  expression: string
  data: string
}

export interface IsValidState {
  expression: boolean
  data: boolean
}

export interface ConfigState {
  strictJsonExpression: boolean
  strictJsonData: boolean
}

export interface Result {
  output: EvaluatorOutput
  error: string | false
}
