import { execFileSync } from 'node:child_process'

const REPO = 'https://github.com/CarlosNZ/fig-tree-evaluator'

/**
 * The branches a link can point to, most preferred first. A snippet links
 * to the first branch it's on, so a link to code still on v3.0-dev moves to
 * main on the first build after it's merged there.
 */
export const SOURCE_BRANCHES = ['main', 'v3.0-dev']

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()

/** Each file's lines on each branch, as the remote-tracking branch has it. */
const files = new Map<string, string[] | undefined>()

const linesOf = (branch: string, file: string): string[] | undefined => {
  const key = `${branch}:${file}`
  if (!files.has(key)) {
    try {
      const text = execFileSync('git', ['show', `origin/${key}`], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        maxBuffer: 16 * 1024 * 1024,
      })
      files.set(key, text.split('\n'))
    } catch {
      // Not on that branch, or the branch isn't fetched
      files.set(key, undefined)
    }
  }
  return files.get(key)
}

/** The 1-based numbers of the lines from `start` on that contain `snippet`. */
const linesWith = (lines: string[], snippet: string, start = 0): number[] =>
  lines.flatMap((line, index) => (index >= start && line.includes(snippet) ? [index + 1] : []))

/**
 * A GitHub link to the line of `file` (a path from the repo's root) that
 * holds `find`, on the first of SOURCE_BRANCHES it's on. `find` must be on
 * one line only, or, with `after`, the first line holding it after the one
 * line holding `after`: for a call that several operators make alike. The
 * line number is read from the branch linked to, so it's right there
 * whatever the working copy holds. Throws where there's no such line.
 */
export const sourceLink = (file: string, find: string, after?: string): string => {
  const problems: string[] = []
  for (const branch of SOURCE_BRANCHES) {
    const lines = linesOf(branch, file)
    if (lines === undefined) {
      problems.push(`${file} isn't on origin/${branch}`)
      continue
    }
    let start = 0
    if (after !== undefined) {
      const anchors = linesWith(lines, after)
      if (anchors.length !== 1) {
        problems.push(`'${after}' is on ${anchors.length} lines on origin/${branch}, not 1`)
        continue
      }
      start = anchors[0]
    }
    const found = linesWith(lines, find, start)
    if (after === undefined && found.length > 1)
      throw new Error(
        `'${find}' is on ${found.length} lines of ${file} on origin/${branch}: lengthen it, or give 'after'`
      )
    if (found.length > 0) return `${REPO}/blob/${branch}/${file}#L${found[0]}`
    problems.push(`'${find}' isn't in ${file} on origin/${branch}`)
  }
  throw new Error(`${problems.join('; ')}. Code not yet pushed and merged has no line to link to`)
}

/** The file on the last of SOURCE_BRANCHES, where its line can't be found. */
export const fileLink = (file: string): string => `${REPO}/blob/${SOURCE_BRANCHES.at(-1)}/${file}`
