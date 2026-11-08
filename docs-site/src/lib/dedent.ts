/**
 * Strips the blank first and last lines of a template literal and the
 * indentation its lines share, so a multi-line example can be indented to
 * match the MDX around it.
 */
export const dedent = (text: string): string => {
  const lines = text
    .replace(/^\s*\n/, '')
    .replace(/\n\s*$/, '')
    .split('\n')
  const indents = lines.filter((line) => line.trim()).map((line) => line.match(/^ */)![0].length)
  const shared = Math.min(...indents, Infinity)
  return lines.map((line) => line.slice(shared)).join('\n')
}
