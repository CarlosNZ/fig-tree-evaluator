import { allPropsOk, zipArraysToObject } from './_helpers'
import { OperationInput } from '../operatorReference'
import { BaseOperatorNode, EvaluatorNode, ValueNode } from '../types'

export interface StringSubNode extends BaseOperatorNode {
  string?: EvaluatorNode
  substitutions?: EvaluatorNode[]
}

const parse = (expression: BaseOperatorNode): EvaluatorNode[] => {
  const { string, substitutions } = expression
  allPropsOk(['string', 'substitutions'], expression)
  return [string, ...substitutions]
}

const operate = ({ children }: OperationInput): ValueNode => {
  const origString: string = children[0]
  const replacements = children.slice(1)
  const regex = /%([\d]+)/g // To-Do: handle escaping literal values
  const parameters = (origString.match(regex) || []).sort(
    (a, b) => Number(a.slice(1)) - Number(b.slice(1))
  )
  const uniqueParameters = new Set(parameters)
  const replacementsObj = zipArraysToObject(Array.from(uniqueParameters), replacements)
  let outputString = origString
  Object.entries(replacementsObj)
    .reverse()
    .forEach(([param, replacement]) => {
      outputString = outputString.replace(new RegExp(`${param}`, 'g'), replacement ?? '')
    })
  return outputString
}

export const stringSubstitution = { parse, operate }
