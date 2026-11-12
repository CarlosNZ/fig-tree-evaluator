/**
 * The recorder for `pnpm messages`, run before each test file: `__msg`,
 * which the transform wraps around every message in src/, notes the text
 * each one produces and the test it came from, and passes the text on.
 * After the file's tests, `flush` writes what was noted to a file of its
 * own under out/raw/, which index.ts reads.
 */
const { mkdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { randomUUID } = require('node:crypto')

const RAW = join(__dirname, 'out', 'raw')

/** id → text → { count, test } (the first test to produce the text) */
const seen = new Map()

/**
 * Bounds on what one test file keeps of a string: an assembly on a hot
 * path can make thousands of distinct texts, and the page needs a few
 */
const MAX_TEXTS = 100
const MAX_LENGTH = 4000

globalThis.__msg = (id, value) => {
  const text = String(value).slice(0, MAX_LENGTH)
  let texts = seen.get(id)
  if (texts === undefined) seen.set(id, (texts = new Map()))
  const entry = texts.get(text)
  if (entry !== undefined) entry.count++
  else if (texts.size < MAX_TEXTS) {
    const state = globalThis.expect?.getState?.()
    texts.set(text, { count: 1, test: state?.currentTestName ?? null })
  }
  return value
}

globalThis.__msgFlush = (testPath) => {
  if (seen.size === 0) return
  const record = {
    testPath,
    messages: [...seen].map(([id, texts]) => ({
      id,
      texts: [...texts].map(([text, { count, test }]) => ({ text, count, test })),
    })),
  }
  mkdirSync(RAW, { recursive: true })
  writeFileSync(join(RAW, `${randomUUID()}.json`), JSON.stringify(record))
}
