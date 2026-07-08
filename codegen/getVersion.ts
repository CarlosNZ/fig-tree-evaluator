/*
Extracts the current version no. from package.json and writes it to version.ts
so it can be accessed by the FigTree class.

This script should run automatically before build.
*/
import { writeFileSync } from 'fs'
import pkg from '../package.json'

console.log('Adding package version:', pkg.version)

const timestamp = new Date().toISOString()

const contents = `/**
 * AUTO-GENERATED — do not edit by hand.
 * Last generated: ${timestamp}
 *
 * Written by codegen/getVersion.ts (\`yarn getVersion\`) from the \`version\`
 * field of package.json; \`prebuild\` regenerates it before every build. The
 * value is baked in as a constant rather than imported from package.json at
 * runtime so it stays inside tsconfig's \`rootDir: "src"\` and the whole
 * package.json isn't pulled into the bundle.
 */
export const version = '${pkg.version}'
`

writeFileSync('src/version.ts', contents)
