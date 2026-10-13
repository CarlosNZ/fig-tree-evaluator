# FigTree docs site

The FigTree v3 documentation site, built with [Starlight](https://starlight.astro.build) (Astro). It is in early construction: a home page, the operator reference, skeleton pages for every other section (each heading noting what it will cover), and a **Prototype** page (`src/content/docs/prototype.mdx`, at `/prototype/`, out of the sidebar and search) holding one example of each kind of element proposed in [docs-dev/doc-planning.md](../docs-dev/doc-planning.md).

This folder is a self-contained package, with its own `package.json` and lockfile. It isn't part of a pnpm workspace, so the library's install, tests and CI never touch it.

## First-time setup

The site uses two packages through local `link:` dependencies, and both must be built before the site can import them.

1. **The library** (this repo), linked as `fig-tree-evaluator: link:..`. It resolves through the package's `exports`, so the site sees `build/`, exactly as a consumer would. From the repo root:

   ```sh
   pnpm install
   pnpm build
   ```

2. **The editor**, [fig-tree-editor-react](https://github.com/CarlosNZ/fig-tree-editor-react) on its `v3.0-dev` branch, linked as `link:../../fig-tree-editor-react`. That means it is checked out next to this repo (`~/GitHub/fig-tree-editor-react` beside `~/GitHub/fig-tree-evaluator`). It has no published v3 release yet, so the local link stands in until it does.

   ```sh
   cd ../fig-tree-editor-react   # relative to the repo root
   git checkout v3.0-dev
   pnpm install
   pnpm build
   ```

3. **The site's own dependencies.** From `docs-site/`:

   ```sh
   pnpm install
   ```

## Viewing and building

Run these from `docs-site/`:

| Command        | What it does                                                                |
| -------------- | --------------------------------------------------------------------------- |
| `pnpm dev`     | Dev server with hot reload, at http://localhost:4321                        |
| `pnpm build`   | Static build into `dist/`, including the Pagefind search index              |
| `pnpm preview` | Serves `dist/` at http://localhost:4321, to check a build before publishing |
| `pnpm check`   | Type-checks the site's `.astro`, `.ts` and `.tsx` files                     |

Astro 7 runs `dev` and `preview` as background servers, so the command returns straight away. Stop them with `pnpm astro dev stop` or `pnpm astro preview stop`; `pnpm astro dev logs` shows the dev server's output. Add `--port <n>` to use another port.

**After changing the library or the editor,** rebuild that package (`pnpm build` in it). A running dev server picks up the new build; restart it if it doesn't.

**The build is also a test.** It fails if:

- an expression example throws, when it doesn't say it should;
- an example marked `throws` doesn't throw;
- a TypeScript snippet doesn't compile against the library's types;
- an `<OperatorReference>` names an operator that isn't registered;
- an operator note names an operator or parameter that doesn't exist, or its replacement no longer matches the text it was written against.

## Layout

```
docs-site/
  astro.config.mjs          Starlight + React, and Vite's dedupe for the linked packages
  ec.config.mjs             Expressive Code plugins (twoslash)
  tsconfig.twoslash.json    compiler options twoslash checks snippets with
  twoslash/globals.d.ts     globals every snippet can use without setting them up
  src/
    content.config.ts       the content collections: the pages, and the operator notes
    routeData.ts            Starlight route middleware: the operators page's contents list
    content/
      docs/                 the pages: index.mdx (home), playground.mdx, prototype.mdx, a folder per section
      operator-notes/       the docs' own notes on operators, one optional file each
    components/
      Callout.astro           the callout kinds (note, tip, caution, danger, v2, why), over Starlight's <Aside>
      Expression.astro        static expression block, evaluated at build time
      ExpressionTree.astro    an expression drawn as a tree, each node's result evaluated at build time
      TreeItem.astro          one entry in that tree, with its children
      OperatorReference.astro reference entries: the operators page, or a chosen few
      OperatorEntry.astro     one operator's entry
      playground/
        Playground.tsx        the island a page mounts; lazy-loads the widget
        PlaygroundWidget.tsx  the two-pane widget
        ExpressionEditor.tsx  the island that opens an expression block as a widget
        EvaluationToast.tsx   the tree editor's evaluation toasts
        ResultValue.tsx       how a result is shown
        Json5Editor.tsx       the CodeMirror JSON5 pane
    lib/                    the shared FigTree instance and catalog, JSON5, link encoding, notes
    styles/custom.css       the site's styles (classes use the `fds-` prefix)
```

## Writing examples

**Expressions** are written as JSON5 source, so they can carry comments. Their result is computed when the site builds:

```mdx
<Expression
  title="Decide something"
  code={`
    { '$?': ['$data.ok', 'yes', 'no'] }
  `}
  data={`{ ok: true }`}
/>
```

Set `throws` on an example that shows an error. "Open in editor" turns the block into a widget where it stands, and "Close editor" turns it back. The link's address loads the example into the page's main widget instead (id `playground`, or `editor="<id>"`), for a new tab or a shared link. `editor={false}` leaves the link out, for an example that doesn't suit an editor.

**Widgets** are kept for examples where interaction teaches something:

```mdx
<Playground client:visible id="fallbacks" expression={`{ $divide: [1, 0], fallback: 0 }`} />
```

`readFromUrl` makes a widget load the example that an "open in editor" link's address carries. On the page a widget keeps to the content column, with a shrunken preview of the tree beside the code; "Expand editor" opens both editors full size.

**Reference entries:** `<OperatorReference all />` is the operators page, every operator by category. Any other page can show a few: `<OperatorReference names={['plus', 'if']} />`, with `showCategory` to label each one's category.

**Operator notes** add the docs' own text to the catalog's short descriptions, in `src/content/operator-notes/<operator>.mdx`:

```mdx
---
description: "A sentence added after the operator's description."
parameters:
  condition:
    replace: "Text shown instead of the parameter's description."
    against: 7bd1b747
---

Longer notes, shown below the description. `<Expression>` works here.
```

A plain string adds; `replace` replaces, and `against` records the text it replaced (the build gives the value to use, and asks again when that text changes). Quote each text: YAML misreads an unquoted one that contains `: `.

**Host code** goes in `ts` (or `tsx`) blocks, and every one is type-checked against the library at build time (twoslash), with its types shown on hover:

- `fig`, an instance with the default options, needs no setup (`twoslash/globals.d.ts`). A snippet about setup (imports, constructor options) writes its own.
- Other setup that shouldn't be displayed goes above a `// ---cut---` line.
- An error the snippet means to show is declared with `// @errors: <code>`, and rendered.
- `//    ^?` under an identifier shows its type inline.
- A fragment that can't compile, such as a before-and-after diff, is marked `nocheck` (` ```ts nocheck `). Nothing checks it, so keep these few.

## Repo integration

- The root ESLint config ignores `docs-site/`; `pnpm check` here is its check.
- CI builds the site in its own workflow (`.github/workflows/docs.yml`) on any change to the library's source or the site, checking out the editor beside this repo as the setup above does.
- Root Prettier formats this folder's `.ts`, `.tsx`, `.mjs`, `.json` and `.md` files, but not `.mdx`: Prettier parses MDX as MDX 1 and breaks MDX 2+ JSX blocks.
