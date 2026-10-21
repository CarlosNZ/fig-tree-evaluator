/**
 * `operatorSet()` — selecting from operator sets and replacing operators by
 * name, checking every selector (docs-dev/v3-specs/v3-operator-set.md).
 *
 * The input is what the `operators` option holds, spread out; the result
 * is a new flat array of the same definitions, by reference. The options
 * apply in a fixed order: `only` keeps, `except` removes from what `only`
 * kept, and `replace` swaps each replacement in at the position of the
 * operator it names. Problems are collected and thrown together, as the
 * registry reports them, except a call whose shape cannot be read at all.
 *
 * A root export imported by nothing in the engine, so a bundle that never
 * imports it never carries it (#193).
 */
import { ErrorCodes } from './errorCodes'
import { issuesError, type Issue } from './issues'
import {
  OPERATOR_CATEGORIES,
  isValidatedOperator,
  type OperatorCategory,
  type OperatorEntry,
  type ValidatedOperatorDefinition,
} from './operatorDefinition'
import { checkOperatorEntry, forEachOperatorEntry } from './operatorEntries'
import { isPlainDataObject } from './plainData'
import { didYouMean, nearestName } from './utils'

type Path = (string | number)[]

/**
 * A canonical operator name, or a category — told apart by shape, so a
 * plugin operator named like a category is never ambiguous. A category
 * selector's `except` names operators of that category to leave out.
 */
export type OperatorSelector =
  string | { category: OperatorCategory; except?: string | readonly string[] }

export interface OperatorSetOptions {
  /** Keep just the operators these select. Without it, everything is kept. */
  only?: OperatorSelector | readonly OperatorSelector[]
  /** Remove the operators these select from what `only` kept. */
  except?: OperatorSelector | readonly OperatorSelector[]
  /** Swap each in for the operator with its `name`, at that position. */
  replace?: ValidatedOperatorDefinition | readonly ValidatedOperatorDefinition[]
}

const OPTION_KEYS = ['only', 'except', 'replace']

interface Located {
  value: unknown
  path: Path
}

/** A value that may be one item or a list, as items with their paths. */
const listOf = (value: unknown, path: Path): Located[] =>
  Array.isArray(value)
    ? value.map((item, i) => ({ value: item, path: [...path, i] }))
    : [{ value, path }]

/**
 * Select and replace operators from the input sets: the arguments before
 * the last are the input, as the `operators` option holds it, and the last
 * is the options object.
 */
export const operatorSet = (
  ...args: [...operators: OperatorEntry[], options: OperatorSetOptions]
): ValidatedOperatorDefinition[] => {
  const issues: Issue[] = []
  const addIssue = (
    code: string,
    message: string,
    path: Path,
    extras?: { operator?: string; suggestion?: string }
  ) => {
    issues.push({ severity: 'error', code, message, path, ...extras })
  }
  /** A call whose shape cannot be read: nothing after it means anything. */
  const refuse = (message: string, path: Path): never => {
    addIssue(ErrorCodes.invalidOptions, message, path)
    throw issuesError(ErrorCodes.invalidOptions, issues)
  }

  // ── The call's shape ─────────────────────────────────────────────────
  const last = args.length - 1
  const options: unknown = args[last]
  const noInput = 'operatorSet() needs at least one operator before its options'
  if (args.length === 0) refuse(noInput, [])
  if (
    isPlainDataObject(options) &&
    !isValidatedOperator(options) &&
    'name' in options &&
    'evaluate' in options
  )
    refuse(
      "the last argument has 'name' and 'evaluate' — if it is an operator, build it with defineOperator(); the options object comes last",
      [last]
    )
  if (!isPlainDataObject(options) || isValidatedOperator(options))
    refuse('the last argument must be the options object', [last])
  if (args.length === 1) refuse(noInput, [])
  const { only, except, replace } = options as Record<string, unknown>

  for (const key of Object.keys(options as object))
    if (!OPTION_KEYS.includes(key))
      addIssue(
        ErrorCodes.invalidOptions,
        `unknown option '${key}' — the options are only, except and replace`,
        [key]
      )

  // ── The input ────────────────────────────────────────────────────────
  const order: ValidatedOperatorDefinition[] = []
  const byName = new Map<string, ValidatedOperatorDefinition>()
  const aliasToName = new Map<string, string>()
  const byCategory = new Map<string, string[]>()
  forEachOperatorEntry(
    args.slice(0, last),
    { prefix: [], name: 'arguments' },
    addIssue,
    (definition, path) => {
      const { name, alias, category } = definition
      if (byName.has(name)) {
        addIssue(
          ErrorCodes.duplicateOperator,
          `two operators named '${name}' in the input — to swap one for the other, pass it as 'replace'`,
          path,
          { operator: name }
        )
        return
      }
      order.push(definition)
      byName.set(name, definition)
      if (alias !== undefined) aliasToName.set(alias, name)
      const members = byCategory.get(category)
      if (members === undefined) byCategory.set(category, [name])
      else members.push(name)
    }
  )

  // ── Selectors ────────────────────────────────────────────────────────
  // Each resolves to the names it selects, or to undefined once it has
  // reported a problem

  const resolveName = (name: string, path: Path): string | undefined => {
    if (byName.has(name)) return name
    const canonical = aliasToName.get(name)
    if (canonical !== undefined) {
      addIssue(
        ErrorCodes.invalidOptions,
        `selectors take canonical names — use '${canonical}', not its alias '${name}'`,
        path,
        { operator: canonical, suggestion: canonical }
      )
      return undefined
    }
    const suggestion = nearestName(name, byName.keys())
    addIssue(
      ErrorCodes.unknownOperator,
      `'${name}' names no operator in the input${didYouMean(suggestion)}`,
      path,
      suggestion === undefined ? undefined : { suggestion }
    )
    return undefined
  }

  const badShape = (path: Path) =>
    addIssue(
      ErrorCodes.invalidOptions,
      'a selector is an operator name or { category, except? }',
      path
    )

  const resolveCategory = (
    selector: Record<string, unknown>,
    path: Path
  ): Set<string> | undefined => {
    const category = selector.category as string
    if (!(OPERATOR_CATEGORIES as readonly string[]).includes(category)) {
      const suggestion = nearestName(category, OPERATOR_CATEGORIES)
      addIssue(
        ErrorCodes.invalidOptions,
        `'${category}' is not a category${didYouMean(suggestion)}`,
        [...path, 'category'],
        suggestion === undefined ? undefined : { suggestion }
      )
      return undefined
    }
    const members = byCategory.get(category)
    if (members === undefined) {
      addIssue(
        ErrorCodes.invalidOptions,
        `no operator in the input has category '${category}'`,
        path
      )
      return undefined
    }

    const excepted: string[] = []
    let exceptOk = true
    if (selector.except !== undefined)
      for (const { value, path: namePath } of listOf(selector.except, [...path, 'except'])) {
        if (typeof value !== 'string') {
          badShape(namePath)
          exceptOk = false
          continue
        }
        const name = resolveName(value, namePath)
        if (name === undefined) {
          exceptOk = false
          continue
        }
        if (byName.get(name)?.category !== category) {
          addIssue(
            ErrorCodes.invalidOptions,
            `'${name}' is not in category '${category}'`,
            namePath,
            { operator: name }
          )
          exceptOk = false
          continue
        }
        excepted.push(name)
      }
    if (!exceptOk) return undefined

    const selected = new Set(members.filter((name) => !excepted.includes(name)))
    if (selected.size === 0) {
      const names = excepted.map((name) => `'${name}'`).join(', ')
      addIssue(
        ErrorCodes.invalidOptions,
        `{ category: '${category}', except: [${names}] } selects nothing`,
        path
      )
      return undefined
    }
    return selected
  }

  const resolveSelector = (selector: unknown, path: Path): Set<string> | undefined => {
    if (typeof selector === 'string') {
      const name = resolveName(selector, path)
      return name === undefined ? undefined : new Set([name])
    }
    if (
      !isPlainDataObject(selector) ||
      typeof selector.category !== 'string' ||
      Object.keys(selector).some((key) => key !== 'category' && key !== 'except')
    ) {
      badShape(path)
      return undefined
    }
    return resolveCategory(selector, path)
  }

  /** An option's selectors, resolved; undefined when the option is absent. */
  const resolveOption = (value: unknown, key: string) =>
    value === undefined
      ? undefined
      : listOf(value, [key]).map(({ value: selector, path }) => ({
          selector,
          path,
          names: resolveSelector(selector, path),
        }))

  const onlySelections = resolveOption(only, 'only')
  const exceptSelections = resolveOption(except, 'except')
  // A selector that reported a problem leaves the selection incomplete, so
  // the checks that read the selection are skipped: they would only report
  // the same mistake again
  const onlySound = onlySelections?.every(({ names }) => names !== undefined) ?? true
  const sound = onlySound && (exceptSelections?.every(({ names }) => names !== undefined) ?? true)

  // ── Selecting ────────────────────────────────────────────────────────
  const kept =
    onlySelections === undefined
      ? new Set(byName.keys())
      : new Set(onlySelections.flatMap(({ names }) => [...(names ?? [])]))
  const removed = new Set<string>()
  for (const { selector, path, names } of exceptSelections ?? []) {
    if (names === undefined) continue
    const hits = [...names].filter((name) => kept.has(name))
    if (hits.length === 0 && onlySelections !== undefined && onlySound) {
      addIssue(
        ErrorCodes.invalidOptions,
        typeof selector === 'string'
          ? `'${selector}' is not among the operators 'only' kept`
          : `no operator in category '${(selector as { category: string }).category}' is among the operators 'only' kept`,
        path,
        typeof selector === 'string' ? { operator: selector } : undefined
      )
      continue
    }
    for (const name of hits) removed.add(name)
  }

  // ── Replacing ────────────────────────────────────────────────────────
  const replacements = new Map<string, ValidatedOperatorDefinition>()
  if (replace !== undefined)
    for (const { value, path } of listOf(replace, ['replace'])) {
      if (Array.isArray(value)) {
        addIssue(ErrorCodes.invalidOptions, "'replace' takes definitions, not arrays of them", path)
        continue
      }
      const location = path.length > 1 ? `replace[${path[1]}]` : 'replace'
      if (!checkOperatorEntry(value, path, location, addIssue)) continue
      const { name } = value
      if (replacements.has(name)) {
        addIssue(ErrorCodes.duplicateOperator, `two replacements for '${name}'`, path, {
          operator: name,
        })
        continue
      }
      replacements.set(name, value)
      if (!byName.has(name)) {
        const suggestion = nearestName(name, byName.keys())
        addIssue(
          ErrorCodes.unknownOperator,
          `'${name}' names no operator in the input — to add a new operator, put it in the input`,
          path,
          suggestion === undefined ? undefined : { suggestion }
        )
        continue
      }
      if (sound && (!kept.has(name) || removed.has(name)))
        addIssue(
          ErrorCodes.invalidOptions,
          `'${name}' is replaced but also removed by '${kept.has(name) ? 'except' : 'only'}'`,
          path,
          { operator: name }
        )
    }

  // ── The result ───────────────────────────────────────────────────────
  const result = order
    .filter(({ name }) => kept.has(name) && !removed.has(name))
    .map((definition) => replacements.get(definition.name) ?? definition)
  if (issues.length === 0 && result.length === 0)
    addIssue(ErrorCodes.invalidOptions, 'the selection leaves no operators', [])

  if (issues.length > 0) throw issuesError(ErrorCodes.invalidOptions, issues, issues[0].operator)
  return result
}
