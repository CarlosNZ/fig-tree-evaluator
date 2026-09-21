// The benchmark runner: `pnpm bench [name]` runs bench/<name>.ts through
// tsx. `pnpm bench list` prints what exists. Benches import BOTH engines,
// so they compile under tsconfig.bench.json rather than the v3 config —
// see that file for the one interop mapping it carries.
import { existsSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const BENCH_DIR = 'bench'
// Shared modules, not runnable benches.
const HIDDEN = new Set(['harness', 'shapes'])

const available = () =>
  readdirSync(BENCH_DIR)
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
    .map((file) => file.slice(0, -3))
    .filter((name) => !HIDDEN.has(name))
    .sort()

const name = process.argv[2]

if (name === undefined || name === 'list') {
  console.log('Usage: pnpm bench <name>\n\nBenches:')
  console.log(
    available()
      .map((entry) => `  ${entry}`)
      .join('\n')
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
