/**
 * Small generic helpers shared across modules. Anything here should be
 * domain-free — no knowledge of nodes, operators, or evaluation.
 */

/** A plain object: an object that is neither null nor an array. */
export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
