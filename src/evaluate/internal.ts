/**
 * Engine-bug errors: raised where the static gate should have made a
 * branch unreachable, or where a later phase's machinery is not yet built.
 * Deliberately a plain Error, never a FigTreeError — these are not
 * expression failures and no fallback should catch them.
 */
export const internalError = (message: string): Error => new Error(`[fig-tree internal] ${message}`)
