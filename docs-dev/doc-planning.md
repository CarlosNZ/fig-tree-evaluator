# v3 public docs: planning

_Status: **Draft**, from a discussion between Carl and Claude, October 2026. Nothing here is ruled yet. The open questions are listed at the end._

## Direction

v3 gets a docs site with multiple linked pages, plus a short README that points into it. The v2 approach, one README that holds everything (2,222 lines), doesn't scale to v3.

### Why not one README

- **Too many audiences.** v2 was written for roughly one kind of reader. v3 has at least five:
  - authors writing expressions
  - hosts integrating the evaluator (options, fallbacks, HTTP/SQL clients, `compile` / `inspect` / trace)
  - developers writing custom operators with `defineOperator`
  - tool builders using `./format`, `./authoring` and `./editor-hints`
  - users migrating from v2

  In one file, each reader scrolls past everything the others need. A v3 README written that way would likely pass 3,500 lines.

- **Reference and guide are different kinds of reading.** The operator reference is looked up, so it wants search and a page per group. Fallbacks or null policy are read in order. A single page serves both badly.
- **The migration guide is temporary.** It matters for about a year and then rarely. On its own page it doesn't take up permanent space in the main doc.

## Shape

### README

About 150 lines. It is also the npm page, so it covers basic usage completely in short form, and everything deeper lives on the site:

- what FigTree is
- install
- one worked example
- links into the site's main sections

The v2 docs stay where they are, as the README on the `v2.x` branch. The site doesn't need built-in versioning.

### Site sections

- **Concepts:** nodes, evaluation, the shorthand forms
- **Guides:** options, fallbacks and errors, fragments and aliases, I/O clients, caching, `compile` / `inspect` / trace
- **Operator reference:** generated (see "Generated operator reference" below)
- **Custom operators:** `defineOperator` and the operator contract
- **Tooling subpaths:** `./format`, `./authoring`, `./editor-hints`
- **Migrating from v2:** the converter, `migrateV2Expression`, and what it can't do mechanically

### Seed material

- The three published pages in [docs-artifacts/](../docs-artifacts/) (see [artifacts.md](artifacts.md)): _FigTree v3 by Example_, _FigTree From First Principles_ and _FigTree v3 Operators_. Between them they cover much of the Concepts and Guides content.
- The specs in [v3-specs/](v3-specs/), for accuracy rather than tone.

## Tooling: Starlight

[Starlight](https://starlight.astro.build) is an Astro theme made for docs. It has these built in:

- sidebar, contents list, previous/next and "edit this page" links
- Pagefind search
- dark mode
- Expressive Code for code blocks (titles, tabs, line highlighting)
- MDX

It runs on Node and pnpm, as this repo already does.

Its main advantage for this project is that **Astro runs TypeScript at build time, and pages can include React islands.** That makes three things straightforward:

- examples evaluated by the library itself when the site is built
- a reference rendered directly from `coreDefinitions`
- `fig-tree-editor-react` embedded in pages

### Compared with Zola

[Zola](https://www.getzola.org) is a single Rust binary: no dependencies, very fast builds and Tera templates. It is a general static site generator, though:

- the docs features (sidebar, search UI, page navigation) come from a third-party theme or have to be built by hand
- it can't run JavaScript, so the generated reference would need a separate Node script writing JSON for Tera's `load_data`
- the editor would have to be bundled separately and added through a shortcode

Its main advantage, not needing Node, doesn't help here, because the repo already uses Node. Its main gap, no JS at build time, is exactly where the site's most useful features are. Zola would be the better choice for purely written docs with static examples that need little upkeep.

**Starlight's costs:**

- a heavy `node_modules`
- Astro moves quickly, so major-version upgrades come up every so often
- builds take seconds rather than milliseconds, which doesn't matter at this size

### Prior art: Biome

[biomejs.dev](https://biomejs.dev) ([source](https://github.com/biomejs/website)) is the closest existing match. It is Starlight with `@astrojs/react` and MDX:

- **Reference generated from source.** Each lint-rule page (for example `src/content/docs/en/linter/rules/no-access-key/javascript.mdx`) is generated from the rule's own metadata in the main repo, and starts with a "don't edit by hand" header.
- **A React playground in the same site.** `src/playground/Playground.tsx` is a CodeMirror editor running Biome compiled to WebAssembly, mounted at `src/pages/playground.astro`. FigTree is already TypeScript, so its playground can import the library directly, with no WASM step.
- **Reference linked to the playground.** `RulePlaygroundLink.astro` encodes an example's code and settings into a playground URL, so any example on a rule page opens in the playground with that rule turned on.

Biome's rule-page examples are static code blocks with an "open in playground" link, not editors on the page.

## Generated operator reference

Names, aliases, descriptions, parameters, types and null policies are all on each definition in `coreDefinitions`, so the reference pages are rendered from them and can't drift from the code. `pnpm generate:operators` already does this for the _FigTree v3 Operators_ artifact, so the site's version is the same data with a different renderer.

## Examples

### Host code: code blocks

Code that runs in the host goes in ordinary code blocks with Expressive Code titles and tabs. That covers constructing a `FigTree`, options, `defineOperator`, the subpaths and the converter.

### Expressions: two tiers

1. **Static expression block** (the default). Syntax-highlighted, with its result **evaluated at build time** and shown underneath, plus an "open in editor" link. Because the output is computed rather than typed, a documented result can't be wrong. This is Biome's pattern.
2. **Interactive widget** (where interaction teaches something). Fallbacks, the shorthand forms and null handling are the obvious candidates. These are kept to the examples that earn them, since each one is a React island to load.

[astro-live-code](https://github.com/mattjennings/astro-live-code), which renders MDX code blocks as live components and works with Starlight, is an option to evaluate for tier 1 or tier 2.

### The two-pane widget

- **Left:** a CodeMirror JSON editor. JSON is how users store expressions.
- **Right:** `<FigTreeEditor expression={expr} setExpression={setExpr} />`. The editor is already a controlled component.
- **Below:** the evaluated result.

Both panes read and write the same React state.

#### Keeping the panes in sync

The only tricky part is the text pane, because half-typed JSON doesn't parse.

- The left pane keeps its own text. On each edit, if the text parses, it updates the shared state. If it doesn't, the pane shows the parse error and leaves the state alone.
- When the state changes from the right, the left pane re-renders its text only if its current text doesn't already parse to the same value. That avoids update loops, and avoids resetting the cursor while someone is typing on the left.
- Evaluation runs on the shared state, debounced.

#### Extras

- **Form toggle.** A "shorthand / full" switch on the left pane rewrites the shared state through `toShorthand` / `toCanonical` from `./format`. Showing that the forms are equivalent is hard in prose and takes one click here.
- **Data pane.** Most real examples read `$data.…`, so the widget takes an optional data input, perhaps as a tab beside the result. The MDX provides its starting value along with the expression.
- **Narrow screens.** The panes collapse into tabs when there isn't room for both side by side.
- **Lazy loading.** Each widget is mounted with `client:visible`, so a page with several widgets loads the editor only when a reader scrolls to one.

## Dependencies

- **The v3 editor.** `fig-tree-editor-react`'s `main` branch depends on `fig-tree-evaluator ^2.23.2`. Its `v3.0-dev` branch has to be usable before the widget can be finished. A prototype can use it through a local link (a pnpm workspace or `link:`) in the meantime.

## Open questions

1. **Where the site lives.** Options: a `site/` folder (or `docs/`, which today holds only `img/`) set up as a pnpm workspace package, so its dependencies stay out of the library's `devDependencies`. Or a separate repo. In-repo keeps docs changes in the same PRs as the code they describe.
2. **Hosting and URL.** GitHub Pages through a GitHub Action is the default. The v2 README's playground link points to `carlosnz.github.io/fig-tree-evaluator`, so check what is served there and whether anything else still links to it.
3. **The left pane's format.** Plain JSON, or JSON5 so examples can carry comments?
4. **Checking host-code examples.** Expression examples are covered by build-time evaluation. Host-code blocks could be type-checked (or run) in CI too, so they can't drift either.
5. **Repo docs to update when this lands:** `CLAUDE.md` calls the README "the authoritative reference for every operator", and `package.json`'s `homepage` points to the README.

## Next step

A prototype: a bare Starlight skeleton with one page holding the two-pane widget, linked to the editor's `v3.0-dev` branch, and one reference page rendered from `coreDefinitions`.
