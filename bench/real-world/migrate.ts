/**
 * v2 → v3 for the Conforma corpus in this folder — and for nothing else.
 *
 * This is bench preparation, not the Phase-15 converter: it handles
 * exactly the fifteen v2 operators and the handful of spellings this
 * corpus uses, and throws on anything it has not been taught, so an
 * unhandled shape fails loudly here rather than quietly timing the wrong
 * program. The honesty guarantee is downstream: the bench harness refuses
 * to time a case until the migrated form has produced the same value as
 * the v2 original, over the whole corpus.
 *
 * Three mappings are semantic rather than a change of spelling, and each
 * was checked against both engines before it was written down:
 *
 * - v2's `join` is an alias of PLUS — concatenation, not a join — so it
 *   becomes `plus`.
 * - `strict: false` on `<` / `>` made them inclusive, so they become
 *   `lessThanOrEqual` / `greaterThanOrEqual`; v3 has no `strict`.
 * - `outputType: 'string'` was `String(value)`. For a scalar that is v3's
 *   `convert`; for an array it was `array.join(',')`, and v3's `convert`
 *   refuses arrays outright ("a cast is not a render"), so the one
 *   array-valued site becomes `join` with a `,` delimiter.
 *
 * One mapping is deliberately mechanical although it is not equivalent:
 * a node-level `fallback` stays a node-level `fallback`. In v2 a missing
 * data path threw and so fell back; v3's `get` returns null for a missing
 * path and the fallback never fires. The bench data resolves every path,
 * so the difference cannot surface here — but it is the sort of thing the
 * real converter has to flag, and it is recorded so nobody mistakes this
 * file for it.
 */
type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj =>
  typeof v === 'object' &&
  v !== null &&
  !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype

/** The data paths whose values are arrays, for the `outputType` rule above. */
const ARRAY_VALUED_PATHS = new Set(['responses.countriesOfRegistration.selection'])

/**
 * Check a node carries only the named keys; anything left over is a shape
 * this migration was not taught.
 */
const take = (op: string, rest: Obj, allowed: string[]): Obj => {
  const extra = Object.keys(rest).filter((k) => !allowed.includes(k))
  if (extra.length > 0)
    throw new Error(`v2 '${op}' carries keys this migration does not handle: ${extra}`)
  return rest
}

const castTo = (node: Obj, to: unknown): Obj => {
  if (to !== 'string') throw new Error(`outputType '${to}' — only 'string' occurs in this corpus`)
  const path = node.operator === 'get' ? node.path : undefined
  // A projection is an array by construction; the named paths are arrays by
  // data
  if (typeof path === 'string' && (path.includes('[*]') || ARRAY_VALUED_PATHS.has(path)))
    return { operator: 'join', values: node, delimiter: ',' }
  return { operator: 'convert', value: node, to: 'string' }
}

/**
 * Conforma's `list` fields are arrays, and v2's property extractor maps a
 * bare key over an array — so `x.list.y` read `y` off every element. v3
 * says that explicitly: `x.list[*].y`. An indexed `list[0].y` is a plain
 * drill on both sides and is left alone.
 */
const pathToV3 = (path: unknown): unknown =>
  typeof path === 'string' ? path.replace(/\.list\.(?!\d)/g, '.list[*].') : toV3(path)

/**
 * v2's `{{token}}` resolution, which v3's `buildString` does not share.
 * v2 looked a token up in `substitutions` first — and when `substitutions`
 * was itself a node evaluating to an object, the token was a *path into
 * that object* — then fell through to `data`, rendering a miss as ''. v3
 * named tokens are plain keys of `substitutions`, and a dotted `{{a.b}}`
 * is not a token at all. So every token that is not already a key of a
 * literal `substitutions` object is renamed `{{pN}}` and supplied as an
 * explicit `get`, prefixed by the substitutions node's path if it had one.
 */
const NAMED_TOKEN = /(?<!\\)\{\{((?:[A-Za-z0-9_.]|\[[0-9]+\])+)\}\}/g

const migrateNamedTemplate = (template: string, substitutions: unknown): Obj => {
  const literal = isObj(substitutions) && !('operator' in substitutions) ? substitutions : undefined
  const viaNode =
    isObj(substitutions) && substitutions.operator === 'getData'
      ? String(substitutions.property)
      : undefined
  const supplied: Obj = literal ? (toV3(literal) as Obj) : {}
  const renamed = new Map<string, string>()
  const migrated = template.replace(NAMED_TOKEN, (whole, token: string) => {
    if (literal && token in literal) return whole
    if (!renamed.has(token)) {
      const name = `p${renamed.size}`
      renamed.set(token, name)
      const path = viaNode ? `${viaNode}.${token}` : token
      supplied[name] = { operator: 'get', path: pathToV3(path) }
    }
    return `{{${renamed.get(token)}}}`
  })
  return { template: migrated, substitutions: supplied }
}

const operatorToV3 = (op: string, rest: Obj): Obj => {
  switch (op) {
    case 'getData':
      take(op, rest, ['property'])
      return { operator: 'get', path: pathToV3(rest.property) }
    case 'objectProperties': {
      take(op, rest, ['children'])
      const [path, missing] = rest.children as unknown[]
      return {
        operator: 'get',
        path: pathToV3(path),
        ...((rest.children as unknown[]).length > 1 ? { default: toV3(missing) } : {}),
      }
    }
    case '=':
      take(op, rest, ['values', 'children'])
      return { operator: 'equal', values: toV3(rest.values ?? rest.children) }
    case '!=':
      take(op, rest, ['values'])
      return { operator: 'notEqual', values: toV3(rest.values) }
    case '<':
      take(op, rest, ['values', 'strict'])
      return {
        operator: rest.strict === false ? 'lessThanOrEqual' : 'lessThan',
        values: toV3(rest.values),
      }
    case '>':
      take(op, rest, ['values', 'strict'])
      return {
        operator: rest.strict === false ? 'greaterThanOrEqual' : 'greaterThan',
        values: toV3(rest.values),
      }
    case 'and':
    case 'AND':
      take(op, rest, ['values'])
      return { operator: 'and', values: toV3(rest.values) }
    case 'or':
      take(op, rest, ['values'])
      return { operator: 'or', values: toV3(rest.values) }
    case '?': {
      take(op, rest, ['condition', 'valueIfTrue', 'valueIfFalse', 'children'])
      const [condition, valueIfTrue, valueIfFalse] = (rest.children as unknown[] | undefined) ?? [
        rest.condition,
        rest.valueIfTrue,
        rest.valueIfFalse,
      ]
      return {
        operator: 'if',
        condition: toV3(condition),
        then: toV3(valueIfTrue),
        else: toV3(valueIfFalse),
      }
    }
    case 'match': {
      // Branches are either a `branches` object or spelled inline as the
      // node's remaining keys — this corpus does both.
      const { matchExpression, branches, ...inline } = rest
      return { operator: 'match', value: toV3(matchExpression), branches: toV3(branches ?? inline) }
    }
    case '+':
    case 'join':
      take(op, rest, ['values', 'children'])
      return { operator: 'plus', values: toV3(rest.values ?? rest.children) }
    case 'stringSubstitution': {
      take(op, rest, ['string', 'substitutions', 'children', 'trimWhiteSpace'])
      const [childTemplate, ...positional] = (rest.children as unknown[] | undefined) ?? []
      const template = rest.string ?? childTemplate
      // Absent substitutions stay absent: a `{{token}}` template with none
      // resolves every token from data, which is the named path below
      const substitutions = rest.substitutions ?? (rest.children ? positional : undefined)
      const trim = rest.trimWhiteSpace !== undefined ? { trim: toV3(rest.trimWhiteSpace) } : {}
      if (typeof template === 'string' && !Array.isArray(substitutions) && template.includes('{{'))
        return {
          operator: 'buildString',
          ...migrateNamedTemplate(template, substitutions),
          ...trim,
        }
      return {
        operator: 'buildString',
        template: toV3(template),
        ...(substitutions !== undefined ? { substitutions: toV3(substitutions) } : {}),
        ...trim,
      }
    }
    case 'regex':
      take(op, rest, ['pattern', 'testString'])
      return { operator: 'regex', pattern: toV3(rest.pattern), value: toV3(rest.testString) }
    case 'split':
      take(op, rest, ['value'])
      return { operator: 'split', value: toV3(rest.value) }
    case 'POST': {
      take(op, rest, ['url', 'parameters', 'returnProperty', 'children'])
      const [url, parameters, returnProperty] = (rest.children as unknown[] | undefined) ?? [
        rest.url,
        rest.parameters,
        rest.returnProperty,
      ]
      return {
        operator: 'http',
        method: 'post',
        url: toV3(url),
        ...(parameters !== undefined ? { body: toV3(parameters) } : {}),
        ...(returnProperty !== undefined ? { returnPath: toV3(returnProperty) } : {}),
      }
    }
    case 'postgres':
      take(op, rest, ['query', 'values'])
      return { operator: 'sql', query: rest.query, values: toV3(rest.values) }
    case 'flattenLines':
    case 'getFormattedDate':
      // Conforma custom functions, called by bare name in v2 and
      // re-registered as first-class operators in v3 (fixtures.ts).
      take(op, rest, ['args'])
      return { operator: op, args: toV3(rest.args) }
    case 'objectFunctions': {
      take(op, rest, ['children'])
      const [fnPath] = rest.children as string[]
      return { operator: fnPath.replace(/^functions\./, ''), args: [] }
    }
    default:
      throw new Error(`no v3 mapping for v2 operator '${op}'`)
  }
}

/**
 * A v2 fragment call carries its arguments as `$name` keys on the node;
 * v3's canonical call carries them as plain keys under `parameters`, and
 * the body reads `$params.name`.
 */
const fragmentCallToV3 = (node: Obj): Obj => {
  const { fragment, fallback, ...args } = node
  const renamed = Object.fromEntries(
    Object.entries(args).map(([k, v]) => {
      if (!k.startsWith('$'))
        throw new Error(`fragment '${fragment}' has a non-argument key '${k}'`)
      return [k.slice(1), toV3(v)]
    })
  )
  return {
    fragment,
    parameters: renamed,
    ...(fallback !== undefined ? { fallback: toV3(fallback) } : {}),
  }
}

/**
 * A v2 fragment *body* refers to its arguments as `$name` strings; the v3
 * body refers to `$params.name`. Applied after `toV3`, over string leaves.
 */
export const fragmentBodyToV3 = (body: unknown, parameterNames: string[]): unknown => {
  const rewrite = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(rewrite)
    if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rewrite(x)]))
    if (typeof v === 'string' && v.startsWith('$') && parameterNames.includes(v.slice(1)))
      return `$params.${v.slice(1)}`
    return v
  }
  return rewrite(toV3(body))
}

export const toV3 = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(toV3)
  if (!isObj(node)) return node
  if ('fragment' in node) return fragmentCallToV3(node)
  if (!('operator' in node))
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, toV3(v)]))
  const { operator, fallback, outputType, type, ...rest } = node
  let out = operatorToV3(String(operator), rest)
  if (fallback !== undefined) out = { ...out, fallback: toV3(fallback) }
  const cast = outputType ?? type
  if (cast !== undefined) out = castTo(out, cast)
  return out
}

/**
 * Writes the migrated corpus beside the original, so the mapping can be
 * read rather than inferred. Node only — the browser bundle has no file
 * system, and the files it would write are already in the repo.
 */
export const dumpV3 = async (name: string, migrated: unknown) => {
  if (typeof process === 'undefined' || process.versions?.node === undefined) return
  const { writeFileSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const { dirname, join: joinPath } = await import('node:path')
  const here = dirname(fileURLToPath(import.meta.url))
  writeFileSync(joinPath(here, `${name}.v3.json`), JSON.stringify(migrated, null, 2) + '\n')
}
