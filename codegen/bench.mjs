// The benchmark runner: `pnpm bench <name>…` runs each named bench/<name>.ts
// through tsx, in the order given; `pnpm bench all` runs every bench in
// listing order, one after another, so a full sweep is one command and the
// benches never contend with each other for the CPU. `pnpm bench list`
// prints what exists. Benches import BOTH engines, so they compile under
// tsconfig.bench.json rather than the v3 config — see that file for the
// one interop mapping it carries.
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

const args = process.argv.slice(2)

if (args.length === 0 || args[0] === 'list') {
  console.log('Usage: pnpm bench <name>… | all\n\nBenches:')
  const all = benches()
  const width = Math.max(...all.map(({ name }) => name.length))
  console.log(
    all.map(({ name, description }) => `  ${name.padEnd(width)}  ${description}`).join('\n')
  )
  process.exit(0)
}

const names = args.includes('all') ? available() : args
for (const name of names) {
  if (!existsSync(`${BENCH_DIR}/${name}.ts`)) {
    console.error(`No ${BENCH_DIR}/${name}.ts. Available: ${available().join(', ')}`)
    process.exit(1)
  }
}

// Sequential on purpose: two benches sharing the CPU would each measure
// the other. A heading per bench keeps a multi-bench transcript readable
// and pasteable into an issue as one Markdown document.
let failed = false
for (const name of names) {
  if (names.length > 1) console.log(`\n# ${name}\n`)
  const result = spawnSync(
    'tsx',
    ['--tsconfig', 'tsconfig.bench.json', `${BENCH_DIR}/${name}.ts`],
    {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    }
  )
  if (result.status !== 0) failed = true
}
process.exit(failed ? 1 : 0)
