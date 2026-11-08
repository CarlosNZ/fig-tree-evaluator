# v3 release plan

_Drafted November 2026, from a survey of this repo, the editor repo and the live hosting. It replaces the checklist that was Phase 18 in [v3-implementation-plan.md](v3-specs/v3-implementation-plan.md), putting it in order with instructions. Every item from that checklist is here, mapped in "Where the Phase 18 checklist went" at the end._

The release covers three things: **fig-tree-evaluator 3.0.0** on npm, **fig-tree-editor-react 3.0.0** on npm, and the **docs site** (with the Playground) live at its permanent address. They go out together. The editor's major version tracks the evaluator's (editor plan, "Goal and posture"), and the README and the editor both link into the site.

## The shape of it

1. **Decisions** that change what the later steps do.
2. **Finish the library** on `v3.0-dev`: the open rulings, the issue triage, the v2 retirement.
3. **Finish the docs content** on `v3.0-docs`.
4. **Finish the editor** on its `v3.0-dev`, in parallel with 2 and 3.
5. **Set up hosting** for the site, still deploying nothing.
6. **Branch surgery:** cut the maintenance branches, merge the docs branch into `v3.0-dev`, then `v3.0-dev` into `main` (both repos).
7. **The release candidate:** evaluator and editor betas, the site live, links switched over, one to two weeks of soak.
8. **Release day:** 3.0.0 of both, in a fixed order.
9. **Afterwards:** cleanup, and the downstream apps.

Stages 2, 3 and 4 run side by side. Everything from 6 on runs in order.

---

## 1. Decisions

Each one comes with a recommendation, or the ruling where one is made. Settle all of them before stage 5.

### 1.1 The site's address

**Decided (Carl, November 2026): `https://carlosnz.github.io/fig-tree-evaluator/`,** the project sub-path, served by GitHub Pages from this repo. It's the v2 demo's address, so old demo links reach the docs site directly, which is what the docs plan wants (open question 2 in [doc-planning.md](doc-planning.md)). It's also where json-edit-react's site lives, and it needs no domain or DNS.

The site is written as if it sits at a domain root, so it needs one-time setup (5.1):

- `site: 'https://carlosnz.github.io'` and `base: '/fig-tree-evaluator'` in `astro.config.mjs`.
- About 600 root-relative links in Markdown and MDX (`](/guides/…)`, across 48 files in the pages, operator and category notes, Playground blurbs and welcome text). Astro doesn't add `base` to links in content, so a short rehype plugin in `astro.config.mjs` prefixes every `href` starting with `/` with `import.meta.env.BASE_URL`. The files themselves stay as they are, and new pages keep writing root-relative links.
- The two hard-coded `href="/reference/operators/…"` in `OperatorEntry.astro`, which should build on `import.meta.env.BASE_URL`.
- The `apple-touch-icon` link and the link-preview image (`new URL('/social.png', SITE)`) in `astro.config.mjs`, which both need the base.

Already base-aware: Starlight's sidebar, favicon and search, Astro-imported images, the "open in editor" links (`playgroundLink.ts`), and the SQLite `.wasm` (a Vite `?url` import). The dev server moves to `localhost:4321/fig-tree-evaluator/`.

**A custom domain stays open for later** (`figtree.dev`, `fig-tree.dev`, or the free `figtree.js.org`). Moving to one is a settings change: set the domain under Settings → Pages, add `docs-site/public/CNAME`, change `site`, and remove `base`. carlosnz.github.io has no custom domain of its own, so GitHub then redirects every `carlosnz.github.io/fig-tree-evaluator/…` link to the domain, and the rehype plugin follows `base`, so no content changes.

### 1.2 What a v2 reader lands on

**Recommendation: the docs home, as is.** Readers following the v2 README's "Try the Demo/Playground" link (npm 2.23.2, the `v2.x` branch) reach the site directly, since it takes over the demo's address (1.1). The home page already ends with "Using v2? Its docs are the README on the `v2.x` branch". Keeping a hosted v2 playground isn't worth it: the old build has `/fig-tree-evaluator/` baked into its asset paths, so moving it would mean rebuilding the v1 editor demo.

### 1.3 When the site goes live

**Recommendation: at the release candidate (stage 7), with a banner,** not on release day:

- The beta's npm README links into the site, so the site has to exist by the time the beta is published.
- Hosting, the address, HTTPS, link previews and the Playground's real network requests only get tested once the site is hosted.

The banner says the site documents the 3.0 release candidate and gives `npm install fig-tree-evaluator@beta`. It's removed on release day.

### 1.4 What the release candidate is called

**`3.0.0-beta.N` under the `beta` dist-tag,** which `pnpm release` already supports in both repos. It has no `-rc` form, and adding one isn't worth it. A beta needs a CHANGELOG entry (the `## [3.0.0]` one counts), so the 3.0.0 entry has to be written before stage 7, not on release day. Phase 17a's claims ledger and #170 supply its performance story.

### 1.5 Which open v3 issues block 3.0

The rule is **anything breaking goes in before 3.0.0; anything additive can wait for 3.x.** My reading of the open `v3` issues:

- **Before 3.0:**
  - #234: a bug in `PerElement.evaluate()`.
  - #248: NaN truthiness. It's a behaviour, so it should be settled before 3.0 even if the decision is "as is".
  - #286: deep-freezing `./catalog`'s data. Freezing later would break any host that mutates it.
  - #219: the review of message wording. Messages aren't contract, but a pass before 3.0 saves a run of 3.0.x changelog noise.
  - The two Phase 18 rulings: key order, and where subpath types export from (2.1, 2.2).
- **After 3.0 (additive):** #292, #276, #275, #247, #244, #236, #235, #231, #200, #189, #183, #172, #149, #162, #159.
- **Close now:** #281. Its branch is fully merged into `v3.0-dev`.
- **v2 only, for the `v2.x` branch:** #202, #120, #116, #115, #132. Relabel the unlabelled ones `v2.x` or close them as superseded by v3.

### 1.6 What happens to the benchmarks

`bench/` imports the frozen engine from `/v2-src` for its head-to-head comparisons, so retiring `/v2-src` (2.5) breaks them. **Recommendation:** point the v2 arm at the published `fig-tree-evaluator-v2` devDependency, which the converter and the differential already use. That keeps the performance story reproducible. The alternative is to drop the v2 arm and keep the v3-only benches.

---

## 2. Finish the library (on `v3.0-dev`)

Work in issue branches off `v3.0-dev` as usual. Each item is one PR unless noted.

### 2.1 Key order in deep evaluation

Phase 18 item. Evaluating `{ a: <node>, b: 1, c: <node>, d: 2 }` gives `{ b, d, a, c }`, where v2 kept the input's order.

- **Either** make the skeleton assembly keep the input's order. Add a test with interleaved constant and computed keys, and check the bundle-size diff.
- **Or** add a sentence to "Deep evaluation" in [v3-api.md](v3-specs/v3-api.md) and to the docs site's evaluation page saying the order isn't kept.

### 2.2 Where subpath types export from

Phase 18 item. Today every type exports from the root only.

- If the subpaths should re-export their own types, add `export type { … }` lines to `src/migrate/index.ts`, `src/format/index.ts`, `src/catalog/index.ts` and `src/authoring/index.ts`.
- Then update "Types" in [v3-packaging.md](v3-specs/v3-packaging.md), [docs-dev/imports.md](imports.md), and the docs site's `api/exports.mdx`.
- Run `pnpm build && pnpm check:package` to confirm the per-entry `.d.ts` files still typecheck.

### 2.3 The issues that block 3.0

Fix the "before 3.0" set from 1.5, one PR each.

### 2.4 Hand-migrate the complex expressions

Phase 18 item. Write `test/complex-expressions.test.ts` from `test/v2-working/17_complexExpressions.test.ts` in idiomatic v3:

- `join` where v2 cast an array to text;
- `[*]` where it relied on the response collapse;
- the custom function as a registered operator.

Assert v2's recorded results in both the full and shorthand forms. Nothing in the v3 suite is on that scale, and the massive nested query reaches v3 only through the converter, where the differential's #346 and #347 fail at their first `convert`, so being hand-written it's also an independent check on the converter. The 20,000-node generated query has no hand-written counterpart and stays in the differential. This has to happen before 2.5, which deletes the source file.

### 2.5 Retire the v2 assets

Phase 18 item. In one PR:

1. Delete `/v2-src`, `test/V2`, `test/v2-working`, `jest.v2.config.js`, `tsconfig.v2.json`, and the v2-only codegen (`queryBuilder`, `generateMassiveQuery`).
2. Remove the `test:v2` script from `package.json`.
3. Clean their references out of these files, all of which mention them today:
   - `tsconfig.json` (`exclude`);
   - `jest.config.js` (the ignore patterns and the comment);
   - `eslint.config.mjs` (`V2_BAN` and the `ignores`);
   - `.prettierignore` and `.gitignore`;
   - `tsconfig.test.json`.
4. Repoint `bench/` (1.6): `bench/*.ts`, `bench/README.md`, `tsconfig.bench.json`.
5. **Keep `test/massiveQuery.json`.** The differential's corpus reads it (`differential/corpus.ts`, `differential/extract/setup.ts`). If you'd rather drop it, remove the case from the corpus and re-accept with `pnpm differential --accept`.
6. Check: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm check:package && pnpm differential --check`.

The differential stays after the release. It runs on the published v2 package, and it's the converter's regression check for as long as people are migrating.

### 2.6 Refresh CLAUDE.md

Phase 18 item, plus the docs plan's open question 4:

- the opening paragraph's "README … authoritative reference for every operator" (the site is the reference now);
- the stale `demo/` and `yarn` notes;
- the `test:v2` and v2-asset lines in Commands and Testing;
- "Testing" still describes the numbered v2 test files;
- the v2 half of "The operator pattern".

Do this after 2.5, so it describes the repo as it ends up.

### 2.7 Record the final bundle sizes

Working rule 6. Add a "Phase 18" row to the size table in [v3-implementation-plan.md](v3-specs/v3-implementation-plan.md), measured on the last library commit before the beta.

---

## 3. Finish the docs content (on `v3.0-docs`)

The site already has every chapter. What's left:

### 3.1 Write the "Visual editor component" page

`docs-site/src/content/docs/editor.mdx` is still a skeleton marked "Placeholder". Its plan is in "The Playground page" in [doc-planning.md](doc-planning.md): a live instance, install and a minimal setup, fitting the editor to an app (`getCatalog()`, fragments and the fragment editor, theming), and a link to the props reference in the editor's README. Write it through `/write-page`. It needs the editor's v3 README (4.3) to link to, so write it after that README or alongside it.

### 3.2 Finish the Playground

The example blurbs are first drafts awaiting your edit pass (memory: next step on `docs-playground-improvements`). Then merge `docs-playground-improvements` into `v3.0-docs`.

### 3.3 Fill the gaps from the Phase 18 README notes

Phase 18 asked the README for three topics, written up below as they were recorded there. The site now owns them:

- **`get`'s `from`:** check `concepts/data.mdx` against the six patterns below, and add any that are missing.
- **`match` branch keys that collide with a registered name:** **not covered.** Add it to `operator-notes/match.mdx` (or the iteration/branching concept page), with the four examples below.
- **`$error`:** covered by `guides/fallbacks.mdx`. Check it against the list below.

#### The notes, as Phase 18 recorded them

- **Show what `get`'s `from` can do** (Carl, at closing [#186](https://github.com/CarlosNZ/fig-tree-evaluator/issues/186)). It is more useful than a reference with a different root, and v2's `additionalData` merge is one of its patterns rather than a missing feature. Each of these runs as written:

  ```js
  // Data and extra values through one computed path; the later object wins
  { $get: { path: '$data.field', from: { $plus: ['$data', { region: 'AU' }] } } }
  // The same, with the extras as defaults the data overrides
  { $get: { path: '$data.field', from: { $plus: [{ region: 'AU' }, '$data'] } } }
  // A lookup table, with a default for a key it doesn't have
  { $get: { path: '$data.status', from: { active: 'Active', paused: 'On hold' }, default: 'Unknown' } }
  // Drill into a node's result
  { $get: { path: 'name', from: { $find: ['$data.users', { $equal: ['$element.id', '$data.id'] }] } } }
  // Choose the source object at evaluation time
  { $get: { path: 'user.name', from: { $if: ['$data.isAdmin', '$data.admin', '$data.guest'] } } }
  // An optional object: a null source has every path missing, so the default answers
  { $get: { path: 'theme', from: '$data.settings', default: 'light' } }
  ```

- **Show how `match` takes a branch key that collides with a registered name** (Carl, scoping [#232](https://github.com/CarlosNZ/fig-tree-evaluator/issues/232)). A literal `branches` map is first read as a possible node, so a `$plus` key makes the map a call to `plus` (or a malformed node beside other keys), never a branch label. The value matched is runtime data and is never compiled, so only the key needs care. Prefixing both sides is the way to recommend, since branches stay lazy; `literal` returns its branch values as data, unevaluated, and `buildObject` evaluates every branch before one is chosen. Each of these runs as written, with `data: { code: '$plus' }`:

  ```js
  // Prefix the value and the keys: no key starts with `$`, and branches stay lazy → 3
  {
    $match: [
      { $buildString: ['key:%1', '$data.code'] },
      { 'key:$plus': { $plus: [1, 2] }, 'key:other': 'no' },
    ]
  }
  // Constant branch values only: a computed map is data, so this returns 'yes'…
  {
    $match: ['$data.code', { $literal: { $plus: 'yes', other: 'no' } }]
  }
  // …and this returns the object { $plus: [1, 2] }, not 3
  {
    $match: ['$data.code', { $literal: { $plus: { $plus: [1, 2] } } }]
  }
  // Keys as entry data: → 3, but every value is evaluated before match picks one
  {
    $match: [
      '$data.code',
      {
        $buildObject: [
          { key: '$plus', value: { $plus: [1, 2] } },
          { key: 'other', value: 'no' },
        ],
      },
    ]
  }
  ```

- **Document `$error`** ([#239](https://github.com/CarlosNZ/fig-tree-evaluator/issues/239)). The README has nothing on it yet. What it needs:
  - `$error` (alias `$err`) is the failure the enclosing fallback caught, as a plain object: `code`, `message` and `path` always, and `operator`, `fragment`, `fragmentPath` and `errorData` where present ("`FallbackError` — what `$error` holds" in [v3-evaluator-methods.md](v3-specs/v3-evaluator-methods.md); "`$error`" in [v3-api.md](v3-specs/v3-api.md)).
  - It exists only inside a fallback, and a drill into it that misses is `null` whatever `strictDataPaths` says.
  - A fallback that reads `$error` never fails: if it fails and nothing inside it catches first, its node gives `null`.
  - A fallback built only from literals and `$error` reads is static, so it answers the evaluation timeout and is legal in `operatorDefaults`.
  - Branch on `code` and `errorData`, never on `message`, whose wording is for developers and may change. A server's own text is in `errorData.response`.
  - The fallback codes, each with its `errorData`: the table in "The code vocabulary" in v3-evaluator-methods.md and "Client failures: codes and the enforced shape" in [v3-operator-contract.md](v3-specs/v3-operator-contract.md).
  - For custom clients: throw `httpFailure()` / `sqlFailure()`, since anything else reaches a fallback as `request-failure`. The v2 section on `errorData` (throw a plain error with `errorData` attached, with a link to `src/httpClients.ts`) goes.
  - `buildString` substitutes `{{$error.code}}` in its string form only. In the array form, `['…{{$error.code}}']`, the rest parameter supplies `substitutions: []` and the token stays inert, as any reference token does beside array substitutions (`validate()` warns `inert-reference-token`).

  Each of these ran as written, against a client failing `/regions` with a 400 and a message, `/missing` with a 404 and no body, and `/backup` with a network error:

  ```js
  // The whole error: { code: 'http-status', message, path, operator: 'http',
  // errorData: { status: 400, statusText, url, response: { message } } }
  { $http: 'https://api.example.com/regions', fallback: '$error' }
  // The server's own message, or a fixed one when it sent none
  {
    $http: 'https://api.example.com/regions',
    fallback: { $firstNonNull: ['$error.errorData.response.message', 'Could not load regions'] },
  }
  // Branch on the code and errorData: [] for a 404, the server's message for
  // another status, a fixed message when the request never got an answer
  {
    $http: 'https://api.example.com/regions',
    fallback: {
      $if: [
        { $equal: ['$error.code', 'http-status'] },
        { $if: [{ $equal: ['$error.errorData.status', 404] }, [], '$error.errorData.response.message'] },
        'Could not reach the server',
      ],
    },
  }
  // In a template, in buildString's string form → 'Lookup failed: http-status'
  { $http: 'https://api.example.com/regions', fallback: { $buildString: 'Lookup failed: {{$error.code}}' } }
  // A fallback that reads $error and fails gives null…
  { $http: 'https://api.example.com/regions', fallback: { $plus: ['$error.message', { a: 1 }] } }
  // …unless a fallback inside it catches first → 'Lookup failed'
  {
    $http: 'https://api.example.com/regions',
    fallback: { $plus: ['$error.message', { a: 1 }], fallback: 'Lookup failed' },
  }
  // An inner fallback sees its own failure; a var reaches the outer one
  // → 'http-status, then request-failure'
  {
    $http: 'https://api.example.com/regions',
    fallback: {
      vars: { outer: '$error' },
      $http: 'https://api.example.com/backup',
      fallback: { $buildString: ['%1, then %2', '$vars.outer.code', '$error.code'] },
    },
  }
  // Instance-wide, as a static default: every http failure gives its code
  new FigTree({ operators: [coreOperators, httpOperators()], operatorDefaults: { http: { fallback: '$error.code' } } })
  ```

### 3.4 Remove or hide the prototype page

`prototype.mdx` is out of the sidebar and search, but it's still built and reachable at `/prototype/`. Delete it before the site goes live, or add `draft: true` if you want to keep it locally.

### 3.5 Read through the pages for anything unfinished

- **Comments.** The MDX `{/* TO-DO … */}` comments don't render, so they can stay: the ones about `#244`, the custom-operator library, and the signature-block highlighting.
- **Visible text.** Search the rendered site for "Placeholder", "skeleton" and "TBD".

### 3.6 Run the stage 6 voice pass

Optional, if you want it.

---

## 4. Finish the editor (`fig-tree-editor-react`, on its `v3.0-dev`)

Its own release prep is Phase 11 in the editor's `docs-dev/v3-plan.md`. Do it in parallel with stages 2 and 3, with these changes:

### 4.1 Update the editor's plan first

Phase 11 says to "restore the demo's `deploy` script … replacing the live v2 playground". That has been **superseded** by the docs plan: the Playground replaces the hosted demo, and the demo stays a local development tool. So in the editor repo:

- Rewrite that Phase 11 bullet, and 0.6's "to restore in Phase 11" note.
- **Delete** the demo's `deploy` script and its `gh-pages` devDependency instead of restoring them. `main`'s copy of the script still pushes to _this_ repo's `gh-pages` branch. Once the docs deploy through GitHub Actions (5.2) it wouldn't take the site down, but it's a trap worth removing.

### 4.2 Finish Phase 11's code tasks

- Delete `v1-src/` (and its lint ban, tsconfig exclusion and rollup exclusion).
- Rewrite `CLAUDE.md` for the v3 architecture.

### 4.3 Write the README and CHANGELOG

These are Phase 11 items:

- **README.** The version-alignment policy, theming, `useUndo` with `autoUpdate`, and the props reference. Replace every link into the evaluator's README (`?tab=readme-ov-file#fragments`, `#custom-operators`, `#metadata`, `#operator-reference`, `#object_properties`, `#custom-functionsoperators`) with the docs site's pages. Replace the demo link (`carlosnz.github.io/fig-tree-evaluator/`) with the site's `/playground/` and `/editor/`.
- **CHANGELOG.** A `## [3.0.0]` entry, with the migration note for v1 consumers (renamed and removed props, `Select` groups, fig-tree no longer re-exported, json-edit-react as a peer).

### 4.4 Update the package metadata

- `homepage` → the site's `/editor/` page.
- Remove `"private": true`, which stops any publish. The version stays `3.0.0-dev` until `pnpm release` sets the beta's.
- The fig-tree peer range stays `^3.0.0-preview.15` until 7.2.

### 4.5 Update #200

Mark which of #200's editor-request items are in 3.0 and which are after it.

---

## 5. Set up hosting (deploying nothing yet)

### 5.1 Set the site's address

In `docs-site/astro.config.mjs`:

1. Set `const SITE = 'https://carlosnz.github.io'`, which also turns on the link-preview meta tags (skipped while it's undefined), and add `base: '/fig-tree-evaluator'` beside `site`. Rewrite the TO-DO comment above `SITE`, since hosting is decided.
2. Add the rehype plugin under `markdown.rehypePlugins`.
3. Fix the `apple-touch-icon` link and the link-preview image URL.

Then fix the two hrefs in `OperatorEntry.astro` (all listed in 1.1). Run `pnpm build` and `pnpm preview`, open `localhost:4321/fig-tree-evaluator/`, and crawl it for 404s:

```bash
npx linkinator http://localhost:4321/fig-tree-evaluator/ --recurse
```

Also update the dev-server URL in `docs-site/README.md` and in CLAUDE.md's `docs:dev` line.

### 5.2 Add a deploy job to `.github/workflows/docs.yml`

1. After the build step, upload the build with `actions/upload-pages-artifact@v3` and `path: fig-tree-evaluator/docs-site/dist`.
2. Add a second job, `deploy`, that runs `actions/deploy-pages@v4`:
   - `needs: build`;
   - `if: github.ref == 'refs/heads/main' && github.event_name != 'pull_request'`;
   - permissions `pages: write` and `id-token: write`;
   - `environment: github-pages`.
3. Add `workflow_dispatch:` to `on:`, so the site can be redeployed by hand.
4. Add `.github/workflows/docs.yml` to its own `paths` filter, if it isn't there already.

Because of the `if`, the job only ever deploys from `main`. Nothing goes live until stage 7.

### 5.3 Refresh the HTTP recordings

The deploy build replays `src/lib/httpRecordings.json` as CI does today, so no change is needed. Re-run `pnpm record:http` before the beta, in case an example's API has changed.

---

## 6. Branch surgery

Do these in order, in both repos, at the start of the release-candidate week.

### 6.1 Cut the maintenance branches

- **Evaluator:**

  ```bash
  git push origin origin/main:refs/heads/v2.x
  ```

  This cuts `v2.x` at `05d11b5`, the 2.23.2 release. The v3 README's "v2 docs are on the `v2.x` branch" link starts working at that point.

- **Editor:**

  ```bash
  git push origin origin/main:refs/heads/v1.x
  ```

  Then add `v1.x` to the branch list in the editor's CI.

- `v2.x` needs no cleanup for releasing: `main` has neither `codegen/release.mjs` nor a `release` script, and v2 patches are cut by hand, per the packaging spec.

### 6.2 Bring the docs branch into `v3.0-dev`

`v3.0-docs` is 288 commits ahead of `v3.0-dev`, and it carries library changes as well as the site:

- `src/catalog/index.ts`, the operator-description edits from the reference-docs pass. These ship in the package.
- `README.md`, the new short v3 README.
- `CLAUDE.md`, `package.json` (`docs:dev`), `.github/workflows/docs.yml`, the logo files.

Merge `docs-playground-improvements` into `v3.0-docs`, then open a PR from `v3.0-docs` into `v3.0-dev`. Once that's merged, `v3.0-docs` has no reason to exist apart from `v3.0-dev`: further docs work branches from `v3.0-dev` like any other change.

### 6.3 Merge `v3.0-dev` into `main`, in the evaluator

`main` has 10 v2 commits that `v3.0-dev` doesn't:

- the 2.23.x fixes #138, #139, #143, #144 and #145;
- the `split` newline fix;
- version and CHANGELOG bumps.

They're all in `v2.x` from 6.1. In the merge:

- **`src/`, `test/`, `package.json` and the lockfile:** take `v3.0-dev`'s side.
- **`CHANGELOG.md`:** keep both sets of entries, the v2 ones below.
- **Behaviour:** for each of the five fixes, confirm v3 behaves correctly on the same input. The differential runs the published 2.23.2's tests, which include them, so `pnpm differential --check` passing is most of this check.

Open it as a PR (`v3.0-dev` → `main`), not a local merge, so CI runs on the result. Use a merge commit, not a squash: squashing 398 commits into one would throw away v3's history.

### 6.4 Merge `v3.0-dev` into `main`, in the editor

The same: the editor's `v3.0-dev` is 173 ahead of `main` and `main` is 0 ahead, so it's a fast-forward or a plain merge.

### 6.5 Make `main` the branch everything points at

Do this in the same PR as 6.3, or straight after it:

- **`.github/workflows/ci.yml`:** `branches: [main, v3.0-dev]` → `[main]`. Add `v2.x` if v2 should get CI. It would need its own yarn-era workflow on that branch, so probably not.
- **`.github/workflows/docs.yml`:**
  - The push `branches` become `[main]`.
  - The "Fetch the branches source links point to" step fetches `main` only.
  - The editor checkout goes from `ref: v3.0-dev` to `main`, until 7.3 removes the checkout.
- **`docs-site/src/lib/sourceLink.ts`:** `SOURCE_BRANCHES = ['main']`.
- **`docs-site/astro.config.mjs`:** `editLink.baseUrl` goes from `…/edit/v3.0-dev/docs-site/` to `…/edit/main/docs-site/`.
- **`docs-site/src/content/docs/api/errors.mdx`:** the hard-coded `blob/v3.0-dev/src/errorCodes.ts` becomes `blob/main/…`, or better a `<SourceLink>`.
- **Repo-wide:** search for any other `v3.0-dev` in a URL:

  ```bash
  git grep -n "v3.0-dev" -- docs-site README.md src
  ```

---

## 7. The release candidate

### 7.1 Publish the evaluator beta

From `main`, with the 3.0.0 CHANGELOG entry written (1.4):

```bash
pnpm release --dry-run
```

```bash
pnpm release
```

Pick `3.0.0-beta.1`. The script runs CI, tags `v3.0.0-beta.1` and publishes under `beta`. Then check the push landed, since an `--atomic` push has half-applied once before:

```bash
git ls-remote origin refs/tags/v3.0.0-beta.1 refs/heads/main
```

### 7.2 Publish the editor beta

In the editor repo:

1. Set the fig-tree peer and devDependency to `^3.0.0-beta.1` and run `pnpm install`.
2. Run `pnpm demo:pack`, the packed-tarball check from its Phase 11.
3. Run `pnpm release` and pick `3.0.0-beta.1`.

### 7.3 Move the docs site onto the published editor

1. In `docs-site/package.json`, change `"fig-tree-editor-react": "link:../../fig-tree-editor-react"` to `"^3.0.0-beta.1"`, then run `pnpm install` in `docs-site/`.
2. Keep `fig-tree-evaluator: link:..`. The site should build against the repo's own build, so a library PR that breaks the docs fails in its own PR.
3. In `docs.yml`, delete the editor checkout and its "Build the editor" step, the editor's lockfile from `cache-dependency-path`, and the header comment's paragraph about the second checkout.
4. In `astro.config.mjs`, the `dedupe` list still matters for `fig-tree-evaluator` (linked), so leave it.
5. Update `docs-site/README.md`'s "First-time setup", whose step 2 (clone and build the editor) goes away, and the "Dependencies" section of [doc-planning.md](doc-planning.md).

### 7.4 Replace the placeholders

- **`README.md`:** done on `docs-playground-improvements` (November 2026): its links point at `https://carlosnz.github.io/fig-tree-evaluator/`, and its two links to `/migrating/upgrading/` go to `/migrating/`, the page's real path. They 404 until the site is live (7.5), so check them all once it is.
- **`src/catalog/index.ts`:** point `DOCS` at the operator reference, and give each operator its own anchor. The entries render with `id="op-<name>"`, so `docUrl` becomes `https://carlosnz.github.io/fig-tree-evaluator/reference/operators/#op-<name>`. Delete the TO-DO comment above it. If the catalog's drift tests check `docUrl`, update them too.
- **`package.json`:**
  - `homepage` goes from `…#readme` to `https://carlosnz.github.io/fig-tree-evaluator/`.
  - `description` goes from "Module to evaluate JSON-structured expression trees" to the README's tagline, or something close to it.
  - Check that `keywords` are still apt.
- **The GitHub repo's About panel:**

  ```bash
  gh repo edit CarlosNZ/fig-tree-evaluator --homepage "https://carlosnz.github.io/fig-tree-evaluator" --description "<tagline>"
  ```

- **The README's images:** `images/logo/*.svg` and `images/expression_tree.png` are relative paths. npm resolves those against the GitHub repo's default branch, so they only work once `main` has them (6.3). Check them on the beta's npm page (7.6), as the memory note about the npm README asks. If they don't render, switch to absolute `https://raw.githubusercontent.com/CarlosNZ/fig-tree-evaluator/main/images/…` URLs.

These changes go into `main` before the next beta. The README that matters is the one npm shows, so publish `beta.2` once they're in.

### 7.5 Go live

1. **Switch the Pages source.** Settings → Pages → Source: from "Deploy from a branch" (`gh-pages`, legacy) to "**GitHub Actions**". From this moment the v2 demo stops being served at its address, so do steps 1 and 2 back to back.
2. **Deploy.** Merge the hosting changes (5.1, 5.2) to `main`, or run the Docs workflow by hand. Check that the `deploy` job succeeds and `https://carlosnz.github.io/fig-tree-evaluator/` serves the docs.
3. **Add the release-candidate banner** (1.3). Starlight's `banner` frontmatter works per page; for the whole site, add a small override of the `Banner` component, or a line in `custom.css` plus the header.
4. **Retire the old `gh-pages` branch.** It's no longer the source, so delete it (`git push origin --delete gh-pages`). It holds the v1 demo build, and nothing serves it any more.
5. **Retire the editor's old demo.** The editor repo's own Pages site (`carlosnz.github.io/fig-tree-editor-react`, a February 2025 demo build) still serves the v1 demo. Either disable Pages there, or replace its `index.html` with a redirect to the new site's `/editor/` page.

### 7.6 The soak checklist (one to two weeks)

- **The npm pages** for both betas: logo, images, every README link.
- **Every page on the live site.** Check the links. A crawl is the quickest way:

  ```bash
  npx linkinator https://carlosnz.github.io/fig-tree-evaluator --recurse
  ```

- **The Playground on the live site:**
  - every example;
  - fragment mode;
  - Trace and coverage;
  - the HTTP examples, which make real requests in the browser;
  - SQL;
  - an "open in editor" link from a docs page;
  - a narrow screen.
- **Link previews.** Paste a page URL into Slack or similar and check the `social.png` card.
- **Old links.** The old demo URL and a deep link (`/fig-tree-evaluator/something`) should both reach the new site.
- **A clean install.** Install the betas into a fresh Vite app, and in a Node project as CommonJS (`require`).
- **Real host code.** Try the beta against one real host, Conforma for example, through the converter: `migrateV2Expression` over a sample of its stored expressions.
- **Fixes.** Each fix during the soak goes to `main`. Publish another beta if it touches the package.

---

## 8. Release day

In this order, all on the same day:

1. **Final check of `main`.** CI green, `pnpm differential --check` green, the CHANGELOG's `## [3.0.0]` entry final.
2. **Publish the evaluator:**

   ```bash
   pnpm release
   ```

   Pick `3.0.0`, which publishes under `latest`. Check the tag and branch landed with `git ls-remote` as in 7.1.

3. **Tag the last v2 on npm** (Phase 18 item):

   ```bash
   npm dist-tag add fig-tree-evaluator@2.23.2 v2
   ```

   Use the last 2.x if another has gone out from `v2.x` meanwhile. Then check the tags:

   ```bash
   npm view fig-tree-evaluator dist-tags
   ```

   Expect `latest: 3.0.0`, `v2: 2.23.2`, `beta`, `preview`.

4. **Create a GitHub release** for the tag, which `pnpm release` doesn't do:

   ```bash
   gh release create v3.0.0 --title "v3.0.0" --notes-file <the 3.0.0 CHANGELOG section>
   ```

   Link the docs site and the migration page.

5. **Publish the editor.** Set its peer and devDependency to `fig-tree-evaluator ^3.0.0`, add its CHANGELOG `## [3.0.0]`, then run `pnpm release` and pick `3.0.0`. Tag its last 1.x on npm too:

   ```bash
   npm dist-tag add fig-tree-editor-react@1.0.1 v1
   ```

   Create its GitHub release.

6. **Update the docs site.** In `docs-site/package.json`, set `fig-tree-editor-react` to `^3.0.0`, then run `pnpm install`. Remove the release-candidate banner. Merge to `main`, which redeploys the site. Check the install snippets on the site say plain `npm install fig-tree-evaluator`.
7. **Check what users see:**
   - the npm pages for both 3.0.0 releases;
   - the live site;
   - a fresh `npm install fig-tree-evaluator` gives 3.0.0;
   - `npm install fig-tree-evaluator@v2` gives 2.23.2.
8. **Mark Phase 18 done** in the implementation plan, and close #240 (V3 Docs).
9. **Announce,** if you want to.

---

## 9. Afterwards

- **Delete merged branches.**
  - Evaluator: `v3.0-dev`, `v3.0-docs`, `docs-playground-improvements`, `v3.0-doc-analysis-update` (memory notes a backup branch to delete), `v3-logo`, `232-dollar-key-errors`, `243-operator-catalog` and `281-non-recursive-format`. All but the docs branches are already fully merged.
  - Editor: its `v3.0-dev`.

  Check each first:

  ```bash
  git branch -r --merged origin/main
  ```

- **Remove `v3.0-dev` from every remaining place.** Stage 6.5 has the list. Run `git grep v3.0-dev` once more. Specs that link to `/v2-src` files will have dead links after 2.5, which is acceptable in historical specs. Fix any in pages people still read.
- **Retire the published artifacts.** The "FigTree v3 by Example", "Operators" and "From First Principles" artifacts (index in [artifacts.md](artifacts.md), copies in `docs-artifacts/`) are superseded by the site. Republish each with a line pointing to the site, or delete them. Then trim `docs-artifacts/` and `artifacts.md`.
- **Open issues for anything parked.** The Phase 18 item "Review the parked items" currently finds nothing parked. Recheck, and make sure every "after 3.0" issue from 1.5 is labelled for 3.x.
- **Downstream apps** still on v2, which stay there safely, since their `^2` ranges never pick up 3.x:
  - Conforma (`conforma-web-app`);
  - `jsonforms-with-figtree-demo`, which is linked from the Playground's form example blurb (`playground/blurbs/form.md`).

  Migrating them is its own work. Until the jsonforms demo is on v3, decide whether that blurb link stays.

- **Update the memory notes** that describe pre-release mechanics: the v3 implementation progress, the docs plan, and the `<SourceLink>` branches.

---

## Where the Phase 18 checklist went

| Phase 18 item                              | Here                                                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Cut `v2.x` from `main`                     | 6.1                                                                                                                                        |
| Merge `v3.0-dev` into `main`               | 6.3                                                                                                                                        |
| Rewrite the README for v3                  | Done on `v3.0-docs` (the short README); placeholders in 7.4. Its sub-items (`get`'s `from`, `match` keys, `$error`) moved to the site: 3.3 |
| Generated operator reference in the README | Superseded: the site's `/reference/operators/` is generated from the catalog                                                               |
| A guide to `defineOperator()`              | Done: the site's Custom operators chapter                                                                                                  |
| Point each operator's `docUrl`             | 7.4                                                                                                                                        |
| Write the migration guide                  | Done: `migrating.mdx`. This settles v3-migration.md's open Q1, which can be marked resolved                                                |
| Write the 3.0.0 CHANGELOG entry            | Before 7.1 (1.4)                                                                                                                           |
| Hand-migrate the complex expressions       | 2.4                                                                                                                                        |
| Retire the v2 assets                       | 2.5                                                                                                                                        |
| Refresh CLAUDE.md                          | 2.6                                                                                                                                        |
| Key order                                  | 2.1                                                                                                                                        |
| Where a subpath's types export from        | 2.2                                                                                                                                        |
| Review the parked items                    | 9                                                                                                                                          |
| Publish 3.0.0                              | 8.2                                                                                                                                        |
| Tag the last 2.x as `v2`                   | 8.3                                                                                                                                        |
| Release the ported editor                  | 4, 7.2, 8.5                                                                                                                                |
