import { EvaluatorOutput } from './fig-tree/types'

export interface InputState {
  expression: string
  objects: string
}

export interface IsValidState {
  expression: boolean
  objects: boolean
}

export interface ConfigState {
  strictJsonExpression: boolean
  strictJsonObjects: boolean
}

export interface Result {
  output: EvaluatorOutput
  error: string | false
}
