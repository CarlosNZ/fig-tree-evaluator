// Bundles benches for a browser: `node codegen/benchBrowser.mjs <name>…`
// (or `all`) writes bench/browser/dist/<name>.js and a page that runs it,
// plus an index.html linking every page built. Serve the folder
// (codegen/benchServe.mjs) and open a page; results render on the page
// and print to its console, so a driver can wait for `(sink`.
//
// Both engines bundle whole. The frozen v2 engine imports `pg` and
// `sqlite` by value, so those are aliased to bench/browser/nodeStubs.ts;
// everything `node:`-prefixed is left external — the shared code only
// reaches for it behind an "am I in Node" check that a browser never
// passes. ES module output over HTTP, not an IIFE over file://, because
// the harness uses top-level await and Chrome blocks module scripts from
// file:// URLs.
import { build } from 'esbuild'
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { available, describe } from './benchList.mjs'

/**
 * The page a bundle runs in. The harness appends Markdown to the hidden
 * `#out`; the script below renders it into `#rendered` on every change.
 * The Markdown is a known subset — `###` headings, paragraphs, and tables
 * whose rule row marks right-aligned columns with `:` — so forty lines of
 * rendering beat a dependency. The raw text stays under a disclosure for
 * copying into an issue, and it is what a driver reads back.
 */
const page = (name, description) => `<!doctype html>
<meta charset="utf-8">
<link rel="icon" href="data:,">
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
<p>${description}</p>
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

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('Usage: node codegen/benchBrowser.mjs <bench>… | all')
  process.exit(1)
}
const names = args.includes('all') ? available() : args

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
  writeFileSync(`${dist}/${name}.html`, page(name, describe(name)))
  console.log(`built ${dist}/${name}.html`)
}

// One landing page over everything in dist, not just this build's names,
// so successive partial builds accumulate rather than replace the list.
const pages = readdirSync(dist)
  .filter((file) => file.endsWith('.html') && file !== 'index.html')
  .map((file) => file.slice(0, -5))
  .sort()
writeFileSync(
  `${dist}/index.html`,
  `<!doctype html>
<meta charset="utf-8">
<link rel="icon" href="data:,">
<title>benches</title>
<style>body{margin:24px;font:14px/1.6 system-ui,sans-serif} li{margin:4px 0}</style>
<h1>Benches</h1>
<p>Each page runs its bench on load; results render as it goes.</p>
<ul>${pages.map((name) => `<li><a href="./${name}.html">${name}</a> — ${describe(name)}</li>`).join('')}</ul>
`
)
console.log(`built ${dist}/index.html (${pages.length} pages)`)
