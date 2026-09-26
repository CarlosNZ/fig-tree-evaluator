/**
 * `get`'s positional parameters, stated apart from its definition
 * (src/operators/data.ts) because `./format` reads a `$get` payload without
 * a registry ("`toGet` and `toReference`" in
 * docs-dev/v3-specs/v3-format.md). Importing the definition itself would
 * pull the operator module into the chunk the subpath shares with the root.
 */
export const GET_POSITIONAL = ['path', 'missingPathDefault'] as const
