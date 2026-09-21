# Benchmarks: v2 against v3

The benches measure the v3 engine in `src/` against the frozen v2 engine in `/v2-src`, head to head, on the same expressions. They exist to check the performance claims the v3 specs make (the claims ledger in [docs-dev/v3-specs/v3-implementation-plan.md](../docs-dev/v3-specs/v3-implementation-plan.md), Phase 16a.2) and to give the optimisation work in [#170](https://github.com/CarlosNZ/fig-tree-evaluator/issues/170) numbers to beat. Results are recorded there, not here.

## Before you run anything

**Node 22.** Benchmarks are only comparable on one runtime, and `engines` names it. Node 20's `AbortController` is roughly seven times slower than Node 22's, which alone moves v3's per-node figures by half — so a number taken on an older Node is not a smaller version of the same measurement, it is a different one. There is an `.nvmrc`, so `nvm use` picks the right version, and `pnpm bench` refuses to run on anything older.

```bash
nvm use
pnpm install
```

**`/v2-src` must be runnable.** The benches import the frozen v2 engine directly. If `pnpm test:v2 4_plus` does not pass, fix that first — the corpus and the benches share the same dependency on it.

## Running a bench

```bash
pnpm bench              # list what exists
pnpm bench holes        # run one
```

A bench takes between a few seconds and about a minute. It prints one Markdown table per sweep — copy it straight into an issue — and ends with a `(sink N)` line, which is the harness proving nothing was optimised away, not a result.

| Bench              | What it measures                                                                                                                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `holes`            | Claim 1, O(holes): a config with fixed holes as its static bulk grows, then fixed bulk as its holes grow. The floor claim rides in the cold column.                                                      |
| `parseOnce`        | Claim 2, parse-once: operator-dense trees with no static bulk, and the same reads under one operator instead of many — differencing the two prices an operator node and a data reference on each engine. |
| `churn`            | Claim 3, instance churn: the content layer on the three shapes #161 found, expression-dense, mostly-static, and one hole behind a 100 kB blob.                                                           |
| `inert`            | Claim 5, the constancy probe: values with nothing to evaluate, handed over one at a time.                                                                                                                |
| `io`               | Claim 6, memoized I/O: against an instant stub client; the request counts underneath the table are the claim.                                                                                            |
| `shortCircuit`     | Claim 7, cancellation: `and()` over costly operands with a decider first, last, or absent — once CPU-bound, once with a real await to abandon.                                                           |
| `nesting`          | Scale: one operator per level of depth.                                                                                                                                                                  |
| `scale`            | Scale: one balanced tree grown to thousands of nodes, looking for a knee in the per-node cost.                                                                                                           |
| `conformaElements` | Real world: the 62 form elements of a production Conforma template, at three granularities.                                                                                                              |
| `conformaActions`  | Real world: the 19 actions of the same template.                                                                                                                                                         |

## Reading a table

Every bench runs the same **four arms**, so a claim is never read in one cache state and quoted in another:

| Arm           | What it is                                                                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `v2`          | The frozen v2 engine, a held instance. v2 has no parse cache, so this is its only state.                                                                 |
| `v3 identity` | A held expression object, served by the parse cache's identity layer — a pointer lookup. The ceiling.                                                    |
| `v3 content`  | A fresh object with the same bytes each call, served by the content layer. What a host that re-reads its config per render or per request actually gets. |
| `v3 cold`     | No parse cache: a fresh instance, so every unit compiles. The floor.                                                                                     |

Figures are **microseconds per iteration**, the minimum of five rounds after a warm-up (the minimum is the least noise-contaminated estimator, since noise only ever adds). The ratio columns read `v2 / v3 …`: above 1× is a v3 win.

Before any arm is timed, the harness evaluates every arm once and **refuses to continue unless they all produced the same value**. A case whose arms disagree is not a measurement, it is two different programs — so a table you are looking at is one where every row agreed.

Two mechanisms are worth knowing about because they are charged to the timing loop. The content arm passes `{ ...tree }`, a shallow spread that defeats the identity layer while leaving the bytes underneath unchanged; it costs about 10 ns whatever the input's size. The cold arm constructs a new `FigTree`, because both cache layers live on the instance and there is deliberately no clearing API; the instance build is constant, independent of the input, and a bench prints it wherever it is large enough to matter.

## The real-world corpus

`bench/real-world/` holds a production Conforma template as exported (`conforma-template-*.json`, kept byte-identical), the v3 spelling generated from it (`*.v3.json`, rewritten on every run), and the code that makes the comparison honest:

- `migrate.ts` — the v2 → v3 mapping for exactly this corpus's operators, fragments and host functions. It throws on any shape it has not been taught. It is bench preparation, not the Phase-15 converter, and it says so.
- `fixtures.ts` — data under which every path the corpus reads resolves, instant stand-ins for HTTP and Postgres, the host functions registered both ways, the three fragments, and the unit builders for each granularity.
- `diff.ts` — every unit evaluated on both engines and compared, printing all disagreements rather than the harness's first one. Run it after changing the migration or the data:

```bash
pnpm exec tsx --tsconfig tsconfig.bench.json bench/real-world/diff.ts
```

Conforma holds a single global `FigTree` instance on both the front end and the back end. That decides what the arms mean there: `v3 cold` is one fresh instance per pass — a first render, or a first event after startup — and on the back end the same template's actions recur across events, so the content layer serves them and `v3 content` is the steady state.

## Running in a browser

Most evaluation happens in a browser, and a browser's `AbortController` is native code where Node's is JavaScript, so the browser is worth measuring in its own right.

```bash
pnpm bench:browser conformaElements holes     # bundles to bench/browser/dist
pnpm bench:serve                              # http://localhost:8765
```

Then open `http://localhost:8765/conformaElements.html`. The bench runs on load and renders each sweep's table on the page as it completes, with the raw Markdown under a disclosure for copying; the page's own console gets the same text. `(sink` appearing means it has finished. Bundles are ES modules served over HTTP rather than files opened directly, because the harness uses top-level `await` and Chrome blocks module scripts from `file://`. The server sends cross-origin isolation headers, which lift Chrome's `performance.now()` clamp from 100 µs to 5 µs; without them every fast row is quantised.

The frozen v2 engine imports `pg` and `sqlite` by value; the browser build aliases both to `bench/browser/nodeStubs.ts`. Nothing constructs them — SQL goes through the injected stub connection.

To drive it from a script rather than by hand, Playwright works: navigate to the page, wait for the text `(sink`, then read `document.getElementById('out').textContent`. Chromium has been measured this way; Safari and Firefox have not.

## Adding a bench

Drop a file in `bench/` and it appears in `pnpm bench` (shared modules are filtered by name in `codegen/bench.mjs`). Use `holes.ts` as the template. The shape is: build each spelling of the expression once, outside the loop; declare a `Sweep` with the four arm names and the ratio columns you want; hand `runCase` a `{ label, iterations, arms }` per row; end with `finish()`.

Rules that keep the numbers honest:

- Every bench declares the four standard arms. Leave one out only with a reason in the header, as `conformaActions` does for identity.
- Never build the input inside the timing loop. If an arm needs a fresh object, use the shallow spread and say so; if it needs work that scales with the input, measure that work separately and print it.
- Vary the data per iteration so no result can be reused, unless reuse is the thing being measured.
- Use only what Node and a browser both have: `performance.now()`, not `process.hrtime`; nothing from `node:` except behind an "am I in Node" check.
- Comments wrap at 80 characters; block comments are wrapped by hand.

Benches compile under `tsconfig.bench.json`, the only config that spans `src/` and `/v2-src`. Typecheck them with `npx tsc --noEmit -p tsconfig.bench.json` — `pnpm typecheck` cannot, since its config excludes the v2 engine. That config also carries one interop mapping, explained in its own comments, for a dependency of v2's whose ESM build is mislabelled.

## Where the numbers live

Nothing here records results. The plan's Phase 16a entry has the ledger and the rulings; issue #170 has the findings, the profile, and the optimisation pass they call for, with corrections as the runtime or the corpus changed. When you take a number that should be kept, put it there.
