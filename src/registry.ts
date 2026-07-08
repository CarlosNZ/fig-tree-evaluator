/**
 * Registry assembly — the cross-registry half of registration ("Operator
 * registration" and "operatorDefaults" in the Options area of
 * docs-dev/v3-specs/v3-api.md; naming rules 1-5 in its Operators area).
 *
 * `buildRegistry()` is a pure function of the registry-affecting options:
 * `new FigTree()` calls it at construction, and Phase 8's `updateOptions`
 * re-runs it on merged options and swaps the result atomically — one path,
 * validated identically. Fragments join the same input and the same
 * one-namespace collision domain in Phase 11.
 *
 * The brand is the entry ticket (ruled July 2026): every flattened entry
 * must be a `defineOperator()`-validated definition, trusted wholesale —
 * there is no second validation path here. Cross-registry work only:
 * one-level flattening, name/alias collision checks across the one
 * namespace ("no silent precedence" — identity duplicates included), the
 * alias map, and `operatorDefaults` resolution against operator metadata.
 *
 * Internal machinery behind `new FigTree()` — not barrel surface.
 */
import { FigTreeError } from './FigTreeError'
import { ErrorCodes } from './errorCodes'
import type { Issue } from './issues'
import { isPlainObject } from './utils'
import { checkConstraints, checkType } from './typeCheck'
import { isValidatedOperator, type ValidatedOperatorDefinition } from './operatorDefinition'

type Path = (string | number)[]

export interface RegistryEntry {
  definition: ValidatedOperatorDefinition
  /**
   * Validated instance-level defaults for this operator — parameter targets
   * plus the `fallback` / `useCache` modifier pseudo-keys, as authored.
   * Absent when `operatorDefaults` has no entry for it.
   */
  instanceDefaults?: Readonly<Record<string, unknown>>
}

export interface OperatorRegistry {
  /** Canonical name → entry; insertion order is registration order. */
  operators: Map<string, RegistryEntry>
  /** Alias → canonical name; consulted by parse-time normalization. */
  aliases: Map<string, string>
}

export interface RegistryInput {
  operators: (ValidatedOperatorDefinition | ValidatedOperatorDefinition[])[]
  operatorDefaults?: Record<string, Record<string, unknown>>
}

/** The modifier pseudo-keys an `operatorDefaults` entry may target. */
const MODIFIER_KEYS = ['fallback', 'useCache']

const throwOptionsError = (issues: Issue[]): never => {
  const [first] = issues
  const more = issues.length - 1
  const message =
    more > 0 ? `${first.message} (+ ${more} more issue${more === 1 ? '' : 's'})` : first.message
  throw new FigTreeError({
    code: ErrorCodes.invalidOptions,
    message,
    path: first.path,
    ...(first.operator !== undefined ? { operator: first.operator } : {}),
    issues,
  })
}

export const buildRegistry = (input: RegistryInput): OperatorRegistry => {
  const issues: Issue[] = []
  const addIssue = (code: string, message: string, path: Path, operator?: string) => {
    issues.push({
      severity: 'error',
      code,
      message,
      path,
      ...(operator !== undefined ? { operator } : {}),
    })
  }

  const operators = new Map<string, RegistryEntry>()
  const aliases = new Map<string, string>()
  // Every claimed invocation name (canonical or alias) → the canonical name
  // that owns it: the one-namespace collision domain
  const claimed = new Map<string, string>()

  const register = (entry: unknown, path: Path) => {
    if (typeof entry === 'function') {
      addIssue(
        ErrorCodes.invalidOptions,
        `operators[${path[1]}]${path.length > 2 ? `[${path[2]}]` : ''} is a function — factories must be called: httpOperators(client)`,
        path
      )
      return
    }
    if (!isValidatedOperator(entry)) {
      addIssue(
        ErrorCodes.invalidOptions,
        'every operators entry must be built with defineOperator() — a plain definition object is not accepted',
        path
      )
      return
    }
    const { name, alias } = entry
    const claimName = (invocationName: string) => {
      const owner = claimed.get(invocationName)
      if (owner !== undefined) {
        addIssue(
          ErrorCodes.duplicateOperator,
          `'${invocationName}' is already registered (by '${owner}') — one namespace, no silent precedence`,
          path,
          name
        )
        return false
      }
      claimed.set(invocationName, name)
      return true
    }
    const nameOk = claimName(name)
    const aliasOk = alias === undefined || claimName(alias)
    if (!nameOk || !aliasOk) return

    operators.set(name, { definition: entry })
    if (alias !== undefined) aliases.set(alias, name)
  }

  if (!Array.isArray(input.operators)) {
    addIssue(ErrorCodes.invalidOptions, "'operators' must be an array", ['operators'])
  } else {
    input.operators.forEach((element, i) => {
      if (Array.isArray(element)) {
        // One-level flattening only: an array inside this array must hold
        // definitions, not further arrays
        element.forEach((entry, j) => {
          if (Array.isArray(entry))
            addIssue(
              ErrorCodes.invalidOptions,
              "'operators' is flattened one level only — arrays may not nest deeper",
              ['operators', i, j]
            )
          else register(entry, ['operators', i, j])
        })
      } else {
        register(element, ['operators', i])
      }
    })
  }

  if (input.operatorDefaults !== undefined)
    validateOperatorDefaults(input.operatorDefaults, operators, aliases, addIssue)

  if (issues.length > 0) throwOptionsError(issues)
  return { operators, aliases }
}

const validateOperatorDefaults = (
  operatorDefaults: unknown,
  operators: Map<string, RegistryEntry>,
  aliases: Map<string, string>,
  addIssue: (code: string, message: string, path: Path, operator?: string) => void
): void => {
  if (!isPlainObject(operatorDefaults)) {
    addIssue(ErrorCodes.invalidOptions, "'operatorDefaults' must be a plain object", [
      'operatorDefaults',
    ])
    return
  }

  for (const [operatorName, defaults] of Object.entries(operatorDefaults)) {
    const path: Path = ['operatorDefaults', operatorName]
    const entry = operators.get(operatorName)
    if (entry === undefined) {
      const canonical = aliases.get(operatorName)
      if (canonical !== undefined)
        addIssue(
          ErrorCodes.invalidOptions,
          `'operatorDefaults' keys are canonical names — use '${canonical}', not its alias '${operatorName}'`,
          path,
          canonical
        )
      else
        addIssue(
          ErrorCodes.unknownOperator,
          `'${operatorName}' names no registered operator`,
          path
        )
      continue
    }
    if (!isPlainObject(defaults)) {
      addIssue(
        ErrorCodes.invalidOptions,
        `the defaults for '${operatorName}' must be a plain object`,
        path,
        operatorName
      )
      continue
    }

    let valid = true
    for (const [key, value] of Object.entries(defaults)) {
      const keyPath: Path = [...path, key]
      if (MODIFIER_KEYS.includes(key)) {
        // fallback: any constant (constancy classification is a Phase-3
        // parser concern); useCache: boolean
        if (key === 'useCache' && typeof value !== 'boolean') {
          addIssue(
            ErrorCodes.invalidOptions,
            `the 'useCache' modifier default must be a boolean`,
            keyPath,
            operatorName
          )
          valid = false
        }
        continue
      }
      const declaration = entry.definition.parameters[key]
      if (declaration === undefined) {
        addIssue(
          ErrorCodes.invalidOptions,
          `'${key}' names no declared parameter of '${operatorName}' (nor 'fallback'/'useCache')`,
          keyPath,
          operatorName
        )
        valid = false
        continue
      }
      if (declaration.required) {
        // The Q12 ban: required means on-the-node, always — an instance-wide
        // constant for a semantic core input is a preset node in disguise,
        // and presets are fragments' job
        addIssue(
          ErrorCodes.invalidOptions,
          `'${key}' is a required parameter of '${operatorName}' — operatorDefaults may only target optional parameters`,
          keyPath,
          operatorName
        )
        valid = false
        continue
      }
      const fit = checkType(value, declaration.type)
      if (!fit.ok) {
        addIssue(
          ErrorCodes.typeCheck,
          `the default for '${operatorName}.${key}' does not satisfy its declared type: expected ${fit.expected}, got ${fit.actual}`,
          keyPath,
          operatorName
        )
        valid = false
        continue
      }
      if (declaration.constraints !== undefined) {
        const constrained = checkConstraints(value, declaration.constraints)
        if (!constrained.ok) {
          addIssue(
            ErrorCodes.typeCheck,
            `the default for '${operatorName}.${key}' violates its declared constraints: expected ${constrained.expected}, got ${constrained.actual}`,
            keyPath,
            operatorName
          )
          valid = false
        }
      }
    }
    if (valid) entry.instanceDefaults = Object.freeze({ ...defaults })
  }
}

/**
 * Canonical-first, then alias — the lookup the Phase-3 parser normalizes
 * through. Case-sensitive, exact-match, no folding.
 */
export const resolveOperator = (
  registry: OperatorRegistry,
  name: string
): RegistryEntry | undefined => {
  const direct = registry.operators.get(name)
  if (direct !== undefined) return direct
  const canonical = registry.aliases.get(name)
  return canonical !== undefined ? registry.operators.get(canonical) : undefined
}
