// The dev runner: `pnpm dev [name]` runs src/dev/<name>.ts through tsx.
// With no name it runs the gitignored playground, copying it from
// playground_example.ts the first time. `pnpm dev list` prints what exists.
import { copyFileSync, existsSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const DEV_DIR = 'src/dev'
const HIDDEN = new Set(['inspect', 'demoOperators', 'playground_example'])

const available = () =>
  readdirSync(DEV_DIR)
    .filter((file) => file.endsWith('.ts'))
    .map((file) => file.slice(0, -3))
    .filter((name) => !HIDDEN.has(name))
    .sort()

const name = process.argv[2] ?? 'playground'

if (name === 'list') {
  console.log(available().join('\n'))
  process.exit(0)
}

if (name === 'playground' && !existsSync(`${DEV_DIR}/playground.ts`))
  copyFileSync(`${DEV_DIR}/playground_example.ts`, `${DEV_DIR}/playground.ts`)

const file = `${DEV_DIR}/${name}.ts`
if (!existsSync(file)) {
  console.error(`No ${file}. Available: ${available().join(', ')}`)
  process.exit(1)
}

const result = spawnSync('tsx', [file], { stdio: 'inherit', shell: process.platform === 'win32' })
process.exit(result.status ?? 1)
