# Logo generator

Builds every file in [images/logo/](../../images/logo/) from code: the lockup (tree graph plus wordmark) in light and dark, the icon and its variants, the favicons, the app tile and the social preview.

- [geometry.mjs](geometry.mjs) — tapered strokes along cubic Béziers, and the ring and dot nodes.
- [marks.mjs](marks.mjs) — the two drawings: the lockup's tree graph and the stand-alone icon, with all their coordinates.
- [build.mjs](build.mjs) — outlines the wordmark text, applies the colours and writes the files.

Colours, the background-word opacity, the root's reach and the spacing below are constants at the top of their sections in `build.mjs`. Shapes and proportions live in `marks.mjs`.

## Changing the fonts

The two fonts are loaded by file name near the top of `build.mjs`: `headFont` for **fig**, **tree** and **evaluator**, and `dimFont` for the background words. Put any replacement `.ttf` in `.cache/` and change the name. Everything that depends on the fonts is measured from them:

- each background word's width, so the lines start where they should and every node lands at the start of its line;
- the width of **fig**, so *uration* follows it directly;
- each font's x-height, so every node sits level with the middle of the lowercase letters of the word it leads into.

`SIZE` sets the type size for both fonts, `BASELINES` and `COLUMN` in `marks.mjs` set the line spacing and the headline column, and the canvas is fitted to whatever results.

## Spacing

Each file is fitted to the drawing's actual bounds, with the spacing its use calls for:

- **Master icon files** (`figtree-icon*.svg`, `figtree-icon-512.png`): a hairline margin of 3%. Whoever places the icon decides the spacing around it.
- **Favicons** (`favicon.svg`, `favicon-16.png`, `favicon-32.png`): edge to edge, keeping only the half pixel at 16px that anti-aliasing needs.
- **App tile** (`figtree-tile.svg`, `apple-touch-icon.png`, `figtree-tile-512.png`): a full-bleed square with no rounded corners, because iOS and Android apply their own masks and iOS fills transparent corners with black. The drawing's taller side takes 83% of the tile, which is as large as it goes while the corner nodes stay inside iOS's rounded mask.
- **Every square** (icons, favicons, tile): the drawing sits left of centre: a quarter of its left-hand gap moves to the right, leaving the left gap three-fifths of the right one. The arms and nodes spread to the right, so a centred drawing looks pushed against the right edge.
- **Lockup** (`figtree-logo*.svg`): 2 units of margin on a 502-unit width, just enough that nothing touches the edge.
- **Social preview** (`figtree-social.*`, GitHub's 1280×640): the lockup at 80% of the width, which keeps it clear of the slight edge crops Slack, X and LinkedIn apply.

## Setup

The build needs two fonts and opentype.js in `codegen/logo/.cache/`, which git ignores, and `rsvg-convert` on the PATH for the PNGs (`brew install librsvg`).

```bash
mkdir -p codegen/logo/.cache
```

```bash
curl -L -o codegen/logo/.cache/JetBrainsMono-ExtraBold.ttf https://raw.githubusercontent.com/JetBrains/JetBrainsMono/master/fonts/ttf/JetBrainsMono-ExtraBold.ttf
```

```bash
npm install --prefix codegen/logo/.cache --no-save --no-package-lock opentype.js@1.3.4
```

IBM Plex Sans Condensed Regular is read from `.cache/` or, failing that, from the system font folders. Its file can be named `IBMPlexSans_Condensed-Regular.ttf` (Google Fonts) or `IBMPlexSansCondensed-Regular.ttf` (IBM's release).

## Build

```bash
node codegen/logo/build.mjs
```

The build also writes previews to `codegen/logo/preview/`, which git ignores. Each shows a file on the background it's made for (white, GitHub dark or leaf green), filling exactly the file's own canvas so its real edges are visible. The tile is shown clipped to iOS's rounded mask. `preview/sheet.svg` puts them all on one page, with the favicon at its real sizes too.

The line positions are measured from the installed Plex Condensed, so each node lands exactly where its line of the wordmark starts. A different version of the font may shift the nodes by a fraction of a unit.
