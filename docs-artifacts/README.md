# docs-artifacts

Local copies of the supplementary documents published as Claude artifacts — the register of what exists, with links, is [docs-dev/artifacts.md](../docs-dev/artifacts.md).

Three ways a file lands here, all regenerable, so nothing in this folder is edited by hand:

- `pnpm generate:operators` builds [figtree-v3-operators.html](figtree-v3-operators.html) from the live operator definitions in [src/operators](../src/operators) plus the generator's own table of the ones whose definitions haven't landed yet. Run it after any phase that registers operators, then republish the artifact from the built file.
- **Asking Claude to read them.** Claude can read an artifact you own and hand back its raw HTML, which is how [figtree-v3-by-example.html](figtree-v3-by-example.html) and [figtree-from-first-principles.html](figtree-from-first-principles.html) got here. This is the route that works for anything published before its source was kept in the repo; page sources published from now on should live here in the first place, which makes fetching unnecessary.
- `pnpm artifacts:fetch` attempts an HTTP download of every artifact in the register. **It cannot currently succeed**: claude.ai answers a scripted request with a Cloudflare bot challenge (`cf-mitigated: challenge`) before authentication is even considered, so a `?sk=` share key and a session cookie are equally useless — the request never reaches the app. The script names that distinctly rather than saving a challenge page as though it were a document, and stays in the repo as the routine that should work if that ever changes. Saving the page by hand from a browser is the other reliable option.

Each file is self-contained — inline CSS, inline JS, inline data — so it opens in any browser with no server. Typefaces load from Google Fonts, so a file opened with no network falls back to the system serif, sans and mono.

The `.html` files are **version-controlled**, so they can be served from the repo as well as read locally — which is the way to give these pages a link that anyone can open, since the artifacts themselves cannot be shared outside the organization. `figtree-v3-operators.html` is regenerated rather than edited, so treat a diff in it as output; the other two are the only surviving copies of their pages and are the source.
