// The benchmark runner: `pnpm bench [name]` runs bench/<name>.ts through
// tsx. `pnpm bench list` prints what exists. Benches import BOTH engines,
// so they compile under tsconfig.bench.json rather than the v3 config —
// see that file for the one interop mapping it carries.
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { BENCH_DIR, available, benches } from './benchList.mjs'

// Benchmarks are only comparable on one runtime, and `engines` names it.
// Node 20's AbortController is roughly seven times slower than Node 22's,
// which alone moves v3's per-node figures by half — so a number taken on
// an older Node is not a smaller version of the same measurement, it is a
// different one. Refuse rather than warn: a warning above a table gets
// cropped out of the table.
const major = Number(process.versions.node.split('.')[0])
if (major < 22) {
  console.error(`pnpm bench needs Node >= 22 (engines); this is ${process.version}. Try: nvm use`)
  process.exit(1)
}

const name = process.argv[2]

if (name === undefined || name === 'list') {
  console.log('Usage: pnpm bench <name>\n\nBenches:')
  const all = benches()
  const width = Math.max(...all.map(({ name }) => name.length))
  console.log(
    all.map(({ name, description }) => `  ${name.padEnd(width)}  ${description}`).join('\n')
  )
  process.exit(0)
}

const file = `${BENCH_DIR}/${name}.ts`
if (!existsSync(file)) {
  console.error(`No ${file}. Available: ${available().join(', ')}`)
  process.exit(1)
}

const result = spawnSync('tsx', ['--tsconfig', 'tsconfig.bench.json', file], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
process.exit(result.status ?? 1)
