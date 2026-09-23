/**
 * `buildString`'s token grammar — one scanner, two consumers, so the
 * grammar cannot drift ("buildString" in
 * docs-dev/v3-specs/v3-operator-parameters.md, batch 4).
 *
 * The compiler scans a LITERAL template to recognize reference tokens and to
 * report literal-face slips; the operator body scans whatever template it
 * is given, literal or data-sourced, to render it. Token recognition is the
 * only thing that ever happens to a template — it is never re-scanned for
 * references, never compiled as a node, and a substituted value is never
 * scanned at all (References rule 4's sibling at the token level).
 *
 * Two styles, one per `substitutions` shape: positional `%N` pairs with an
 * array, named `{{name}}` with an object, and each is inert text in the
 * other's mode. There are no escape sequences — that inertness, plus the
 * no-rescan rule, already makes every literal expressible.
 */
import { checkNameLegality } from './names'

export type TemplateSegment =
  /** Template text, verbatim. Adjacent runs are merged into one segment. */
  | { kind: 'text'; text: string }
  /** `%N` — the Nth substitution, 1-indexed strictly, digits greedy. */
  | { kind: 'positional'; raw: string; index: number }
  /** `{{name}}` or `{{$reference}}` — matched verbatim against the keys. */
  | { kind: 'named'; raw: string; body: string }

/**
 * A well-formed named-token body: the shared name-legality rule, or a
 * reference-shaped string. The `$` admission is what lets a desugared
 * reference token bind; it costs nothing elsewhere, because a template
 * that arrived as data had no reference desugared into its substitutions,
 * so such a token is simply unbound and renders itself.
 *
 * The legality rule excludes `.`, `[` and `]`, which is what kills v2's
 * bare path drilling inside tokens: `{{user.name}}` is not a token at all.
 * Braces are excluded on top of it, so an unclosed `{{` cannot reach past
 * a later well-formed token and disable it — v2's text swallow, with the
 * one difference that here nothing is erased either way.
 */
const isTokenBody = (body: string): boolean => {
  if (body.includes('{') || body.includes('}')) return false
  return body.startsWith('$') ? body.length > 1 : checkNameLegality(body).ok
}

/** Split a template into literal text and token sites, in order. */
export const scanTemplate = (template: string): TemplateSegment[] => {
  const segments: TemplateSegment[] = []
  let text = ''

  const flushText = () => {
    if (text !== '') {
      segments.push({ kind: 'text', text })
      text = ''
    }
  }

  let i = 0
  while (i < template.length) {
    const char = template[i]

    if (char === '%') {
      let end = i + 1
      while (end < template.length && template[end] >= '0' && template[end] <= '9') end++
      // A `%` not followed by digits is plain text — '20% off' needs no
      // ceremony
      if (end > i + 1) {
        const raw = template.slice(i, end)
        flushText()
        segments.push({ kind: 'positional', raw, index: Number(raw.slice(1)) })
        i = end
        continue
      }
      text += char
      i++
      continue
    }

    if (char === '{' && template[i + 1] === '{') {
      const close = template.indexOf('}}', i + 2)
      if (close !== -1) {
        const body = template.slice(i + 2, close)
        if (isTokenBody(body)) {
          flushText()
          segments.push({ kind: 'named', raw: template.slice(i, close + 2), body })
          i = close + 2
          continue
        }
      }
      // Not a well-formed token: the braces are text, and the scan resumes
      // just past them so a later token in the same stretch still binds
      text += '{{'
      i += 2
      continue
    }

    text += char
    i++
  }

  flushText()
  return segments
}

/**
 * Every token site in a template, in order — the shared read for both
 * consumers.
 */
export const templateTokens = (template: string): Exclude<TemplateSegment, { kind: 'text' }>[] =>
  scanTemplate(template).filter((segment) => segment.kind !== 'text')
