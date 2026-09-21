// The one list of runnable benches, shared by `pnpm bench` and
// `pnpm bench:browser`: every bench/*.ts, minus type declarations and the
// modules benches share rather than run. Each bench exports a one-line
// `description`; it is read out of the source text rather than imported,
// because importing a bench runs it.
import { readdirSync, readFileSync } from 'node:fs'

export const BENCH_DIR = 'bench'
const SHARED = new Set(['harness', 'shapes'])

export const available = () =>
  readdirSync(BENCH_DIR)
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
    .map((file) => file.slice(0, -3))
    .filter((name) => !SHARED.has(name))
    .sort()

/** A bench's `export const description = '…'`, or a clear failure. */
export const describe = (name) => {
  const source = readFileSync(`${BENCH_DIR}/${name}.ts`, 'utf8')
  // Prettier may put the string on the line after the `=`
  const match = source.match(/^export const description =\s*(['"`])(.*?)\1/m)
  if (!match) throw new Error(`${BENCH_DIR}/${name}.ts must export a one-line \`description\``)
  return match[2]
}

/** Every bench with its description, in listing order. */
export const benches = () => available().map((name) => ({ name, description: describe(name) }))
