/**
 * Walking a list of operator entries as the `operators` option holds them
 * ("Operator registration" in the Options area of
 * docs-dev/v3-specs/v3-api.md): definitions, or arrays of definitions
 * nested one level. Each entry must carry the brand.
 *
 * Shared by `buildRegistry()` and `operatorSet()`, which take the same
 * input and so report the same problems in the same words.
 *
 * Internal — not barrel surface.
 */
import { ErrorCodes } from './errorCodes'
import { isValidatedOperator, type ValidatedOperatorDefinition } from './operatorDefinition'

type Path = (string | number)[]

type AddIssue = (code: string, message: string, path: Path) => void

/**
 * Where a list of entries sits: `prefix` starts each issue's path, and
 * `name` is what messages call the list, as in `operators[1][0]`.
 */
export interface EntryList {
  prefix: Path
  name: string
}

/**
 * Whether one entry is a branded definition, reporting it if not: an
 * uncalled factory gets its own message. `location` names the entry in
 * the message, as in `operators[1][0]`.
 */
export const checkOperatorEntry = (
  entry: unknown,
  path: Path,
  location: string,
  addIssue: AddIssue
): entry is ValidatedOperatorDefinition => {
  if (typeof entry === 'function') {
    addIssue(
      ErrorCodes.invalidOptions,
      `${location} is a function — factories must be called: httpOperators(client)`,
      path
    )
    return false
  }
  if (!isValidatedOperator(entry)) {
    addIssue(
      ErrorCodes.invalidOptions,
      `${location} must be built with defineOperator() — a plain definition object is not accepted`,
      path
    )
    return false
  }
  return true
}

/**
 * Visit each branded definition in `entries`, in order, with its path.
 * An entry that is not one is reported instead: an uncalled factory, an
 * unbranded definition, or an array nested deeper than one level.
 * Visiting and reporting interleave, so a caller's own issues about a
 * definition land in entry order among these.
 */
export const forEachOperatorEntry = (
  entries: readonly unknown[],
  { prefix, name }: EntryList,
  addIssue: AddIssue,
  visit: (definition: ValidatedOperatorDefinition, path: Path) => void
): void => {
  const check = (entry: unknown, indices: number[]) => {
    const path = [...prefix, ...indices]
    const location = `${name}${indices.map((index) => `[${index}]`).join('')}`
    if (checkOperatorEntry(entry, path, location, addIssue)) visit(entry, path)
  }

  entries.forEach((element, i) => {
    if (Array.isArray(element)) {
      // One-level flattening only: an array inside this array must hold
      // definitions, not further arrays
      element.forEach((entry, j) => {
        if (Array.isArray(entry))
          addIssue(
            ErrorCodes.invalidOptions,
            `${name}[${i}][${j}] nests too deep — arrays are flattened one level only`,
            [...prefix, i, j]
          )
        else check(entry, [i, j])
      })
    } else {
      check(element, [i])
    }
  })
}
