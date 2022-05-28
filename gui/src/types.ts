import { PostgresInterface } from './postgresInterface'
import { EvaluatorOutput } from './expression-evaluator/types'
import EvaluatorDev from './expression-evaluator/evaluator'
import EvaluatorPublished from '@carlosnz/expression-evaluator'

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
}

export interface Result {
  output: EvaluatorOutput
  error: string | false
}
