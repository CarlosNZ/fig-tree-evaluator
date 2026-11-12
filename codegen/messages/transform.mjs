/**
 * The Jest transform for `pnpm messages`: ts-jest, after wrapping each
 * message in a src/ file (find.mjs) as `__msg(id, <message>)`, which
 * records the text the message produced and returns it (record.cjs). The
 * wrapping only inserts text, never on a new line, so line numbers in
 * stack traces hold.
 */
import tsJestModule from 'ts-jest'
import { findMessages, isMessageFile, repoPath } from './find.mjs'

const tsJest = tsJestModule.default ?? tsJestModule

/** The source with each message wrapped */
export const wrapMessages = (text, path) => {
  // `rank` orders insertions at one position: each lands before those
  // already made there, so the inner opening goes in first, then the outer
  // one, then any closing, which must end up leftmost
  const insertions = findMessages(text, path).flatMap(({ id, start, end }) => [
    { at: start, text: `__msg(${JSON.stringify(id)}, `, rank: end - start },
    { at: end, text: ')', rank: Infinity },
  ])
  // Last position first, so each insertion leaves the positions before it
  insertions.sort((a, b) => b.at - a.at || a.rank - b.rank)
  let result = text
  for (const { at, text: inserted } of insertions)
    result = result.slice(0, at) + inserted + result.slice(at)
  return result
}

export default {
  createTransformer(config) {
    const inner = tsJest.createTransformer(config)
    const prepare = (text, file) => {
      const path = repoPath(file)
      return isMessageFile(path) ? wrapMessages(text, path) : text
    }
    return {
      canInstrument: inner.canInstrument,
      process: (text, file, options) => inner.process(prepare(text, file), file, options),
      processAsync: (text, file, options) => inner.processAsync(prepare(text, file), file, options),
    }
  },
}
