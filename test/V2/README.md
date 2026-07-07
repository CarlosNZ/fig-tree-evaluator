# Frozen v2 corpus

This folder is the **immutable record of v2 behaviour** — the current v2 test suite copied verbatim at the start of the v3 rebuild (implementation plan [Phase 0.1](../../docs/v3-implementation-plan.md)). It is our most valuable conversion asset: a large body of real expression trees paired with known-correct results, and the oracle for the Phase-15 V2→V3 converter differential.

> **This is the pristine copy — do not edit it.** For the editable working set you hand-migrate from, use [`test/v2-working/`](../v2-working/) (byte-identical at the freeze; annotate/delete there as you go). Keeping this copy clean is what lets the Phase-15 differential always compare against an untouched v2 record.

## Rules

- **Never edit anything in this folder.** Expected-output changes for new v3 rules go on the differential/converter tests (Phase 15), never on this historical record ([testing strategy](../../docs/v3-testing-strategy.md), guardrails; implementation plan working rule 4).
- **It never runs against v3 source.** It runs only against the frozen v2 engine in [`/v2-src`](../../v2-src), on demand — not in v3 CI.
- Files here are **byte-identical to their v2 originals.** They still import from `../src`, `../codegen`, `./database/…` and `./massiveQuery.json` exactly as before the freeze. Rather than touch the record, [`jest.v2.config.js`](../../jest.v2.config.js) remaps those specifiers (`../src` → `/v2-src`; shared assets, kept at the `test/` top level, back to their real locations). ts-jest runs transpile-only here, so TypeScript resolution never has to agree with the runtime mapping.

## Running it

```bash
yarn test:v2                 # whole corpus against /v2-src
yarn test:v2 4_plus          # files matching a substring
```

HTTP tests run offline against the `axios` / `node-fetch` mocks in [`test/__mocks__`](../__mocks__). SQL tests (`12_database`) and the `massiveQuery` case in `17_complexExpressions` need a local [Northwind](https://github.com/pthom/northwind_psql) Postgres and are skipped/failing without it — environment-gated, never blocking.

## Pure expression-tree vs infrastructure

Only **pure expression-tree** tests flow through the Phase-15 converter differential (`evaluate(convert(v2Tree))` vs the recorded v2 value). Infrastructure tests — options/registry, caching, I/O wiring, API methods, introspection, error-throwing, the converter's own tests — validate machinery that has no v2-tree-to-value equivalent, so they are hand-migrated to v3 directly instead.

This is a **first-pass tag**, to be validated in Phase 15 (writing the converter is expected to reclassify a few borderline files).

| File | Kind | Flows through differential? | Notes |
|---|---|---|---|
| `1_simpleValues` | expression-tree | ✅ | |
| `2_logicalOperators` | expression-tree | ✅ | |
| `3_equality` | expression-tree | ✅ | |
| `4_plus` | expression-tree | ✅ | |
| `5_otherArithmetic` | expression-tree | ✅ | |
| `6_conditional` | expression-tree | ✅ | |
| `7_regex` | expression-tree | ✅ | |
| `8_objectProperties` | expression-tree | ✅ | |
| `9_stringSubstitution` | expression-tree | ✅ | |
| `11_split` | expression-tree | ✅ | |
| `14_buildObject` | expression-tree | ✅ | duplicate-key semantics may diverge (v3 warns) |
| `16_outputConversion` | expression-tree | ✅ | |
| `19_aliasNodes` | expression-tree | ✅ | v3 reshapes alias/reference handling — expect catalogued divergences |
| `20_match` | expression-tree | ✅ | |
| `22_fragments` | expression-tree | ✅ | fragment *definitions* arrive via instance config, not the tree |
| `23_shorthand` | expression-tree | ✅ | converter normalises shorthand → v3 |
| `17_complexExpressions` | expression-tree | ✅ | the largest trees (Phase-16 benchmark corpus); some cases need Postgres |
| `00_utils` | infrastructure | ❌ | helper unit test (`camelCase`) |
| `0_typeCheck` | infrastructure | ❌ | `typeCheck` unit test |
| `10_API` | infrastructure | ❌ | HTTP + options/API wiring (offline via mocks) |
| `12_database` | infrastructure | ❌ | SQL wiring — needs Postgres |
| `13_customFunctions` | infrastructure | ❌ | `CUSTOM_FUNCTIONS` / `options.functions` — **deleted in v3**; non-convertible (migration wrapper recipe) |
| `15_errorsAndFallbacks` | infrastructure | ❌ | error-throwing behaviour; fallback-*value* cases overlap expression semantics |
| `18_optionHandling` | infrastructure | ❌ | options merge/handling |
| `21_evaluateWholeObject` | infrastructure | ❌ | `evaluateFullObject` API method |
| `24_cache` | infrastructure | ❌ | result caching |
| `25_metaData` | infrastructure | ❌ | `getOperators` / metadata introspection |
| `26_convert` | infrastructure | ❌ | the converter's own tests (v1→v2, shorthand round-trip) |
| `27_isFigTreeExpression` | infrastructure | ❌ | structural guard function |
