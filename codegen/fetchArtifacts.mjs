/**
 * Downloads every artifact listed in docs-dev/artifacts.md into
 * docs-artifacts/, so the published pages can be read offline.
 *
 * What it can and cannot reach: an artifact URL carrying a `?sk=…` share
 * key is readable without a session, a bare one is not — it resolves only
 * in its owner's signed-in browser, so an unauthenticated GET gets the
 * sign-in page. Rather than save that wall as though it were the document,
 * every response is classified and only a real standalone document is
 * written. Set CLAUDE_COOKIE to a browser session cookie to fetch bare
 * links as their owner; it is read from the environment and never written
 * anywhere.
 *
 * A register entry marked "generated locally" is skipped: its file is
 * built from this repo by `pnpm generate:operators`, and downloading the
 * published copy over it would overwrite the source of truth with its own
 * output.
 *
 * Recorded from the first real run (September 2026): claude.ai answers a
 * scripted GET with a Cloudflare bot challenge — `cf-mitigated: challenge`
 * — before any authentication is considered, so neither a share key nor a
 * session cookie makes this route work. It is kept because it is the
 * routine that *should* work and reports precisely why it does not; the
 * route that does work is to have Claude read each artifact (it can read
 * the ones you own and hand back the raw HTML) and write the file here,
 * or to save the page from a browser by hand.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, relative } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const REGISTER = resolve(here, '../docs-dev/artifacts.md')
const OUT_DIR = resolve(here, '../docs-artifacts')
const ROOT = resolve(here, '..')

/** Markdown list items whose link points at a claude.ai artifact. */
const parseRegister = (markdown) =>
  markdown
    .split('\n')
    .filter((line) => line.trimStart().startsWith('- '))
    .flatMap((line) => {
      const link = line.match(/\[([^\]]+)\]\((https:\/\/claude\.ai\/artifact\/[^)\s]+)\)/)
      if (!link) return []
      const [, title, url] = link
      return [{ title, url, skip: /generated locally/i.test(line), line }]
    })

const slug = (title) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * What came back. The two failure shapes are worth separating: a sign-in
 * page means the link needs a share key (or a cookie), while an app shell
 * means the link resolved but the document is rendered client-side and a
 * plain GET cannot see it.
 */
const classify = (body) => {
  if (/Sign in to view this page|<title>Sign in/i.test(body)) return 'signin'
  // A standalone artifact carries its own content: real markup, and enough
  // of it. The claude.ai app shell is short and mostly bootstrap script.
  const hasOwnContent = /<(style|section|article|main|table|h1|h2)\b/i.test(body)
  if (!hasOwnContent || body.length < 4096) return 'app-shell'
  return 'ok'
}

const fetchOne = async ({ title, url, skip }) => {
  const target = resolve(OUT_DIR, `${slug(title)}.html`)
  const shown = relative(ROOT, target)
  if (skip)
    return { title, status: 'skipped', detail: `${shown} is built by pnpm generate:operators` }

  let response
  try {
    response = await fetch(url, {
      redirect: 'follow',
      headers: {
        accept: 'text/html',
        ...(process.env.CLAUDE_COOKIE ? { cookie: process.env.CLAUDE_COOKIE } : {}),
      },
    })
  } catch (error) {
    return { title, status: 'failed', detail: `request failed — ${error.message}` }
  }

  if (!response.ok) {
    const challenged = response.headers.get('cf-mitigated') === 'challenge'
    return {
      title,
      status: 'failed',
      detail: challenged
        ? `HTTP ${response.status} — Cloudflare bot challenge: the request never reached the app, ` +
          'so no cookie or share key changes the outcome'
        : `HTTP ${response.status} ${response.statusText}`,
    }
  }

  const body = await response.text()
  const verdict = classify(body)
  if (verdict === 'signin')
    return {
      title,
      status: 'failed',
      detail: url.includes('?sk=')
        ? 'share key rejected — regenerate it from the artifact’s share menu'
        : 'bare link: needs a ?sk=… share key in the register, or CLAUDE_COOKIE set',
    }
  if (verdict === 'app-shell')
    return {
      title,
      status: 'failed',
      detail: `served the claude.ai app shell (${body.length} bytes), not the document itself`,
    }

  writeFileSync(target, body, 'utf8')
  return { title, status: 'saved', detail: `${shown} (${Math.round(body.length / 1024)} KB)` }
}

const main = async () => {
  const entries = parseRegister(readFileSync(REGISTER, 'utf8'))
  if (!entries.length) {
    console.error(`No artifact links found in ${relative(ROOT, REGISTER)}`)
    process.exit(1)
  }
  mkdirSync(OUT_DIR, { recursive: true })

  const results = await Promise.all(entries.map(fetchOne))
  const mark = { saved: '✓', skipped: '·', failed: '✗' }
  for (const { title, status, detail } of results) {
    console.log(`${mark[status]} ${title}\n    ${detail}`)
  }

  const failed = results.filter((r) => r.status === 'failed')
  const saved = results.filter((r) => r.status === 'saved').length
  console.log(
    `\n${saved} saved, ${results.length - saved - failed.length} skipped, ${failed.length} unreachable`
  )
  if (failed.length) process.exit(1)
}

main()
