// Bundles benches for a browser: `node codegen/benchBrowser.mjs <name>…`
// writes bench/browser/dist/<name>.js and a page that runs it. Serve the
// folder (codegen/benchServe.mjs) and open the page; results print to the
// console and to the page itself, so a driver can wait for `(sink`.
//
// Both engines bundle whole. The frozen v2 engine imports `pg` and
// `sqlite` by value, so those are aliased to bench/browser/nodeStubs.ts;
// everything `node:`-prefixed is left external — the shared code only
// reaches for it behind an "am I in Node" check that a browser never
// passes. ES module output over HTTP, not an IIFE over file://, because
// the harness uses top-level await and Chrome blocks module scripts from
// file:// URLs.
import { build } from 'esbuild'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The page a bundle runs in. The harness appends Markdown to the hidden
 * `#out`; the script below renders it into `#rendered` on every change.
 * The Markdown is a known subset — `###` headings, paragraphs, and tables
 * whose rule row marks right-aligned columns with `:` — so forty lines of
 * rendering beat a dependency. The raw text stays under a disclosure for
 * copying into an issue, and it is what a driver reads back.
 */
const page = (name) => `<!doctype html>
<meta charset="utf-8">
<title>bench: ${name}</title>
<style>
  body { margin: 24px; max-width: 1100px; font: 14px/1.5 system-ui, sans-serif; color: #1a1a1a }
  h1 { font-size: 20px } h3 { margin: 28px 0 4px } p { margin: 6px 0 12px; color: #444 }
  table { border-collapse: collapse; margin: 8px 0 16px; font: 13px/1.4 ui-monospace, monospace }
  th, td { padding: 4px 10px; border-bottom: 1px solid #ddd; white-space: nowrap }
  th { text-align: left; border-bottom: 2px solid #999 } td.n, th.n { text-align: right }
  tr:nth-child(even) td { background: #f6f6f6 }
  #status { color: #888; font-style: italic }
  details { margin-top: 24px } summary { cursor: pointer; color: #666 }
  pre { font: 12px/1.4 ui-monospace, monospace; background: #f6f6f6; padding: 12px; overflow: auto }
  #out { display: none }
</style>
<h1>${name}</h1>
<div id="status">running…</div>
<div id="rendered"></div>
<details><summary>Markdown</summary><pre id="raw"></pre></details>
<pre id="out"></pre>
<script>
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
  const cells = (line) => line.trim().slice(1, -1).split('|').map((c) => c.trim())
  const table = (lines) => {
    const [head, rule, ...body] = lines.map(cells)
    const align = rule.map((r) => (r.endsWith(':') ? ' class="n"' : ''))
    const row = (cs, tag) => '<tr>' + cs.map((c, i) => \`<\${tag}\${align[i]}>\${esc(c)}</\${tag}>\`).join('') + '</tr>'
    return '<table><thead>' + row(head, 'th') + '</thead><tbody>' + body.map((r) => row(r, 'td')).join('') + '</tbody></table>'
  }
  const render = (md) =>
    md.trim().split(/\\n{2,}/).map((block) => {
      const lines = block.split('\\n')
      if (lines[0].startsWith('### ')) return '<h3>' + esc(lines[0].slice(4)) + '</h3>'
      if (lines.length > 1 && lines.every((l) => l.trim().startsWith('|'))) return table(lines)
      return '<p>' + esc(block) + '</p>'
    }).join('')
  const out = document.getElementById('out')
  new MutationObserver(() => {
    const md = out.textContent
    document.getElementById('rendered').innerHTML = render(md)
    document.getElementById('raw').textContent = md.trim()
    if (md.includes('(sink')) document.getElementById('status').remove()
  }).observe(out, { childList: true, characterData: true, subtree: true })
</script>
<script type="module" src="./${name}.js"></script>
`

const names = process.argv.slice(2)
if (names.length === 0) {
  console.error('Usage: node codegen/benchBrowser.mjs <bench>…')
  process.exit(1)
}

const dist = 'bench/browser/dist'
mkdirSync(dist, { recursive: true })
const stub = resolve('bench/browser/nodeStubs.ts')

for (const name of names) {
  await build({
    entryPoints: [`bench/${name}.ts`],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    outfile: `${dist}/${name}.js`,
    external: ['node:*'],
    alias: { pg: stub, sqlite: stub },
    tsconfig: 'tsconfig.bench.json',
    logLevel: 'warning',
  })
  writeFileSync(`${dist}/${name}.html`, page(name))
  console.log(`built ${dist}/${name}.html`)
}
