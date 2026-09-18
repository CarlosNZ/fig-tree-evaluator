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
pnpm size                 # re-print the bundle-size report for the existing build/
pnpm compile              # tsc only (typecheck + emit, no bundling)
pnpm generate             # regenerate v2-src/operators/operatorAliases.ts (v2-only tooling)
pnpm getVersion           # regenerate src/version.ts from package.json
pnpm dev [name]           # run src/dev/<name>.ts (default: the gitignored playground); `pnpm dev list` shows them
pnpm dev phase4_showcase  # the per-phase showcase: a range of expressions with their printed results
```

There is no watch/dev-server — this is a library. Note pnpm does not run implicit pre/post hooks: `build` chains `getVersion` explicitly.

`pnpm build` ends with a size report (minified / gzip / brotli / types, plus a per-module breakdown) from `codegen/bundleSize.mjs`. **At the close of each v3 phase, record the numbers in the bundle-size table in [docs-dev/v3-specs/v3-implementation-plan.md](docs-dev/v3-specs/v3-implementation-plan.md)** — working rule 6 there. The build is also a CI step, so it has to stay green even while the engine is incomplete.

Every PR that can move the bundle gets a size-diff comment automatically (`.github/workflows/pr-bundle-size.yml`): it builds both sides and posts one sticky comment rendered by `codegen/formatSizeDiff.mjs`. Both sides are measured by the PR's own copy of `codegen/bundleSize.mjs --json`, so the PR comment and the local report are the same measurement by construction — change what a size means in that one file and everything follows.

The package is **ESM-only** (`"type": "module"`, single `build/index.js` bundle — packaging ruling, docs-dev/v3-specs/v3-packaging.md). The repo config files are ESM accordingly (jest configs and `.prettierrc.js` use `export default`).

The demo/playground is no longer part of this repo. README references to a `demo/` folder and `yarn demo`/`yarn setup` are stale — the interactive editor moved to the separate [fig-tree-editor-react](https://github.com/CarlosNZ/fig-tree-editor-react) package (a custom editor built on top of [json-edit-react](https://github.com/CarlosNZ/json-edit-react)). For local experimentation here, use `pnpm dev` against `src/dev/playground.ts`, and `pnpm dev phase<N>_showcase` to see a phase's features run (one showcase file per phase, written at the phase's close).

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

**v3 (the live `src/`):** an operator is one flat `defineOperator()` literal — metadata (`name`, `alias`, `description`, `parameters` with types / null policies / delivery modes / constraints, `positionalParams`, `returns`), an optional `validate` hook over literal parameter values, and the `evaluate` body, whose `params` type is inferred from the declarations. Definitions live grouped by batch in `src/operators/` (`math.ts`, `comparison.ts`, `string.ts`, `array.ts`, `convert.ts`) and are listed in canonical-list order in `src/operators/index.ts` as `coreOperators`. The engine owns type checks, null policy, truthiness, defaults, the result boundary and `fallback`, so a body contains only its own logic and throws `OperatorFailure` for structured failures. Use [plus](src/operators/math.ts) or [convert](src/operators/convert.ts) as templates; the contract is docs-dev/v3-specs/v3-operator-contract.md. To add an operator: write the definition, add it to `coreOperators`, write its tests (`test/operators-<group>.test.ts`) and its README entry. There is no alias table to regenerate and no `types.ts` list to extend.

**v2 (the frozen `/v2-src`, reference only):** every operator was a folder of three files — `data.ts` (metadata + `propertyAliases`), `operator.ts` (`evaluate` + `parseChildren`), `index.ts` — plus an entry in `src/types.ts` and a regenerated alias map. That layout is never edited; the converter (Phase 15) mines it as data.

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
