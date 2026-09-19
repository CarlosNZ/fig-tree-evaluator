/**
 * Shared scaffolding for the per-phase showcases (implementation-plan
 * working rule 7). Each `src/dev/phase<N>_showcase.ts` is a reading of one
 * phase for humans — a range of expressions with their results — so they
 * all want the same three things: JSON sized for reading, a section rule,
 * and one line per expression.
 *
 * `outcome` is separated from the printing because the phases differ in
 * what they need beside the result: Phase 4 wants the error's path, Phase
 * 5 and 6 want a tally of what actually ran.
 */
import { isFigTreeError } from '../index'

/**
 * JSON for reading: compact while it fits on a line, pretty-printed when
 * it does not, with every line after the first aligned to `pad`.
 *
 * The threshold is WIDTH, not nesting depth — measured against these
 * files' own expressions, depth turned out not to discriminate. An
 * operator call with an array payload is already depth 2, so anything
 * with one operator inside another is depth 4 before it has said
 * anything: a depth rule expands
 * `{"$or":[{"$work":["slow",200]},{"$work":["quick",5]}]}` into sixteen
 * lines, and still misses the 110-character node beside it. Depth is
 * forced by the notation here; width tracks how much there is to read.
 */
export const WIDTH = 80

export const block = (value: unknown, pad = '      '): string => {
  const compact = JSON.stringify(value)
  if (compact === undefined) return String(value)
  if (compact.length <= WIDTH) return compact
  return JSON.stringify(value, null, 2).split('\n').join(`\n${pad}`)
}

export const section = (title: string) =>
  console.log(`── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}\n`)

/** A result or a named error, rendered the same way across the phases. */
export const outcome = async (run: () => Promise<unknown>, withPath = false): Promise<string> => {
  try {
    return `→ ${block(await run())}`
  } catch (error) {
    if (!isFigTreeError(error)) return `✗ ${String(error)}`
    const where = withPath ? ` at ${JSON.stringify(error.path)}` : ''
    const who = error.operator ? ` (${error.operator})` : ''
    return `✗ ${error.code}${who}${where}: ${error.message}`
  }
}

export const print = (label: string, expression: unknown, result: string, note?: string) =>
  console.log(
    `  ${label}\n      ${block(expression)}\n    ${result}${note !== undefined ? `   [${note}]` : ''}\n`
  )
