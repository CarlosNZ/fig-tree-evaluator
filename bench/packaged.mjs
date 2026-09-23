// `pnpm bench --packaged`: loaded with `--import` after tsx's own loader, it
// redirects the benches' one import of the v3 engine — `../src`, resolved
// by tsx to src/index.ts — to the built package, build/index.js. So the
// same bench files measure v3 as a host installs it (one minified bundle)
// rather than as tsx compiles it from source, and nothing else changes:
// the v2 arm and the harness's other imports resolve as before.
import { register } from 'node:module'

register('./packagedResolve.mjs', import.meta.url)
