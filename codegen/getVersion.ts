/*
Extracts the current version no. from package.json and writes it to version.ts
so it can be accessed by the FigTree class.

Runs first in `pnpm build`.
*/
import { writeFileSync } from 'fs'
import pkg from '../package.json'

console.log('Adding package version:', pkg.version)

// The output is deliberately a pure function of package.json's version — no
// generation timestamp — so `pnpm build` leaves the tracked file untouched
// unless the version itself has changed.
const contents = `/**
 * AUTO-GENERATED — do not edit by hand.
 *
 * Written by codegen/getVersion.ts (\`pnpm getVersion\`) from the \`version\`
 * field of package.json; \`pnpm build\` regenerates it first. The value is
 * baked in as a constant rather than imported from package.json at runtime so
 * it stays inside tsconfig's \`rootDir: "src"\` and the whole package.json
 * isn't pulled into the bundle.
 */
export const version = '${pkg.version}'
`

writeFileSync('src/version.ts', contents)
