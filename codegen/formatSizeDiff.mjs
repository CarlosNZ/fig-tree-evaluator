#!/usr/bin/env node
/**
 * Renders the PR bundle-size comment from two `bundleSize.mjs --json`
 * measurements. Used by .github/workflows/pr-bundle-size.yml; adapted from the
 * equivalent in CarlosNZ/json-edit-react, reduced to this package's single
 * bundle and extended with brotli, which is the figure v3 tracks
 * (docs-dev/v3-specs/v3-implementation-plan.md).
 *
 * Reads two files and writes markdown to stdout — no git, no network, so it
 * runs identically on a laptop and in CI.
 */
import { readFileSync } from 'node:fs'

const [baseFile, prFile] = process.argv.slice(2)
if (!baseFile || !prFile) {
  process.stderr.write('Usage: formatSizeDiff.mjs <base-sizes.json> <pr-sizes.json>\n')
  process.exit(1)
}

const read = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    // A base that failed to build or predates the bundle: every row shows as
    // new rather than taking the whole comment down
    return []
  }
}

const base = read(baseFile)
const pr = read(prFile)

const kB = (bytes) => `${(bytes / 1000).toFixed(2)} kB`

/** Signed kB, for a delta column where the sign carries the meaning. */
const deltaKB = (bytes) => `${bytes > 0 ? '+' : bytes < 0 ? '−' : ''}${kB(Math.abs(bytes))}`

/**
 * Deltas are only worth a colour when they are worth a look. A handful of
 * bytes is minifier noise, so the threshold keeps routine PRs quiet instead
 * of decorating every one with a red triangle.
 */
const NOISE_FLOOR_BYTES = 50

const delta = (before, after) => {
  if (before === undefined) return '🆕 new'
  const diff = after - before
  if (diff === 0) return '⚪ —'
  const pct = before === 0 ? 0 : (diff / before) * 100
  const marker = Math.abs(diff) < NOISE_FLOOR_BYTES ? '⚪' : diff > 0 ? '🔺' : '🟢'
  return `${marker} ${deltaKB(diff)} (${diff > 0 ? '+' : '−'}${Math.abs(pct).toFixed(2)}%)`
}

const byPath = (rows) => new Map(rows.map((row) => [row.path, row]))
const baseRows = byPath(base)

const lines = ['## Bundle size impact', '']

if (pr.length === 0) {
  lines.push('_No bundle was measured — the build produced no output._')
  process.stdout.write(lines.join('\n') + '\n')
  process.exit(0)
}

lines.push('| File | Metric | Base | This PR | Δ |', '|---|---|---:|---:|---:|')

for (const row of pr) {
  const before = baseRows.get(row.path)
  if (row.missing) {
    lines.push(`| \`${row.label}\` | — | — | ⚠️ not built | — |`)
    continue
  }
  // Types are shipped uncompressed, so compressing them here would report a
  // number no consumer ever downloads
  const isTypes = row.path.endsWith('.d.ts')
  const metrics = isTypes ? ['raw'] : ['raw', 'gzip', 'brotli']
  // All three metrics describe the same already-minified artifact at
  // different transfer encodings — naming the first one "minified" invites
  // reading it as the only minified figure
  const names = { raw: 'uncompressed', gzip: 'gzip', brotli: 'brotli' }
  metrics.forEach((metric, index) => {
    const had = before && !before.missing ? before[metric] : undefined
    lines.push(
      `| ${index === 0 ? `\`${row.label}\`` : ''} | ${names[metric]} | ` +
        `${had === undefined ? '—' : kB(had)} | ${kB(row[metric])} | ${delta(had, row[metric])} |`
    )
  })
}

lines.push(
  '',
  '<sub>Measured by `codegen/bundleSize.mjs`, the same code that prints the report at the ' +
    'end of `pnpm build`. gzip at level 9, brotli at quality 11. Deltas under ' +
    `${NOISE_FLOOR_BYTES} B are treated as minifier noise. Run \`pnpm size\` locally for ` +
    'the per-module breakdown.</sub>'
)

process.stdout.write(lines.join('\n') + '\n')
