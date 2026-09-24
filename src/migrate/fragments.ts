/**
 * The v2 fragments as v3 will register them ("Fragments" in
 * docs-dev/v3-specs/v3-converter.md): each one's v3 name, what its body is,
 * and its parameters. Stage 2 converts calls against this catalogue, in
 * expressions and in bodies alike, so `migrateV2Expression` and
 * `migrateV2Fragments` derive the same renames from `V2Options.fragments`.
 *
 * A body's parameters are its declared ones, its top-level `$` keys, and the
 * placeholders it reads: whole `'$name'` strings that no alias inside the
 * body resolves, and the names a fragment it calls would read from its
 * scope. Only a walk of the body finds those, and a walk converts calls
 * against the catalogue, so the catalogue is found by walking every body
 * until no walk finds a new parameter. The walk is stage 2's, passed in.
 */
import type { FragmentDefinition, FragmentParameterDeclaration } from '../fragments'
import type { MigrationIssue, V2Options } from '../migrationTypes'
import { isUnder, issue, type Path } from './issues'
import { normalizeV2, type NodeSource } from './normalize'
import type { V2Operator } from './v2/operators.generated'
import { V3_NAMES } from './v3Names.generated'
import {
  RESERVED_NAMES,
  RESERVED_NODE_KEYS,
  V3_TYPES,
  fitsType,
  isPlainObject,
  render,
  uncaughtRead,
  type PlainObject,
} from './v3Values'

/** A default v2 evaluated at each call, as stage 1 wrote it, and its place */
interface V2Default {
  value: unknown
  path: Path
}

export interface ParameterInfo {
  /** The placeholder, `$` and all, as the body and its calls spell it */
  key: string
  /** Its v3 name */
  name: string
  /** Where it was declared, or first read, which its rename reports */
  at: Path
  /** Whether `metadata.parameters` declared it */
  declared: boolean
  /** v2's `required: true` */
  required: boolean
  type?: unknown
  description?: unknown
  /** The declaration's keys v3 has no place for */
  metadata?: PlainObject
  default?: V2Default
  /**
   * Whether a call's unprefixed key of its name is exactly its argument: v2
   * laid that key over the body's own, which is its one read
   */
  exact: boolean
}

export interface FragmentInfo {
  /** The v2 name */
  key: string
  /** The v3 name */
  name: string
  /** The body as stage 1 wrote it, where v2 read it as an operator node */
  body?: PlainObject
  /** The body, where v2 returned it as it was */
  data?: unknown
  /** Where the objects stage 1 wrote for the body and its defaults came from */
  sources: Map<object, NodeSource>
  /** The body's v2 operator, unless stage 1 left the body as written */
  operator?: V2Operator
  /** How the body spells an output type of its own */
  ownOutput?: 'outputType' | 'type'
  /** Whether the converted body converts its own result, from its `type` */
  convertsByType: boolean
  /** By placeholder, declared ones first */
  parameters: Map<string, ParameterInfo>
  description?: string
  metadata?: PlainObject
  /** What was found before the body is converted */
  issues: MigrationIssue[]
}

export interface Catalogue {
  /** By v2 name */
  fragments: ReadonlyMap<string, FragmentInfo>
  /** Whether a fragment's body reads data that v2 failed on, by v3 name */
  bodyReads: (name: string) => boolean
}

/** A placeholder a walk found: its key, where, and whether a call read it */
export type OnRead = (key: string, path: Path, throughCall: boolean) => void

/** Stage 2's walk of a body, against the catalogue as far as it is known */
export type BodyWalk = (fragment: FragmentInfo, catalogue: Catalogue, onRead: OnRead) => unknown

/** A converted default: a constant, or computed and bound in the body */
export type ConvertedDefault = { constant: unknown } | 'computed'

// The keys of a v2 parameter declaration that v3's has a place for
const V2_DECLARATION_KEYS = ['name', 'type', 'required', 'default', 'description']

// v2's test for an alias: a `$` and at least one more character
const isAlias = (key: string) => /^\$.+/.test(key)

const byKey = <T extends { key: string }>(a: T, b: T) =>
  a.key < b.key ? -1 : a.key > b.key ? 1 : 0

/** A name as v3's rule allows it: no leading `$`, and `_` for `.`, `[`, `]` */
export const legalName = (name: string) => name.replace(/^\$+/, '').replace(/[.[\]]/g, '_') || '_'

/** `base`, or with the first numeric suffix nothing has taken */
const fresh = (base: string, taken: Set<string>) => {
  let name = base
  for (let n = 2; taken.has(name); n++) name = `${base}_${n}`
  taken.add(name)
  return name
}

/** Why v3 would refuse a name, by its grammar alone */
const illegal = (name: string) => {
  if (name === '') return 'a v3 name cannot be empty'
  if (name.startsWith('$')) return 'a v3 name cannot start with `$`'
  const bracket = /[.[\]]/.exec(name)?.[0]
  return bracket === undefined ? undefined : `a v3 name cannot hold a \`${bracket}\``
}

/** A path inside a fragment as an author reads it: `metadata.parameters[0]` */
const shown = (path: Path) =>
  path
    .slice(1)
    .map((segment, i) =>
      typeof segment === 'number' ? `[${segment}]` : i === 0 ? segment : `.${segment}`
    )
    .join('')

/**
 * A v2 parameter type as v3's: `'undefined'` goes from a union, and a type
 * v3 lacks, `'undefined'` alone included, is `'any'`
 */
const v3Type = (type: unknown): { type: unknown; unknown?: unknown } => {
  if (typeof type === 'string')
    return V3_TYPES.has(type) ? { type } : { type: 'any', unknown: type }
  if (Array.isArray(type)) {
    const members = type.filter((member) => member !== 'undefined')
    if (members.length === 0) return { type: 'any', unknown: 'undefined' }
    const unknown = members.find((m) => typeof m !== 'string' || !V3_TYPES.has(m))
    if (unknown !== undefined) return { type: 'any', unknown }
    return { type: members.length === 1 ? members[0] : members }
  }
  if (isPlainObject(type) && Array.isArray(type.literal) && type.literal.length > 0) {
    const scalar = (m: unknown) => ['string', 'number', 'boolean'].includes(typeof m)
    if (type.literal.every(scalar)) return { type: { literal: type.literal } }
  }
  return { type: 'any', unknown: type }
}

/**
 * One fragment as v2 read it. v2 returned a body that is not an operator
 * node, after shorthand, as it was. An operator node's `metadata` is the
 * wrapper, whose `parameters` it declares, and its top-level `$` keys are
 * defaults.
 */
const readDefinition = (key: string, definition: unknown, options: V2Options): FragmentInfo => {
  const info: FragmentInfo = {
    key,
    name: key,
    sources: new Map(),
    convertsByType: false,
    parameters: new Map(),
    issues: [],
  }
  if (!isPlainObject(definition)) return { ...info, data: definition }
  const { metadata, ...rest } = definition
  const wrapper = isPlainObject(metadata) ? metadata : undefined
  const normalized = normalizeV2(wrapper ? rest : definition, options, [key])
  const body = normalized.expression
  if (!isPlainObject(body) || !Object.hasOwn(body, 'operator') || Object.hasOwn(body, 'fragment'))
    return { ...info, data: definition }

  info.body = body
  normalized.sources.forEach((source, object) => info.sources.set(object, source))
  info.issues.push(...normalized.issues)
  const record = normalized.sources.get(body)
  if (record?.quoted === undefined) info.operator = body.operator as V2Operator

  if (wrapper !== undefined) {
    const { description, parameters, ...bag } = wrapper
    if (typeof description === 'string') info.description = description
    else if (description !== undefined) bag.description = description
    if (Array.isArray(parameters))
      parameters.forEach((entry, index) => declare(info, entry, index, options))
    else if (parameters !== undefined) bag.parameters = parameters
    if (Object.keys(bag).length > 0) info.metadata = bag
  }
  // A body left as written reads nothing, its top-level keys included
  if (record?.quoted === undefined) topDefaults(info, body, record, options)

  // The spelling of an output type of its own, which the stage-1 record keeps
  const spelled = record?.keys.outputType?.at(-1)
  if (Object.hasOwn(body, 'outputType')) info.ownOutput = spelled === 'type' ? 'type' : 'outputType'
  else if (Object.hasOwn(body, 'type')) info.ownOutput = 'type'
  // PLUS's `type` is its own parameter, which converts the result only as a
  // boolean
  info.convertsByType =
    info.ownOutput === 'type' &&
    (info.operator === 'PLUS'
      ? body.type === 'boolean' || body.type === 'bool'
      : Object.hasOwn(body, 'outputType'))
  return info
}

/** One entry of `metadata.parameters`: `{ name: '$country', type, … }` */
const declare = (info: FragmentInfo, entry: unknown, index: number, options: V2Options) => {
  if (!isPlainObject(entry) || typeof entry.name !== 'string') return
  const key = entry.name.startsWith('$') ? entry.name : `$${entry.name}`
  // v2 read the first declaration of a name
  if (!isAlias(key) || info.parameters.has(key)) return
  const at: Path = [info.key, 'metadata', 'parameters', index]
  const { type, required, default: value, description } = entry
  const others = Object.fromEntries(
    Object.entries(entry).filter(([k]) => !V2_DECLARATION_KEYS.includes(k))
  )
  const parameter: ParameterInfo = {
    key,
    name: key.slice(1),
    at,
    declared: true,
    required: required === true,
    exact: false,
  }
  if (type !== undefined) {
    const converted = v3Type(type)
    parameter.type = converted.type
    if (Object.hasOwn(converted, 'unknown')) {
      const shownType =
        typeof converted.unknown === 'string' ? converted.unknown : render(converted.unknown)
      info.issues.push(issue('unknown-parameter-type', [...at, 'type'], { type: shownType }))
    }
  }
  if (description !== undefined) parameter.description = description
  if (Object.keys(others).length > 0) parameter.metadata = others
  // v2 inserted only a default that was not `undefined`
  if (value !== undefined) {
    const path = [...at, 'default']
    const normalized = normalizeV2(value, options, path)
    normalized.sources.forEach((source, object) => info.sources.set(object, source))
    info.issues.push(...normalized.issues)
    parameter.default = { value: normalized.expression, path }
  }
  info.parameters.set(key, parameter)
}

/**
 * The body's top-level `$` keys, each the default of the parameter it names.
 * Beside a declared default, v2 inserted that into the call's `parameters`,
 * which won, unless `evaluateFullObject` lifted it into the caller's scope,
 * beneath the body's.
 */
const topDefaults = (
  info: FragmentInfo,
  body: PlainObject,
  record: NodeSource | undefined,
  options: V2Options
) => {
  for (const key of Object.keys(body).filter(isAlias)) {
    const own: V2Default = { value: body[key], path: record?.keys[key] ?? [info.key, key] }
    const parameter = info.parameters.get(key)
    if (parameter === undefined)
      info.parameters.set(key, {
        key,
        name: key.slice(1),
        at: own.path,
        declared: false,
        required: false,
        type: 'any',
        default: own,
        exact: false,
      })
    else if (parameter.default === undefined) parameter.default = own
    else {
      const [winner, loser] = options.evaluateFullObject
        ? [own, parameter.default]
        : [parameter.default, own]
      const fill = { key: shown(loser.path), winner: shown(winner.path) }
      // v2 never evaluated the loser, so what stage 1 found in it goes
      info.issues = info.issues.filter(({ path }) => !isUnder(path, loser.path))
      info.issues.push(issue('overridden-value', loser.path, fill))
      parameter.default = winner
    }
  }
}

/**
 * The fragments' v3 names, for those v3 would refuse: its grammar's, a
 * reserved name, a core or I/O operator's name or alias, or a custom
 * function's, which becomes an operator. A rename that clashes takes a
 * suffix, in sorted order, so the same fragments always get the same names.
 */
const renameFragments = (fragments: FragmentInfo[], options: V2Options) => {
  const { functions = {} } = options
  const functionNames = new Set(Array.isArray(functions) ? functions : Object.keys(functions))
  const why = (name: string) =>
    illegal(name) ??
    (RESERVED_NAMES.has(name)
      ? 'it is a reserved name'
      : Object.hasOwn(V3_NAMES, name)
        ? "it is already a v3 operator's name"
        : functionNames.has(name)
          ? "it is a custom function's name, which becomes a v3 operator"
          : undefined)
  const taken = new Set([...RESERVED_NAMES, ...Object.keys(V3_NAMES), ...functionNames])
  for (const fragment of fragments) if (why(fragment.key) === undefined) taken.add(fragment.key)
  for (const fragment of fragments.filter(({ key }) => why(key) !== undefined).sort(byKey)) {
    fragment.name = fresh(legalName(fragment.key), taken)
    const fill = { name: fragment.key, reason: why(fragment.key)!, renamed: fragment.name }
    fragment.issues.unshift(issue('name-renamed', [fragment.key], fill))
  }
}

/** A fragment's parameter names, for those v3 would refuse */
const renameParameters = (fragment: FragmentInfo) => {
  const why = (name: string) =>
    illegal(name) ?? (RESERVED_NODE_KEYS.has(name) ? 'it is a reserved node key' : undefined)
  const parameters = [...fragment.parameters.values()]
  const taken = new Set(RESERVED_NODE_KEYS)
  for (const parameter of parameters)
    if (why(parameter.name) === undefined) taken.add(parameter.name)
  for (const parameter of parameters.filter(({ name }) => why(name) !== undefined).sort(byKey)) {
    const reason = why(parameter.name)!
    const fill = { name: parameter.name, reason, renamed: fresh(legalName(parameter.name), taken) }
    parameter.name = fill.renamed
    fragment.issues.push(issue('name-renamed', parameter.at, fill))
  }
}

/** Whether a read is the body's own top-level key of that name, as written */
const isTopKey = ([fragment, ...rest]: Path, key: string, name: string) =>
  fragment === key &&
  rest.at(-1) === name &&
  (rest.length === 1 || (rest.length === 2 && typeof rest[0] === 'string' && isAlias(rest[0])))

interface Read {
  path: Path
  throughCall: boolean
}

/**
 * Every v2 fragment as v3 will register it. The walk runs over every
 * operator body until none finds a placeholder that is not yet a parameter,
 * which ends, cycles included, since each pass adds names from a finite set.
 */
export const fragmentCatalogue = (options: V2Options, walk: BodyWalk): Catalogue => {
  const definitions = isPlainObject(options.fragments) ? options.fragments : {}
  const fragments = Object.entries(definitions).map(([key, definition]) =>
    readDefinition(key, definition, options)
  )
  renameFragments(fragments, options)
  const catalogue: Catalogue = {
    fragments: new Map(fragments.map((fragment) => [fragment.key, fragment])),
    bodyReads: () => false,
  }

  const walked = new Map<string, unknown>()
  const reads = new Map<string, Map<string, Read[]>>()
  for (let found = true; found;) {
    found = false
    for (const fragment of fragments) {
      if (fragment.body === undefined) continue
      const read = new Map<string, Read[]>()
      const onRead: OnRead = (key, path, throughCall) =>
        read.set(key, [...(read.get(key) ?? []), { path, throughCall }])
      walked.set(fragment.key, walk(fragment, catalogue, onRead))
      reads.set(fragment.key, read)
      for (const [key, [{ path }]] of read)
        if (!fragment.parameters.has(key)) {
          found = true
          fragment.parameters.set(key, {
            key,
            name: key.slice(1),
            at: path,
            declared: false,
            required: false,
            type: 'any',
            exact: false,
          })
        }
    }
  }

  for (const fragment of fragments) {
    for (const parameter of fragment.parameters.values()) {
      const found = reads.get(fragment.key)?.get(parameter.key) ?? []
      parameter.exact =
        found.length === 1 &&
        !found[0].throughCall &&
        isTopKey(found[0].path, fragment.key, parameter.key.slice(1))
    }
    renameParameters(fragment)
  }

  // A cycle reads nothing more than its first pass through
  const byName = new Map(fragments.map((fragment) => [fragment.name, fragment.key]))
  const memo = new Map<string, boolean>()
  catalogue.bodyReads = (name) => {
    const key = byName.get(name)
    if (key === undefined || !walked.has(key)) return false
    if (!memo.has(key)) {
      memo.set(key, false)
      memo.set(key, uncaughtRead(walked.get(key), catalogue.bodyReads))
    }
    return memo.get(key)!
  }
  return catalogue
}

/**
 * A parameter's declaration: a constant default is the `default`, and a
 * computed one, which the body binds, leaves it optional. Only `required:
 * true` without a default was required, and a default v3 would refuse for
 * its declared type widens it to `'any'`.
 */
const declaration = (
  parameter: ParameterInfo,
  converted: ConvertedDefault | undefined,
  issues: MigrationIssue[]
): FragmentParameterDeclaration => {
  const constant = converted !== undefined && converted !== 'computed' ? converted : undefined
  let { type } = parameter
  if (constant !== undefined && type !== undefined && !fitsType(constant.constant, type)) {
    const fill = { value: render(constant.constant), type: render(type) }
    issues.push(issue('default-outside-type', parameter.default!.path, fill))
    type = 'any'
  }
  const optional = constant === undefined && !(parameter.required && converted === undefined)
  return {
    ...(type !== undefined && { type: type as FragmentParameterDeclaration['type'] }),
    ...(optional && { required: false }),
    ...(constant !== undefined && { default: constant.constant }),
    ...(parameter.description !== undefined && { description: parameter.description as string }),
    ...(parameter.metadata !== undefined && { metadata: parameter.metadata }),
  }
}

/**
 * A fragment's v3 definition: `{ expression, parameters?, description?,
 * metadata? }`, its parameters declared ones first, then the rest by name
 */
export const definitionOf = (
  fragment: FragmentInfo,
  expression: unknown,
  defaults: ReadonlyMap<string, ConvertedDefault>,
  issues: MigrationIssue[]
): FragmentDefinition => {
  const all = [...fragment.parameters.values()]
  const ordered = [
    ...all.filter(({ declared }) => declared),
    ...all.filter(({ declared }) => !declared).sort((a, b) => (a.name < b.name ? -1 : 1)),
  ]
  const parameters = Object.fromEntries(
    ordered.map((p) => [p.name, declaration(p, defaults.get(p.key), issues)])
  )
  return {
    expression,
    ...(ordered.length > 0 && { parameters }),
    ...(fragment.description !== undefined && { description: fragment.description }),
    ...(fragment.metadata !== undefined && { metadata: fragment.metadata }),
  }
}
