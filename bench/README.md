# Benchmarks: v2 against v3

The benches measure the v3 engine in `src/` against the frozen v2 engine in `/v2-src`, head to head, on the same expressions. They exist to check the performance claims the v3 specs make (the claims ledger in [docs-dev/v3-specs/v3-implementation-plan.md](../docs-dev/v3-specs/v3-implementation-plan.md), Phase 17a.2) and to give the optimisation work in [#170](https://github.com/CarlosNZ/fig-tree-evaluator/issues/170) numbers to beat. Results are recorded there, not here.

## Before you run anything

**Node 22.** Benchmarks are only comparable on one runtime, and `engines` names it. Node 20's `AbortController` is roughly seven times slower than Node 22's, which alone moves v3's per-node figures by half — so a number taken on an older Node is not a smaller version of the same measurement, it is a different one. There is an `.nvmrc`, so `nvm use` picks the right version, and `pnpm bench` refuses to run on anything older.

```bash
nvm use
pnpm install
```

**`/v2-src` must be runnable.** The benches import the frozen v2 engine directly. If `pnpm test:v2 4_plus` does not pass, fix that first — the corpus and the benches share the same dependency on it.

## Running a bench

```bash
pnpm bench                    # list what exists
pnpm bench holes              # run one
pnpm bench holes parseOnce    # run several, in that order
pnpm bench all                # run every bench, in listing order
pnpm bench holes --packaged   # v3 as the built package, build/index.js (run `pnpm build` first)
```

By default v3 runs from `src/` through tsx, which compiles with esbuild's `keepNames`: every function is wrapped in a `__name()` call, and v3's compiler pays for it on every closure it creates. `--packaged` resolves the benches' import of v3 to the built package instead (`bench/packaged.mjs`), so v3 is measured as a host installs it — about 2–5% faster warm and 11–14% faster cold than from source (measured at the Phase-14 close; see 17a.1 in the implementation plan). The v2 arm is unchanged either way, which makes it a noise gauge when comparing the two.

A bench takes between a few seconds and about a minute; `all` runs them one after another, never side by side, since two benches sharing the CPU would each measure the other, and prints a `# name` heading before each so the whole transcript reads as one Markdown document. It prints one Markdown table per sweep — copy it straight into an issue — and ends with a `(sink N)` line, which is the harness proving nothing was optimised away, not a result.

## What each bench measures

A little background the descriptions lean on. An **expression** is the JSON structure FigTree evaluates. The parts of it that actually compute something — an operator like `plus`, a data lookup like `$data.user.name` — are its **nodes**; everything else (labels, fixed numbers, option lists) is **static**. v3 compiles an expression once into a skeleton of the static parts plus a list of the places nodes sit, and on every later evaluation touches only those places. v2 walks the whole structure every time. Most of the claims below follow from that one difference, and most of the results come down to two numbers each bench helps pin: what one node costs on each engine, and what one evaluation costs before any node runs.

**`holes` — evaluating a mostly-static config.** v3's central claim: the cost of evaluating a large config depends on how many expressions are in it, not on how much static material surrounds them. The bench builds a form-shaped config and runs two sweeps. First the static bulk grows while the number of expressions stays fixed — v3 should stay flat while v2 grows in step with the size. Then the expressions grow while the bulk stays fixed — v3 should now grow in proportion, because flat here would mean it was not evaluating at all. The `v3 cold` column also checks a second claim, that even with no caching whatsoever v3 should be no slower than v2.

**`parseOnce` — what one operator costs.** Every time v2 evaluates a node it works out afresh which operator it is, which alias was used, and which parameters it has. v3 did all of that once, when it compiled. The bench uses expressions that are nothing but operators, with no static parts, so that per-node cost is the only thing being measured — in two shapes: many operators, and the same data reads gathered under a single operator. Subtracting one from the other gives the price of one operator node and one data read on each engine, which is what most of the other tables reduce to.

**`churn` — being handed a fresh copy of the same config.** Hosts often give FigTree a newly parsed copy of a config it has seen before: a React component re-rendering, a server handling another request. v3 recognizes identical content and reuses its compiled form; the claim is that this costs one serialization of the input and is then as fast as if the same object had been held. The bench runs the three shapes where that trade-off comes out differently — dense with expressions, mostly static, and one expression behind a 100 kB block of static data, where serializing the block costs about as much as simply recompiling.

**`inert` — values with nothing in them to evaluate.** Most of what a form hands the evaluator is plain data — a label, a number, a list of options — with no expression anywhere inside. v3 spots these with a quick scan and returns them untouched, compiling nothing. The bench hands over single inert values of increasing size. v2 walked arrays and objects even in this case, so the gap here is the widest in the suite.

**`io` — not repeating network requests.** An expression that fetches from an API should fetch once and reuse the answer while its inputs are unchanged, and must fetch again the moment they change. The bench uses an instant stand-in for the HTTP client so that no network variance enters the timings — which makes the timings the lesser half. The request counts printed under the table are the real measurement: how many times each engine actually called out over a hundred evaluations.

**`shortCircuit` — stopping work that cannot change the answer.** In `and(a, b, c)`, once one operand comes back false the others no longer matter. v2 evaluates all of them regardless; v3 abandons the rest. The bench puts the deciding operand first (v3 may stop early), last, or nowhere (both engines must do everything) — first with operands that are pure computation, then with operands that genuinely wait on something. Cancellation can only take effect while an operand is waiting, so only the second sweep can show a gain, and the first is there to prove the controls behave.

**`nesting` — deeply nested expressions.** An operator inside an operator inside an operator, down to 160 levels. Checks that neither engine pays anything for depth beyond the ordinary per-node cost.

**`scale` — one very large expression.** A single tree grown to 8,000 nodes, watching the cost per node as it grows. If that cost stops being constant somewhere, that is the finding — it usually means memory pressure.

**`conformaElements` and `conformaActions` — a real template.** The 62 form elements and 19 back-end actions of a production Conforma template, migrated to v3 and checked unit for unit against v2 before anything is timed. The elements run at three levels of granularity — every property and parameter on its own (which is how the app does it today), `parameters` as one expression, and each element as one expression — so the tables show how much the way a host cuts up its template matters. See "The real-world corpus" below for what is in the folder.

**`handles` — what a compiled-expression handle costs.** v3 only, since v2 has no `compile()`, so it does not follow the four arms below. The compiled form is already in the parse cache, so a `compile()` of a known expression pays only for the handle object. The bench prices that three ways: evaluating directly against compiling a handle on every call and evaluating through it, `compile()` alone in batches of a hundred (a handle costs about ten nanoseconds, below a single call's resolution), and `inspect()` of a held handle. It exists to catch a change that makes handles expensive to make or read.

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
pnpm bench:browser conformaElements holes     # bundles those two to bench/browser/dist
pnpm bench:browser all                        # or every bench
pnpm bench:serve                              # http://localhost:8765
```

Then open `http://localhost:8765/` — an index lists every page built with a line on what each measures — or a page directly, such as `http://localhost:8765/conformaElements.html`. The bench runs on load and renders each sweep's table on the page as it completes, with the raw Markdown under a disclosure for copying; the page's own console gets the same text. `(sink` appearing means it has finished. Bundles are ES modules served over HTTP rather than files opened directly, because the harness uses top-level `await` and Chrome blocks module scripts from `file://`. The server sends cross-origin isolation headers, which lift Chrome's `performance.now()` clamp from 100 µs to 5 µs; without them every fast row is quantised.

The frozen v2 engine imports `pg` and `sqlite` by value; the browser build aliases both to `bench/browser/nodeStubs.ts`. Nothing constructs them — SQL goes through the injected stub connection.

To drive it from a script rather than by hand, Playwright works: navigate to the page, wait for the text `(sink`, then read `document.getElementById('out').textContent`. Chromium has been measured this way; Safari and Firefox have not.

## Adding a bench

Drop a file in `bench/` and it appears in `pnpm bench` and in `pnpm bench:browser all` (shared modules are filtered by name in `codegen/benchList.mjs`). It must `export const description = '…'` — one line, used by the listing and the browser index; the list refuses a bench without one. Use `holes.ts` as the template. The shape is: build each spelling of the expression once, outside the loop; declare a `Sweep` with the four arm names and the ratio columns you want; hand `runCase` a `{ label, iterations, arms }` per row; end with `finish()`.

Rules that keep the numbers honest:

- Every bench declares the four standard arms. Leave one out only with a reason in the header, as `conformaActions` does for identity.
- Never build the input inside the timing loop. If an arm needs a fresh object, use the shallow spread and say so; if it needs work that scales with the input, measure that work separately and print it.
- Vary the data per iteration so no result can be reused, unless reuse is the thing being measured.
- Use only what Node and a browser both have: `performance.now()`, not `process.hrtime`; nothing from `node:` except behind an "am I in Node" check.
- Comments wrap at 80 characters; block comments are wrapped by hand.

Benches compile under `tsconfig.bench.json`, the only config that spans `src/` and `/v2-src`. Typecheck them with `npx tsc --noEmit -p tsconfig.bench.json` — `pnpm typecheck` cannot, since its config excludes the v2 engine. That config also carries one interop mapping, explained in its own comments, for a dependency of v2's whose ESM build is mislabelled.

## Where the numbers live

Nothing here records results. The plan's Phase 17a entry has the ledger and the rulings; issue #170 has the findings, the profile, and the optimisation pass they call for, with corrections as the runtime or the corpus changed. When you take a number that should be kept, put it there.
