import { PostgresInterface } from './postgresInterface'
import { ValueNode } from './expression-evaluator/types'
import Evaluator from './expression-evaluator/evaluator'

export interface InputState {
  expression: string
  objects: string
}

export interface IsValidState {
  expression: boolean
  objects: boolean
}

export interface ConfigState {
  evaluator: Evaluator
  strictJsonExpression: boolean
  strictJsonObjects: boolean
}

export interface Result {
  result: ValueNode
  error: string | false
}
