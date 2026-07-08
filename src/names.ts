/**
 * The shared name-legality rule and the reservation sets ("Name legality,
 * not name style" and "The reserved-key set" in docs-dev/v3-specs/v3-api.md).
 *
 * One rule for every authored name — vars, fragment parameters, `as`
 * bindings, and fragment / custom-operator registration names: any non-empty
 * string that does not contain `.`, `[` or `]` and does not start with `$`.
 * No style is imposed (spaces, kebab-case and unicode are all legal); the
 * excluded characters keep path-drilling unambiguous and the `$` sigil's two
 * jobs clean.
 *
 * Reservation is a separate, additional check with two scopes: parameter
 * names may not use a reserved *node key*; registration names (operators,
 * aliases, fragments) additionally may not use a reference namespace, its
 * single-character alias form, or `literal`. The reference-namespace words
 * are deliberately NOT barred as parameter names — references live in string
 * value position, parameters in key position; nothing mechanically collides.
 *
 * Internal vocabulary (not barrel surface), consumed by `defineOperator()`
 * now and by the parser (vars, `as`) and fragment registration later.
 */

/**
 * The seven reserved node keys — case-sensitive, zero aliases. Reserved
 * everywhere, even where non-functional: no operator or fragment parameter
 * may use one.
 */
export const RESERVED_NODE_KEYS: ReadonlySet<string> = new Set([
  'operator',
  'fragment',
  'parameters',
  'fallback',
  'useCache',
  'vars',
  '//',
])

/**
 * Names unusable for registration (operator/fragment names and aliases): the
 * node keys above, the reference namespaces with their single-character alias
 * forms, and `literal`.
 */
export const RESERVED_REGISTRATION_NAMES: ReadonlySet<string> = new Set([
  ...RESERVED_NODE_KEYS,
  'data',
  'params',
  'element',
  'index',
  'd',
  'v',
  'p',
  'e',
  'i',
  'literal',
])

export type NameLegalityResult = { ok: true } | { ok: false; reason: string }

/** The one legality rule. Reservation is checked separately. */
export const checkNameLegality = (name: unknown): NameLegalityResult => {
  if (typeof name !== 'string') return { ok: false, reason: 'a name must be a string' }
  if (name === '') return { ok: false, reason: 'a name must be non-empty' }
  if (name.startsWith('$')) return { ok: false, reason: "a name may not start with '$'" }
  if (/[.[\]]/.test(name))
    return { ok: false, reason: "a name may not contain '.', '[' or ']'" }
  return { ok: true }
}
