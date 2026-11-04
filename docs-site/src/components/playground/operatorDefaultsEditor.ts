import type {
  DefaultValueFunction,
  NewKeyOptionsFunction,
  TypeFilterFunction,
  TypeOptions,
  UpdateFunction,
} from 'json-edit-react'
import type { ExpectedType, ParameterInfo } from 'fig-tree-evaluator'
import { checkOperatorDefaults, playgroundFigTree, type OperatorDefaults } from './playgroundSetup'

/**
 * The Configuration panel's operator defaults editor, held to what FigTree
 * accepts: an operator's name at the top level, then one of its optional
 * parameters, `fallback`, or `noCache` where it caches, each of its declared
 * type. The keys and types it offers keep new entries legal. A rename and a
 * text edit can still say anything, so every change is also checked by
 * FigTree.
 */

/** The Playground's operators never change after its instance is created. */
const operators = new Map(
  playgroundFigTree.getOperators().map((operator) => [operator.name, operator])
)

/** Levels in the editor: the root, an operator's entry, then a default. */
const ROOT = 0
const OPERATOR = 1
const DEFAULT = 2

const modifiers = (name: string) => ['fallback', ...(operators.get(name)?.cache ? ['noCache'] : [])]

/** A required parameter has no default, since every node gives it. */
const keysOf = (name: string) => [
  ...Object.entries(operators.get(name)?.parameters ?? {})
    .filter(([, { required }]) => !required)
    .map(([key]) => key),
  ...modifiers(name),
]

const newKeyOptions: NewKeyOptionsFunction = ({ level, key, value }) => {
  const taken = Object.keys(value as object)
  if (level === ROOT) return [...operators.keys()].filter((name) => !taken.includes(name))
  if (level === OPERATOR) return keysOf(String(key)).filter((name) => !taken.includes(name))
  return null
}

const STARTING_VALUES: Record<string, unknown> = {
  string: '',
  number: 0,
  integer: 0,
  boolean: false,
  array: [],
  object: {},
}

/** A value of a declared type: the first of a list of literals, and null for `any`. */
const startingValueFor = (type: ExpectedType) => {
  if (typeof type === 'string') return STARTING_VALUES[type] ?? null
  if ('literal' in type) return type.literal[0]
  return STARTING_VALUES[type[0]] ?? null
}

/** A parameter's own default if it has one, else a value of its type. */
const startingValue = ({ type, default: initial }: ParameterInfo) =>
  initial !== undefined ? initial : startingValueFor(type)

const defaultValue: DefaultValueFunction = ({ level, path }, newKey) => {
  if (level === ROOT) return {}
  if (level !== OPERATOR || newKey === undefined) return null
  if (newKey === 'noCache') return true
  const parameter = operators.get(String(path[0]))?.parameters[newKey]
  return parameter ? startingValue(parameter) : null
}

/**
 * The editor's types for a declared type: a list of string literals as an
 * enum, and `any` as every type.
 */
const typeOptions = (type: ExpectedType, name: string): boolean | TypeOptions => {
  if (typeof type === 'string') return typeOptions([type], name)
  if ('literal' in type) {
    const { literal } = type
    if (literal.every((value) => typeof value === 'string'))
      return [{ enum: name, values: literal as string[], matchPriority: 1 }]
    return [...new Set(literal.map((value) => typeof value))]
  }
  if (type.includes('any')) return true
  return [...new Set(type.map((each) => (each === 'integer' ? 'number' : each)))]
}

const allowTypeSelection: TypeFilterFunction = ({ level, key, path }) => {
  if (level < DEFAULT) return false
  if (level > DEFAULT) return true
  if (key === 'fallback') return true
  if (key === 'noCache') return ['boolean']
  const parameter = operators.get(String(path[0]))?.parameters[String(key)]
  return parameter ? typeOptions(parameter.type, String(key)) : true
}

const onUpdate: UpdateFunction = ({ newData }) => {
  const error = checkOperatorDefaults(newData as OperatorDefaults)
  if (error) return { error }
}

export const operatorDefaultsRestrictions = {
  newKeyOptions,
  defaultValue,
  allowTypeSelection,
  onUpdate,
}
