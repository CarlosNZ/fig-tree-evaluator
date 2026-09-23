/**
 * `pnpm release [--dry-run]` — cut and publish a release from this machine.
 *
 *  1. Asks for the next version, suggesting the likely ones. A pre-release is
 *     `X.Y.Z-beta.N` and publishes under the `beta` dist-tag, never `latest`.
 *  2. Stops unless CHANGELOG.md has a `## [X.Y.Z]` entry for it.
 *  3. Bumps package.json and regenerates src/version.ts.
 *  4. Runs what CI runs (.github/workflows/ci.yml): lint, format check,
 *     typecheck, tests, build, and the packaging checks.
 *  5. Commits the bump as `vX.Y.Z` and tags it (annotated, `vX.Y.Z`).
 *  6. Publishes with `npm publish --tag <dist-tag>`. npm rather than pnpm for
 *     the upload: npm prompts for a 2FA code itself, and applies no branch
 *     check of its own, so a beta can go out from a non-main branch.
 *
 * Nothing is pushed; the last line printed is the push command.
 *
 * `--dry-run` runs every step against the real version bump, but makes no
 * commit or tag, publishes with `npm publish --dry-run`, and puts
 * package.json and src/version.ts back as they were, even on failure. It
 * also only warns about uncommitted changes, where a real release refuses.
 *
 * The v2 line is released from its own maintenance branch, which does not
 * carry this script.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'

const DRY_RUN = process.argv.includes('--dry-run')
const PACKAGE = 'package.json'
const VERSION_FILE = 'src/version.ts'
const CHANGELOG = 'CHANGELOG.md'

/** The checks CI runs, in its order (.github/workflows/ci.yml). */
const CHECKS = ['lint', 'format:check', 'typecheck', 'test', 'build', 'check:package']

// ── Versions ───────────────────────────────────────────────────────────────

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/
const BETA = /^beta\.(\d+)$/

const parse = (text) => {
  const match = SEMVER.exec(text)
  if (!match) return null
  const [, major, minor, patch, pre] = match
  return { major: +major, minor: +minor, patch: +patch, pre: pre ?? null }
}

const core = ({ major, minor, patch }) => `${major}.${minor}.${patch}`
const format = (v) => (v.pre ? `${core(v)}-${v.pre}` : core(v))
const betaNumber = (v) => (v.pre ? Number(BETA.exec(v.pre)?.[1] ?? NaN) : NaN)

const compareCore = (a, b) => a.major - b.major || a.minor - b.minor || a.patch - b.patch

/**
 * Semver precedence for the two shapes this script releases: a release
 * outranks its own betas, and betas order by number.
 */
const compare = (a, b) => {
  const byCore = compareCore(a, b)
  if (byCore !== 0) return byCore
  if (!a.pre || !b.pre) return (a.pre ? -1 : 0) - (b.pre ? -1 : 0)
  return betaNumber(a) - betaNumber(b)
}

/**
 * A current pre-release that is not a beta (`3.0.0-dev`) is a placeholder
 * that was never published, so any beta or release of the same version or
 * later follows it.
 */
const isPlaceholder = (v) => v.pre !== null && !BETA.test(v.pre)

const follows = (next, current) =>
  isPlaceholder(current) ? compareCore(next, current) >= 0 : compare(next, current) > 0

const suggestionsFor = (current) => {
  const { major, minor, patch } = current
  const v = (major, minor, patch, pre = null) => ({ major, minor, patch, pre })
  if (isPlaceholder(current)) return [v(major, minor, patch, 'beta.0'), v(major, minor, patch)]
  if (current.pre)
    return [v(major, minor, patch, `beta.${betaNumber(current) + 1}`), v(major, minor, patch)]
  return [
    v(major, minor, patch + 1),
    v(major, minor + 1, 0),
    v(major + 1, 0, 0),
    v(major, minor + 1, 0, 'beta.0'),
    v(major + 1, 0, 0, 'beta.0'),
  ]
}

const distTag = (v) => (v.pre ? 'beta' : 'latest')

// ── Shell ──────────────────────────────────────────────────────────────────

class ReleaseError extends Error {}

const run = (command, args, { capture = false } = {}) => {
  const result = spawnSync(command, args, {
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
  })
  if (result.status !== 0) throw new ReleaseError(`\`${[command, ...args].join(' ')}\` failed`)
  return capture ? result.stdout.trim() : ''
}

const tagExists = (tag) =>
  spawnSync('git', ['rev-parse', '--quiet', '--verify', `refs/tags/${tag}`]).status === 0

const step = (text) => console.log(`\n▸ ${text}`)

// ── The release ────────────────────────────────────────────────────────────

const chooseVersion = async (current) => {
  const suggestions = suggestionsFor(current)
  console.log(`Current version: ${format(current)}\n`)
  suggestions.forEach((v, i) => console.log(`  ${i + 1}) ${format(v)}${v.pre ? '  (beta)' : ''}`))
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  // Lines are read through the iterator, which buffers them, rather than
  // rl.question(), which drops input typed or piped ahead of the prompt and
  // never settles if input ends
  const lines = rl[Symbol.asyncIterator]()
  const ask = async (prompt) => {
    process.stdout.write(prompt)
    const { value, done } = await lines.next()
    if (done) throw new ReleaseError('no answer — input ended')
    return value.trim()
  }
  try {
    const answer = await ask('\nNext version (a number above, or type one): ')
    const picked = /^\d+$/.test(answer) ? suggestions[Number(answer) - 1] : parse(answer)
    if (!picked) throw new ReleaseError(`'${answer}' is neither a listed number nor a version`)
    if (picked.pre && !BETA.test(picked.pre))
      throw new ReleaseError(`a pre-release must be X.Y.Z-beta.N, not ${format(picked)}`)
    if (!follows(picked, current))
      throw new ReleaseError(`${format(picked)} does not follow the current ${format(current)}`)
    if (tagExists(`v${format(picked)}`))
      throw new ReleaseError(`the tag v${format(picked)} already exists`)
    const tag = distTag(picked)
    const branch = run('git', ['branch', '--show-current'], { capture: true })
    const confirm = await ask(
      `\n${DRY_RUN ? 'Dry run: release' : 'Release'} ${format(picked)} under the npm dist-tag "${tag}", from branch ${branch}? [y/N] `
    )
    if (!/^y(es)?$/i.test(confirm)) throw new ReleaseError('cancelled')
    return picked
  } finally {
    rl.close()
  }
}

const hasChangelogEntry = (version) => {
  const heading = new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\]`, 'm')
  return heading.test(readFileSync(CHANGELOG, 'utf8'))
}

const main = async () => {
  if (DRY_RUN) console.log('DRY RUN — no commit, no tag, and npm publish --dry-run\n')

  const dirty = run('git', ['status', '--porcelain'], { capture: true })
  if (dirty && !DRY_RUN)
    throw new ReleaseError('the working tree has uncommitted changes — commit or stash them first')
  if (dirty) console.log('Note: the working tree has uncommitted changes (allowed in a dry run)\n')

  const originalPackage = readFileSync(PACKAGE, 'utf8')
  const originalVersionFile = readFileSync(VERSION_FILE, 'utf8')
  const current = parse(JSON.parse(originalPackage).version)
  if (!current) throw new ReleaseError(`package.json's version is not semver`)

  const next = await chooseVersion(current)
  const version = format(next)
  const tag = `v${version}`

  if (!hasChangelogEntry(version))
    throw new ReleaseError(
      `CHANGELOG.md has no entry for ${version} — add a "## [${version}] - <date>" section first`
    )

  // A child receives Ctrl-C itself; ignoring it here lets the failed step
  // unwind through the restore below instead of exiting mid-release
  process.on('SIGINT', () => {})

  let committed = false
  const restore = () => {
    writeFileSync(PACKAGE, originalPackage)
    writeFileSync(VERSION_FILE, originalVersionFile)
  }
  try {
    step(`Bumping ${format(current)} → ${version}`)
    writeFileSync(PACKAGE, originalPackage.replace(/("version":\s*")[^"]*(")/, `$1${version}$2`))
    run('pnpm', ['getVersion'])

    for (const check of CHECKS) {
      step(`pnpm ${check}`)
      run('pnpm', [check])
    }

    if (!DRY_RUN) {
      step(`Committing and tagging ${tag}`)
      run('git', ['add', PACKAGE, VERSION_FILE])
      run('git', ['commit', '--quiet', '-m', tag])
      run('git', ['tag', '-a', tag, '-m', tag])
      committed = true
    }

    step(`npm publish --tag ${distTag(next)}${DRY_RUN ? ' --dry-run' : ''}`)
    run('npm', ['publish', '--tag', distTag(next), ...(DRY_RUN ? ['--dry-run'] : [])])
  } catch (error) {
    if (committed)
      console.error(
        `\nThe commit and tag ${tag} exist locally only. Fix the problem and run ` +
          `\`npm publish --tag ${distTag(next)}\`, or undo them with ` +
          `\`git tag -d ${tag} && git reset --soft HEAD~1\`.`
      )
    else if (!DRY_RUN) restore()
    throw error
  } finally {
    if (DRY_RUN) restore()
  }

  if (DRY_RUN)
    console.log(`\nDry run of ${version} complete; package.json and ${VERSION_FILE} restored.`)
  else
    console.log(
      `\nPublished ${version} under "${distTag(next)}". Push with:\n  git push && git push origin ${tag}`
    )
}

main().catch((error) => {
  console.error(`\n✖ ${error instanceof ReleaseError ? error.message : error.stack}`)
  process.exit(1)
})
