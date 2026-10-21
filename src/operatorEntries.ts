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

/**
 * Visit each branded definition in `entries`, in order, with its path
 * under `prefix`. An entry that is not one is reported instead: an
 * uncalled factory, an unbranded definition, or an array nested deeper
 * than one level. Visiting and reporting interleave, so a caller's own
 * issues about a definition land in entry order among these.
 */
export const forEachOperatorEntry = (
  entries: readonly unknown[],
  prefix: Path,
  addIssue: (code: string, message: string, path: Path) => void,
  visit: (definition: ValidatedOperatorDefinition, path: Path) => void
): void => {
  const check = (entry: unknown, path: Path) => {
    if (typeof entry === 'function') {
      addIssue(
        ErrorCodes.invalidOptions,
        `${formatLocation(path)} is a function — factories must be called: httpOperators(client)`,
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
    visit(entry, path)
  }

  entries.forEach((element, i) => {
    if (Array.isArray(element)) {
      // One-level flattening only: an array inside this array must hold
      // definitions, not further arrays
      element.forEach((entry, j) => {
        if (Array.isArray(entry))
          addIssue(
            ErrorCodes.invalidOptions,
            "'operators' is flattened one level only — arrays may not nest deeper",
            [...prefix, i, j]
          )
        else check(entry, [...prefix, i, j])
      })
    } else {
      check(element, [...prefix, i])
    }
  })
}

/** Render a path as `operators[1][0]` for messages. */
const formatLocation = (path: Path): string =>
  path.map((seg) => (typeof seg === 'number' ? `[${seg}]` : seg)).join('')
