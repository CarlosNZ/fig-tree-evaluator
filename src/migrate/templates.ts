/**
 * STRING_SUBSTITUTION as v3's `buildString` ("Batch 3: data and strings" in
 * docs-dev/v3-specs/v3-converter.md). v2 had two modes, chosen by the
 * substitutions it was given: positional tokens (`%1`, or `$1` under
 * `substitutionCharacter: '$'`) paired with an array by rank, and named
 * `{{name}}` tokens read from an object, or from `data` when the object
 * lacked the name. For a literal template the converter writes both in v3's
 * own terms, so a converted template renders as v2's did: positional tokens
 * are renumbered, and a named token that read `data` becomes a reference
 * token. What it cannot write is left as written, with an issue.
 *
 * v2 (from 2.23.2) also un-escaped every `\%` (or `\$`) in positional mode
 * and every `\{{` in named mode. v3 has no escapes, so the backslash goes
 * wherever what follows is text in v3 too, and an escape that would leave v3
 * a token is raised as `template-escape`.
 */
import type { RuleContext, V3Draft } from './rules'
import {
  V3_REFERENCE,
  dataReference,
  isComputed,
  isNode,
  isPlainObject,
  literal,
  unquote,
} from './v3Values'

type Char = '%' | '$'

const isDigit = (char: string | undefined) => char !== undefined && char >= '0' && char <= '9'

// v2's tokens in each mode, none of them preceded by a backslash
const POSITIONAL = { '%': /(?<!\\)%\d+/, $: /(?<!\\)\$\d+/ }
const NAMED = /(?<!\\)({{(?:[A-Za-z0-9_.]|\[[0-9]+\])+}})/
// A named fragment v2 took for a token and swallowed whole
const SWALLOWED = /(?<!\\){{(.+)}}/

/**
 * Whether v3 reads `{{body}}` as a token: a reference, or a name that is
 * legal ("Name legality, not name style" in docs-dev/v3-specs/v3-api.md)
 */
const isV3Token = (body: string) =>
  !/[{}]/.test(body) &&
  (body.startsWith('$') ? body.length > 1 : body !== '' && !/[.[\]]/.test(body))

/** Whether a template text holds v2 tokens of a mode */
const hasTokens = (template: string, char: Char) => POSITIONAL[char].test(template)

/**
 * Positional mode: each distinct token becomes `%` and its rank, since v2
 * paired the distinct tokens, in number order, with the substitutions in
 * order. `%N` text in a `$` template would become a token, and so would an
 * escaped token, so both are raised.
 */
const positional = (template: string, char: Char, context: RuleContext) => {
  const tokens = template.match(new RegExp(POSITIONAL[char], 'g')) ?? []
  // A stable sort, so tokens of one number keep their first appearance
  const ranked = [...new Set([...tokens].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))))]
  const rank = new Map(ranked.map((token, i) => [token, `%${i + 1}`]))

  let output = ''
  let escape = false
  for (let i = 0; i < template.length;) {
    const here = template[i]
    if (here === '\\' && template[i + 1] === char) {
      // An escaped token is text in v2 and a token in v3; any other escape
      // is text in both
      if (isDigit(template[i + 2])) {
        escape = true
        output += `\\${char}`
      } else output += char
      i += 2
      continue
    }
    if (here === char && isDigit(template[i + 1])) {
      let end = i + 1
      while (isDigit(template[end])) end++
      output += rank.get(template.slice(i, end))
      i = end
      continue
    }
    if (here === '%' && isDigit(template[i + 1])) escape = true
    output += here
    i++
  }
  if (escape) context.issue('template-escape', 'string')
  return output
}

/**
 * Named mode: a token whose name is a substitution's stays, and any other
 * read `data`, drilled, so it becomes a reference token
 */
const named = (
  template: string,
  substitutions: object | undefined,
  draft: V3Draft,
  context: RuleContext
) => {
  const { numberMapping } = draft.v2
  const mapping = unquote(numberMapping)
  if (isComputed(numberMapping))
    context.issue('number-mapping', 'numberMapping', { token: 'each token it maps' })

  let escape = false
  const output = template.split(NAMED).map((fragment, i) => {
    // `split` puts each token at an odd index
    if (i % 2 === 0) {
      if (SWALLOWED.test(fragment)) return fragment
      return fragment.replace(/\\{{/g, (match, at: number) => {
        const close = fragment.indexOf('}}', at + 3)
        const token = close !== -1 && isV3Token(fragment.slice(at + 3, close))
        if (token) escape = true
        return token ? match : '{{'
      })
    }
    const key = fragment.slice(2, -2)
    const token = `{{${key}}}`
    if (isPlainObject(mapping) && Object.hasOwn(mapping, key))
      context.issue('number-mapping', ['numberMapping', key], { token: `\`${token}\`` })
    const [first] = key.split(/[.[]/)
    if (substitutions === undefined || !Object.hasOwn(substitutions, first))
      return `{{${dataReference(key)}}}`
    if (first !== key) context.issue('drilled-substitution-token', 'string', { token, name: first })
    return fragment
  })
  if (escape) context.issue('template-escape', 'string')
  return output.join('')
}

/** A rewritten template, quoted if v3 would read all of it as a reference */
const written = (template: string) => (V3_REFERENCE.test(template) ? literal(template) : template)

export const templateRewrite = (draft: V3Draft, context: RuleContext) => {
  const { substitutions } = draft.params
  const { trimWhiteSpace, substitutionCharacter } = draft.v2
  const given = draft.params.template
  const template = unquote(given)

  // v2 read any character but `$` as `%`
  const char: Char | undefined = isComputed(substitutionCharacter)
    ? undefined
    : substitutionCharacter === '$'
      ? '$'
      : '%'
  const literalTemplate = typeof template === 'string' && !isComputed(given)
  const listed = Array.isArray(substitutions)
  const mapped =
    substitutions === undefined ||
    substitutions === null ||
    (isPlainObject(substitutions) && !isNode(substitutions))
  // A computed `substitutions` has the mode its template's tokens give
  const mode =
    listed ||
    (!mapped &&
      literalTemplate &&
      hasTokens(template, char ?? '%') &&
      !NAMED.test(template as string))
      ? 'positional'
      : 'named'

  let rewritten = given
  if (mode === 'positional') {
    if (char === undefined)
      context.issue('computed-dollar-template', 'substitutionCharacter', {
        what: '`substitutionCharacter`',
      })
    else if (!literalTemplate)
      if (char === '$') context.issue('computed-dollar-template', 'string', { what: 'template' })
      else context.issue('template-numbering', 'string')
    else rewritten = written(positional(template, char, context))
  } else if (!literalTemplate || !mapped) context.issue('named-token-source', 'string')
  else
    rewritten = written(
      named(template, (substitutions ?? undefined) as object | undefined, draft, context)
    )

  // v2 trimmed each substitution unless told not to; v3 trims none by default
  const trim =
    trimWhiteSpace === undefined ? true : trimWhiteSpace === false ? undefined : trimWhiteSpace
  return {
    operator: 'buildString',
    ...(given !== undefined && { template: rewritten }),
    ...(substitutions !== undefined && { substitutions }),
    ...(trim !== undefined && { trim }),
  }
}
