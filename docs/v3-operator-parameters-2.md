# FigTree v3 — operator parameter specification, Part 2 (batches 5–8)

*Continuation of [v3-operator-parameters.md](v3-operator-parameters.md) (Part 1), split so working sessions load only the live batches. Everything normative carries over unchanged: the pass protocol and status markers (Part 1 preamble), the cross-cutting conventions and the disruption gradient (Part 1 § Cross-cutting conventions), the contract-requirements ledger (Part 1 — **one table, one home**: new entries append there, numbering continuing from #11), the status overview (Part 1's table covers both parts), and the review register ([v3-cases-for-review.md](v3-cases-for-review.md) — one register for both parts; new case rows continue from #22).*

**Working-session loading guide** — the reason this file exists: read this file and the review register in full, plus Part 1's head (preamble through the end of the contract-requirements ledger); consult Part 1's finished passes (batches 1–4) by section on demand — they are cross-referenced from here by operator name and case number, never restated.

## Constraints carried into the remaining batches

Collected from v3-api.md and the Part 1 passes, so nothing silently drops (migrated verbatim from Part 1's tail):

- **Batch 5**: iterator parameter names `input` / `each` / `as` (locked in References); `every: []` → `true`, `some: []` → `false` (recorded in the `and`/`or` pass); `find` no-match → `null` (composes with `firstOf`/`get` defaults, and must agree with `regex` `extract`'s no-match → `null` — case #21); `length` on strings *and* arrays — on strings it counts **code points**, agreeing with the batch-4 unit ruling (recorded at `split`); evaluate-with-bindings ledger entry.
- **Batch 6**: `get` — exotic-key path grammar (quoted bracket segments, deferred from References), `default` parameter with the null opt-out (`type: […, 'null']` — the known case from the Type area), evaluation-context access ledger entry; `buildObject` — role narrowed to dynamic keys, null-valued entries: keep vs drop key (flagged in Type area).
- **Batch 7**: `convert` — semantics fully agreed in the Type area; the pass only records the parameter table (`value`, `to`) and positional form. `literal` — no parameters; confirm the node-grammar treatment covers it.
- **Batch 8**: `http` — per-request `timeout` (constraint from Node grammar fallback rule 3), null `body` (no body vs JSON `null` payload) and null `query` values (omit vs `?x=null`), both flagged in the Type area; `sql` — bind values null → SQL `NULL` (agreed), per-request timeout likewise; abort-signal threading and `useCache: true` defaults; `graphQL` on the `http` core.

---

## Batch 5 — Arrays & iteration — *(not yet drafted)*

`length`, `map`, `filter`, `find`, `some`, `every`.

## Batch 6 — Data & objects — *(not yet drafted)*

`get`, `buildObject`.

## Batch 7 — Special — *(not yet drafted)*

`literal`, `convert`.

## Batch 8 — I/O — *(not yet drafted)*

`http`, `graphQL`, `sql`.
