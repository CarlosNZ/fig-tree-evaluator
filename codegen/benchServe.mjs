// Serves bench/browser/dist over HTTP so the module bundles can load —
// `node codegen/benchServe.mjs [port]`, default 8765. Static files only.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const root = 'bench/browser/dist'
const port = Number(process.argv[2] ?? 8765)
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' }

createServer(async (req, res) => {
  const requested = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname))
  const path = requested.endsWith('/') ? `${requested}index.html` : requested
  try {
    const body = await readFile(join(root, path))
    // Cross-origin isolation lifts Chrome's `performance.now()` clamp from
    // 100 µs to 5 µs; without it every row of a fast bench is quantized.
    res.writeHead(200, {
      'content-type': types[extname(path)] ?? 'application/octet-stream',
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-embedder-policy': 'require-corp',
    })
    res.end(body)
  } catch {
    res.writeHead(404)
    res.end('not found')
  }
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}`))
