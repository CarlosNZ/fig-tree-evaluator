# FigTree docs site

The FigTree v3 documentation site, built with [Starlight](https://starlight.astro.build) (Astro). It is currently a **prototype**: a single page holding an overview and one example of each kind of element proposed in [docs-dev/doc-planning.md](../docs-dev/doc-planning.md).

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
- a twoslash snippet doesn't compile against the library's types;
- an `<OperatorReference>` names an operator that isn't registered.

## Layout

```
docs-site/
  astro.config.mjs          Starlight + React, and Vite's dedupe for the linked packages
  ec.config.mjs             Expressive Code plugins (twoslash)
  tsconfig.twoslash.json    compiler options twoslash checks snippets with
  src/
    content/docs/index.mdx  the page
    components/
      Expression.astro        static expression block, evaluated at build time
      OperatorReference.astro reference entries from the operators' definitions
      playground/
        Playground.tsx        the island a page mounts; lazy-loads the widget
        PlaygroundWidget.tsx  the two-pane widget
        Json5Editor.tsx       the CodeMirror JSON5 pane
    lib/                    the shared FigTree instance, JSON5 printing, link encoding
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

Set `throws` on an example that shows an error. Each example links to the page's widget (id `playground`); pass `editor="<id>"` to target a different one.

**Widgets** are kept for examples where interaction teaches something:

```mdx
<Playground client:visible id="fallbacks" expression={`{ $divide: [1, 0], fallback: 0 }`} />
```

`readFromUrl` makes a widget load the example that an "open in editor" link carries. A page with widgets turns off its contents column (`tableOfContents: false`), which gives the widgets the column's full width. Below 760px they switch to tabs.

**Reference entries:** `<OperatorReference names={['plus', 'if']} />`.

**Host code** goes in ordinary fenced blocks. Add `twoslash` to a `ts` block's meta to type-check it against the library at build time, and to show types on hover. Setup that shouldn't be displayed goes above a `// ---cut---` line. An error the snippet means to show is declared with `// @errors: <code>`.

## Repo integration

- The root ESLint config ignores `docs-site/`; `pnpm check` here is its check.
- Root Prettier formats this folder's `.ts`, `.tsx`, `.mjs`, `.json` and `.md` files, but not `.mdx`: Prettier parses MDX as MDX 1 and breaks MDX 2+ JSX blocks.
