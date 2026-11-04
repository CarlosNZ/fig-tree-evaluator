import {
  isCollection,
  type DefaultValueFunction,
  type NewKeyOptionsFunction,
  type TypeFilterFunction,
} from 'json-edit-react'
import type { ExpectedType, FragmentDefinition } from 'fig-tree-evaluator'
import { startingValueFor } from './operatorDefaultsEditor'

/**
 * The Configuration panel's fragments editor, held to the shape of a
 * fragment definition. A fragment can have any name, and starts as a
 * complete one that runs as it is. FigTree checks the definitions on Save
 * rather than on each change, since renaming a parameter and the
 * expression's reference to it is two changes, with an invalid fragment
 * between them.
 */

/** Levels in the editor: the root, a fragment, its fields, a parameter, then its fields. */
const ROOT = 0
const FRAGMENT = 1
const FIELD = 2
const PARAMETER = 3
const PARAMETER_FIELD = 4

const FRAGMENT_FIELDS = ['expression', 'parameters', 'listing', 'metadata']
const PARAMETER_FIELDS = ['type', 'required', 'default', 'constraints']

/**
 * One parameter, used in the expression, with a default so the fragment
 * runs without arguments. The listing is what the expression editor shows
 * it as.
 */
const newFragment = (name: string): FragmentDefinition => ({
  expression: { $plus: ['Hello, ', '$params.name', '!'] },
  parameters: { name: { type: 'string', default: 'World' } },
  listing: {
    displayName: name,
    description: 'Greets someone by name',
    parameterDescriptions: { name: 'Who to greet' },
  },
})

const NEW_FIELDS: Record<string, unknown> = {
  expression: null,
  parameters: {},
  listing: {},
  metadata: {},
}

const NEW_PARAMETER_FIELDS: Record<string, unknown> = {
  type: 'string',
  required: false,
  constraints: {},
}

/** Whether a path is inside a fragment's `parameters`: [name, 'parameters', ...] */
const inParameters = (path: (string | number)[]) => path[1] === 'parameters'

const newKeyOptions: NewKeyOptionsFunction = ({ level, path, value }) => {
  const taken = Object.keys(value as object)
  if (level === FRAGMENT) return FRAGMENT_FIELDS.filter((key) => !taken.includes(key))
  if (level === PARAMETER && inParameters(path))
    return PARAMETER_FIELDS.filter((key) => !taken.includes(key))
  return null
}

const defaultValue: DefaultValueFunction = ({ level, path, value }, newKey) => {
  if (newKey === undefined) return null
  if (level === ROOT) return newFragment(newKey)
  if (level === FRAGMENT) return NEW_FIELDS[newKey] ?? null
  if (level === FIELD && inParameters(path)) return { type: 'string' }
  if (level === PARAMETER && inParameters(path)) {
    // A default of the parameter's declared type
    const { type } = value as { type?: unknown }
    if (newKey === 'default')
      return typeof type === 'string' || isCollection(type)
        ? startingValueFor(type as ExpectedType)
        : null
    return NEW_PARAMETER_FIELDS[newKey] ?? null
  }
  return null
}

const allowTypeSelection: TypeFilterFunction = ({ level, key, path }) => {
  if (level < FIELD) return false
  if (level === FIELD) return key === 'expression'
  if (level === PARAMETER && inParameters(path)) return false
  if (level === PARAMETER_FIELD && inParameters(path)) {
    // A type is a name, a list of names, or `{ literal: [...] }`
    if (key === 'type') return ['string', 'array', 'object']
    if (key === 'required') return ['boolean']
    if (key === 'default') return true
    return false
  }
  return true
}

export const fragmentsRestrictions = { newKeyOptions, defaultValue, allowTypeSelection }
