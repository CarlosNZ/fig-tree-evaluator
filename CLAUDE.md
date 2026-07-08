# CLAUDE.md

Guidance for working in this repo. For end-user/API documentation, see [README.md](README.md) — it is the authoritative reference for every operator, option, and feature. This file focuses on the things a contributor needs that aren't obvious from the README.

## What this is

`fig-tree-evaluator` is a published npm library (no app, no server) that evaluates JSON-structured expression trees — a sandboxed way to store dynamic logic in config files without executing arbitrary code. A "node" is an operator (`+`, `?`, `GET`, etc.) with parameters that are themselves nodes, evaluated recursively and asynchronously.

Entry point and public API surface: [src/index.ts](src/index.ts). The main class is `FigTreeEvaluator` in [src/FigTreeEvaluator.ts](src/FigTreeEvaluator.ts); the recursive engine is [src/evaluate.ts](src/evaluate.ts).

## Commands

The package manager is **pnpm** (version pinned in `package.json#packageManager`; migrated from yarn classic July 2026 — there is no yarn.lock). Scripts run TypeScript via **tsx** (ts-node is gone). Node floor is 22 (`engines`).

```bash
pnpm test                 # Jest, v3 suite only (see testing gotchas below)
pnpm test <substring>     # run test files matching substring, e.g. `pnpm test string`
pnpm test:v2              # frozen v2 corpus (test/V2) against /v2-src — on demand, never CI
pnpm lint                 # eslint (flat config, eslint.config.mjs)
pnpm build                # getVersion + clean + rollup ESM bundle + .d.ts into build/
pnpm compile              # tsc only (typecheck + emit, no bundling)
pnpm generate             # regenerate v2-src/operators/operatorAliases.ts (v2-only tooling)
pnpm getVersion           # regenerate src/version.ts from package.json
pnpm dev                  # run src/dev/playground.ts for ad-hoc experimentation
```

There is no watch/dev-server — this is a library. Note pnpm does not run implicit pre/post hooks: `build` chains `getVersion` explicitly.

The package is **ESM-only** (`"type": "module"`, single `build/index.js` bundle — packaging ruling, docs-dev/v3-specs/v3-packaging.md). The repo config files are ESM accordingly (jest configs and `.prettierrc.js` use `export default`).

The demo/playground is no longer part of this repo. README references to a `demo/` folder and `yarn demo`/`yarn setup` are stale — the interactive editor moved to the separate [fig-tree-editor-react](https://github.com/CarlosNZ/fig-tree-editor-react) package (a custom editor built on top of [json-edit-react](https://github.com/CarlosNZ/json-edit-react)). For local experimentation here, use `pnpm dev` against `src/dev/playground.ts`.

## Architecture

```
src/
  index.ts              # public exports — anything consumers can import
  FigTreeEvaluator.ts   # the class: options handling, cache, operator registry
  evaluate.ts           # recursive evaluator core (evaluatorFunction, evaluateArray, etc.)
  typeCheck.ts          # runtime type checking of operator inputs
  shorthandSyntax.ts    # pre-processes $-prefixed shorthand into full nodes
  helpers.ts            # node-type guards, name standardisation, option merging
  cache.ts              # per-instance memoization store
  httpClients.ts        # AxiosClient / FetchClient wrappers for GET/POST/GraphQL
  databaseConnections.ts# SQLNodePostgres / SQLite wrappers for the SQL operator
  FigTreeError.ts       # FigTreeError class
  types.ts              # shared types
  operators/            # one folder per operator (see below)
  convert/              # V1→V2, to/from shorthand — NOT used by the package itself
  dev/                  # playground scratch space
```

### The operator pattern (most common change)

Every operator lives in `src/operators/<NAME>/` (e.g. `AND`, `OBJECT_PROPERTIES`) and is exactly three files:

- **`data.ts`** — metadata: `description`, `aliases`, and a `parameters` array (`OperatorParameterMetadata[]`). Exports `propertyAliases` (built via `getPropertyAliases`) and the `operatorData` default export. This metadata drives both runtime type-checking and the public `getOperators()` introspection method.
- **`operator.ts`** — the logic: an `evaluate` method, an optional `parseChildren` method (maps a positional `children` array onto named properties), and the assembled `OperatorObject`.
- **`index.ts`** — re-exports the operator object under its canonical name.

Use an existing simple operator like [AND](src/operators/AND/operator.ts) as the template. To **add an operator**:
1. Create the three files in a new `src/operators/<NAME>/` folder.
2. Add `export * from './<NAME>'` to [src/operators/index.ts](src/operators/index.ts).
3. Add the canonical name to the `Operators` list in [src/types.ts](src/types.ts).
4. Run `pnpm generate` to rebuild the alias map.
5. Add a numbered test file in `test/` and document the operator in README.md.

### Generated files — do not hand-edit

- **`src/operators/operatorAliases.ts`** — built by `codegen/buildOperatorAliasReference.ts`. Edit aliases in the operator's `data.ts`, then run `pnpm generate`.
- **`src/version.ts`** — built from `package.json` by `codegen/getVersion.ts` (run `pnpm getVersion`).

### Things easy to get wrong

- The `convert/` folder and several extra exports in `index.ts` exist only for the external [fig-tree-editor-react](https://github.com/CarlosNZ/fig-tree-editor-react) editor (the package that now hosts the demo/playground) — they are not part of the evaluation path. Don't assume an export is "internal-only."
- HTTP and SQL clients are deliberately **not** bundled (keeps bundle size down); they're passed in by the consumer via options. Keep it that way.
- `src/dev/playground.ts` is gitignored (copied from `playground_example.ts` on first `pnpm dev`) — never commit it.

## Code style

- Prettier (`.prettierrc.js`): **no semicolons**, single quotes, 100-char width, 2-space indent, `trailingComma: 'es5'`. Match this exactly.
- Comments wrap at **80 chars** (code stays at Prettier's 100). Enforced by ESLint: `//` comments via `comment-length/limit-single-line-comments` (auto-fixable — `pnpm lint --fix` reflows them), block-comment lines via `max-len` (wrap by hand). The plugin's multi-line rule is deliberately not used — it corrupts non-JSDoc `/* … */` blocks.
- TypeScript throughout; ESLint with `@typescript-eslint/recommended`.
- Operators' `evaluate` methods are `async`. Use `evaluateArray`/`evaluatorFunction` from `evaluate.ts` to recurse into child nodes rather than calling operators directly.

## Testing

Jest via `ts-jest`. Tests live in `test/` as numbered files (`1_simpleValues.test.ts` … `26_convert.test.ts`); they import the evaluator through [test/evaluator.ts](test/evaluator.ts), which points at `../src` (toggle the commented line there to test the built package instead).

Two suites need external resources:
- **HTTP operators** (GET/POST/GraphQL) require an internet connection.
- **SQL operators** require a local Postgres with the [Northwind](https://github.com/pthom/northwind_psql) database installed.

When neither is available, scope your run with `pnpm test <name>` to the relevant files.
