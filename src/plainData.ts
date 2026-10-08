/**
 * The plain-data test, in a module of its own because `./format` shares it
 * with the engine: whatever `./format` imports lands in the chunk the two
 * share (src/format/), and the engine's other small helpers, in
 * src/utils.ts, have no business there.
 */

/**
 * A plain *data* object: prototype is `Object.prototype` or `null`. Class
 * instances, `Date`s, `Map`s etc. fail this — the compiler treats them as
 * opaque constants ("Non-plain-object values" in docs-dev/v3-specs/v3-api.md).
 *
 * The compiler iterates what passes this with `for…in`, unguarded, which
 * visits only own keys provided `Object.prototype` carries no enumerable
 * property ("The engine assumes an unpolluted `Object.prototype`" in
 * docs-dev/v3-specs/v3-implementation-notes.md).
 */
export const isPlainDataObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}
