/**
 * The canonical-v2 checker ("Stage 1: normalize" in
 * docs-dev/v3-specs/v3-converter.md): every way a tree falls short of
 * canonical v2, walking only where v2 evaluated. It restates the definition
 * rather than sharing the normalizer's walk, so the normalizer is not checked
 * against itself.
 *
 * Canonical v2 has four exceptions, each a shape v2 read in a way no
 * canonical spelling says (ruled at Phase 15.1): a fragment call's `type`, a
 * computed `type` on SQL, MATCH branches on the node beside a computed
 * `branches`, and call-node arguments beside a computed `parameters`.
 */
import type { V2Options } from '../../src/migrationTypes'
import { V2_BEHAVIOUR } from '../../src/migrate/v2/behaviour'
import { V2_CHILDREN } from '../../src/migrate/v2/children'
import { v2OperatorFor } from '../../src/migrate/v2/names'
import { V2_PARAMETERS, type V2Operator } from '../../src/migrate/v2/operators.generated'

type Path = (string | number)[]
type PlainObject = Record<string, unknown>

const MODIFIERS = ['fallback', 'useCache', 'outputType']

const isPlainObject = (value: unknown): value is PlainObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isAlias = (key: string) => /^\$.+/.test(key)
const isNode = (value: PlainObject) =>
  Object.hasOwn(value, 'operator') || Object.hasOwn(value, 'fragment')
// A value v2 worked out at evaluation: a node, a container, or an alias
const isComputed = (value: unknown) =>
  typeof value === 'object' ? value !== null : typeof value === 'string' && isAlias(value)

export const canonicalViolations = (expression: unknown, options: V2Options = {}): string[] => {
  const violations = new Set<string>()
  const report = (path: Path, problem: string) => {
    violations.add(`${JSON.stringify(path)}: ${problem}`)
  }

  const fragments = options.fragments ?? {}
  const { functions = {} } = options
  const functionNames = new Set(Array.isArray(functions) ? functions : Object.keys(functions))
  const resolves = (name: string) =>
    v2OperatorFor(name) !== undefined || Object.hasOwn(fragments, name) || functionNames.has(name)

  const value = (input: unknown, path: Path): void => {
    if (Array.isArray(input)) return input.forEach((element, i) => value(element, [...path, i]))
    if (!isPlainObject(input)) return
    if (Object.hasOwn(input, 'fragment')) return call(input, path)
    if (Object.hasOwn(input, 'operator')) return node(input, path)
    if (!options.noShorthand)
      for (const key of Object.keys(input))
        if (isAlias(key) && resolves(key.slice(1))) report([...path, key], 'shorthand')
    if (options.evaluateFullObject)
      for (const [key, element] of Object.entries(input)) value(element, [...path, key])
  }

  const node = (input: PlainObject, path: Path): void => {
    const { operator } = input
    if (typeof operator === 'string' && functionNames.has(operator))
      return report(path, `a call on the function ${operator} not in the explicit form`)
    const resolved = typeof operator === 'string' ? v2OperatorFor(operator) : undefined
    // An unknown operator is left as written, and so is a computed
    // `children` that cannot be split
    if (resolved === undefined) return
    const mapping = V2_CHILDREN[resolved]
    const into = typeof mapping !== 'function' && 'into' in mapping
    if (Object.hasOwn(input, 'children') && !Array.isArray(input.children) && !into) return

    if (operator !== resolved) report(path, `the operator named ${String(operator)}`)
    if (Object.hasOwn(input, 'children')) report([...path, 'children'], '`children`')

    const declared = V2_PARAMETERS[resolved]
    const names = declared.map(({ name }) => name)
    const aliases = declared.flatMap((parameter) => parameter.aliases)
    for (const key of Object.keys(input))
      if (aliases.includes(key)) report([...path, key], 'a property alias')

    const keepsType = resolved === 'PLUS' || (resolved === 'SQL' && isComputed(input.type))
    if (Object.hasOwn(input, 'type') && !keepsType) report([...path, 'type'], '`type`')

    const known = ['operator', ...names, ...MODIFIERS, ...(keepsType ? ['type'] : [])]
    const extra = Object.keys(input).filter((key) => !known.includes(key) && !isAlias(key))
    const branches = input.branches
    const computedBranches =
      resolved === 'MATCH' &&
      branches !== undefined &&
      branches !== null &&
      !Array.isArray(branches) &&
      (!isPlainObject(branches) || Object.hasOwn(branches, 'operator'))
    if (resolved === 'MATCH' && !computedBranches)
      for (const key of extra) report([...path, key], 'a MATCH branch outside `branches`')

    for (const [key, element] of Object.entries(input)) {
      const at = [...path, key]
      if (key === 'operator') continue
      if (resolved === 'MATCH' && key === 'branches') matchBranches(element, at)
      else if (known.includes(key) || isAlias(key)) {
        value(element, at)
        if (V2_BEHAVIOUR[resolved]?.evaluatesContents?.includes(key))
          contents(resolved, element, at)
      } else if (computedBranches) value(element, at)
    }
  }

  // The values of an object that an operator evaluated itself
  const contents = (operator: V2Operator, input: unknown, path: Path) => {
    if (operator === 'BUILD_OBJECT') {
      if (!Array.isArray(input) || !input.every(isPlainObject)) return
      input.forEach((element, i) => {
        if (isNode(element)) return
        for (const key of ['key', 'value'])
          if (Object.hasOwn(element, key)) value(element[key], [...path, i, key])
      })
    } else if (isPlainObject(input) && !isNode(input))
      for (const [key, element] of Object.entries(input)) value(element, [...path, key])
  }

  // MATCH evaluated its `branches` only when it was an operator node, and
  // otherwise the branch that matched
  const matchBranches = (input: unknown, path: Path) => {
    if (Array.isArray(input)) value(input, path)
    else if (isPlainObject(input)) {
      if (Object.hasOwn(input, 'operator')) value(input, path)
      else for (const [key, element] of Object.entries(input)) value(element, [...path, key])
    }
  }

  const call = (input: PlainObject, path: Path) => {
    value(input.fragment, [...path, 'fragment'])
    if (!Object.hasOwn(input, 'parameters')) report(path, 'a fragment call with no `parameters`')
    const { parameters } = input
    if (isPlainObject(parameters) && !isNode(parameters)) {
      for (const [key, element] of Object.entries(parameters))
        value(element, [...path, 'parameters', key])
      for (const key of Object.keys(input))
        if (isAlias(key)) report([...path, key], 'a fragment argument outside `parameters`')
    } else value(parameters, [...path, 'parameters'])
    for (const key of MODIFIERS) if (Object.hasOwn(input, key)) value(input[key], [...path, key])
  }

  value(expression, [])
  return [...violations]
}
