import { mapKeys } from 'lodash'
import {
  operators,
  EvaluatorNode,
  Operator,
  BaseOperatorNode,
  ValueNode,
  OperatorNode,
  EvaluatorOptions,
} from './types'

import { standardiseOperatorName } from './helpers'
import * as operatorList from './operators'

type OperatorObject = {
  requiredProperties: string[]
  operatorAliases: string[]
  propertyAliases: { [key: string]: string } // Can we specify "string"?
  evaluate: (expression: BaseOperatorNode, options: EvaluatorOptions) => ValueNode
  parseChildren: (expression: OperatorNode) => OperatorNode
}

export const operatorObjects: { [key in Operator]: OperatorObject } = Object.fromEntries(
  operators.map((operator) => [operator, operatorList[operator] as any]) //FIX ANY
) as { [key in Operator]: OperatorObject }

const buildOperatorAliases = (operatorObjects: { [key in Operator]: OperatorObject }) => {
  const aliases: { [key: string]: Operator } = {}
  Object.entries(operatorObjects).forEach(([operator, { operatorAliases }]) => {
    operatorAliases.forEach((alias) => (aliases[alias] = operator as Operator))
  })
  return aliases
}

const operatorAliases = buildOperatorAliases(operatorObjects)

export const getOperatorName = (aliasName: string): Operator | undefined => {
  return operatorAliases?.[standardiseOperatorName(aliasName)]
}

export const mapPropertyAliases = (
  propertyAliases: { [key: string]: string },
  expression: OperatorNode
): OperatorNode =>
  mapKeys(expression, (_, key: string) =>
    key in propertyAliases ? propertyAliases[key] : key
  ) as OperatorNode

// Converts from a range of allowed operator aliases into their canonical form
// export const operatorAliases: { [key: string]: Operator } = {
// and: 'AND',
// '&': 'AND',
// '&&': 'AND',
// or: 'OR',
// '|': 'OR',
// '||': 'OR',
// '=': 'EQUAL',
// eq: 'EQUAL',
// equal: 'EQUAL',
// equals: 'EQUAL',
// '!=': 'NOT_EQUAL',
// '!': 'NOT_EQUAL',
// ne: 'NOT_EQUAL',
// notEqual: 'NOT_EQUAL',
// '+': 'PLUS',
// plus: 'PLUS',
// add: 'PLUS',
// concat: 'PLUS',
// join: 'PLUS',
// merge: 'PLUS',
// '?': 'CONDITIONAL',
// conditional: 'CONDITIONAL',
// ifThen: 'CONDITIONAL',
// regex: 'REGEX',
// patternMatch: 'REGEX',
// regexp: 'REGEX',
// matchPattern: 'REGEX',
// objectProperties: 'OBJECT_PROPERTIES',
// objProps: 'OBJECT_PROPERTIES',
// getProperty: 'OBJECT_PROPERTIES',
// getObjProp: 'OBJECT_PROPERTIES',
// stringSubstitution: 'STRING_SUBSTITUTION',
// substitute: 'STRING_SUBSTITUTION',
// stringSub: 'STRING_SUBSTITUTION',
// replace: 'STRING_SUBSTITUTION',
// pgSql: 'PG_SQL',
// sql: 'PG_SQL',
// postgres: 'PG_SQL',
// pg: 'PG_SQL',
// pgDb: 'PG_SQL',
// graphQl: 'GRAPHQL',
// graphql: 'GRAPHQL',
// gql: 'GRAPHQL',
// get: 'GET',
// api: 'GET',
// post: 'POST',
// buildObject: 'BUILD_OBJECT',
// build: 'BUILD_OBJECT',
// object: 'BUILD_OBJECT',
// objectFunctions: 'OBJECT_FUNCTIONS',
// function: 'OBJECT_FUNCTIONS',
// functions: 'OBJECT_FUNCTIONS',
// runFunction: 'OBJECT_FUNCTIONS',
// }

// const propertyAliases: { [key in Operator]: { [key: string]: string } } = {
// CONDITIONAL: {
//   ifTrue: 'valueIfTrue',
//   ifFalse: 'valueIfFalse',
//   ifNot: 'valueIfFalse',
// },
// REGEX: {
//   string: 'testString',
//   value: 'testString',
//   regex: 'pattern',
//   regexp: 'pattern',
//   regExp: 'pattern',
//   re: 'pattern',
// },
// OBJECT_PROPERTIES: {
//   path: 'property',
// },
// STRING_SUBSTITUTION: {
//   replacements: 'substitutions',
// },
// PG_SQL: {
//   replacements: 'values',
// },
// GRAPHQL: {
//   endpoint: 'url',
//   outputNode: 'returnNode',
//   returnProperty: 'returnNode',
// },
// GET: {
//   endpoint: 'url',
//   outputProperty: 'returnProperty',
// },
// POST: {
//   endpoint: 'url',
//   outputProperty: 'returnProperty',
// },
// BUILD_OBJECT: {
//   values: 'properties',
//   keyValPairs: 'properties',
//   keyValuePairs: 'properties',
// },
// OBJECT_FUNCTIONS: {
//   functionsPath: 'functionPath',
//   arguments: 'args',
//   variables: 'args',
// },
// }
