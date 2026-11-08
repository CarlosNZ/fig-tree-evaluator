const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * The inline Markdown an operator note's short texts use, as HTML: `code`,
 * **strong**, *emphasis* and [links](url). Everything else is text, escaped.
 * Code spans are taken out first, so nothing inside one is read as Markdown.
 */
export const inlineMarkdown = (source: string): string => {
  const codes: string[] = []
  const withoutCode = source.replace(/`([^`]+)`/g, (_, code: string) => {
    codes.push(`<code>${escapeHtml(code)}</code>`)
    return `\u0000${codes.length - 1}\u0000`
  })
  return escapeHtml(withoutCode)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\u0000(\d+)\u0000/g, (_, index: string) => codes[Number(index)])
}

/** Plain text, as HTML. */
export const plainHtml = escapeHtml
