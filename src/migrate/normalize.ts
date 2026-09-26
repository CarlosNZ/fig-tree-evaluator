/**
 * Stage 1 of the v2 converter: v2 to canonical v2 ("Stage 1: normalize" and
 * "Source paths" in docs-dev/v3-specs/v3-converter.md). v2 normalized a node
 * at every evaluation, in the order its evaluate.ts read it; this does the
 * same once, statically, evaluating nothing. Shorthand is expanded, names
 * resolve to their v2 operator, property aliases become names, `children`
 * becomes named parameters, `type` is spelled `outputType`, and a fragment
 * call's `$` arguments move into `parameters`. The result is still v2, and v2
 * evaluates it as it evaluated the input, which is this stage's test oracle.
 *
 * It looks only where v2 evaluated, and leaves anything else as data, for
 * stage 2 to quote or not. It drops only what v2 itself discarded, each with
 * a `lossy-default` issue. Four shapes v2 read in a way no canonical spelling
 * says stay as written, for stage 2 to rule on: a fragment call's `type`, a
 * computed `type` on SQL, MATCH branches on the node beside a computed
 * `branches`, and call-node arguments beside a computed `parameters`.
 */
import type { MigrationIssue, V2Options } from '../migrationTypes'
import { isUnder, issue, type Path } from './issues'
import { V2_BEHAVIOUR } from './v2/behaviour'
import { V2_CHILDREN, mapChildren } from './v2/children'
import { hasNodeKey, isAlias, v2OperatorFor } from './v2/names'
import { V2_PARAMETERS, type V2Operator } from './v2/operators.generated'
import { isPlainObject, type PlainObject } from './v3Values'

/** Where an object stage 1 wrote came from in the input ("Source paths") */
export interface NodeSource {
  /** The object's own place */
  path: Path
  /** Each key's value's place */
  keys: Record<string, Path>
  /**
   * Keys v2 discarded that cannot stay on the node, as written, for stage 2's
   * `//` object ("Keys v2 ignored")
   */
  ignored?: Record<string, unknown>
  /**
   * Why a node was left as written, for stage 2 to quote: the issue, the
   * place of the key that decided it, and the operator as the input spelled
   * it, where the message names it
   */
  quoted?: { code: QuotedCode; at: Path; name?: string }
}

/** The issues of a node left as written ("What it leaves as written") */
export type QuotedCode =
  'unknown-operator' | 'computed-children' | 'computed-function-name' | 'computed-fragment-name'

export interface Normalized {
  /** The canonical v2 tree */
  expression: unknown
  /**
   * A record for each object stage 1 wrote, which is always a new one, kept
   * beside the tree so that the tree stays plain v2
   */
  sources: Map<object, NodeSource>
  /** What stage 1 dropped */
  issues: MigrationIssue[]
}

/**
 * Where a value came from: its place in the input, and, for a container stage
 * 1 built, where each entry came from. An entry with no source of its own is
 * at its key below `path`.
 */
interface Source {
  path: Path
  entries?: Record<string, Source>
}

/** A value on its way into the canonical tree, with where it came from */
interface Located {
  value: unknown
  source: Source
}

const MODIFIERS = ['fallback', 'useCache', 'outputType']
// The `type` values SQL read as `flatten`, a rider kept from v2.15 and earlier
const SQL_RIDER = ['array', 'string', 'number']
// The keys of a node naming a function that v2 kept when it rewrote the call
const CALL_KEYS = ['fallback', 'outputType', 'type', 'useCache', 'args', 'input']

const NAMES = Object.fromEntries(
  Object.entries(V2_PARAMETERS).map(([operator, parameters]) => [
    operator,
    parameters.map(({ name }) => name),
  ])
) as Record<V2Operator, string[]>

const ALIASES = Object.fromEntries(
  Object.entries(V2_PARAMETERS).map(([operator, parameters]) => [
    operator,
    Object.fromEntries(parameters.flatMap(({ name, aliases }) => aliases.map((a) => [a, name]))),
  ])
) as Record<V2Operator, Record<string, string>>

// A value v2 worked out at evaluation: a node, a container, or an alias
const isComputed = (value: unknown) =>
  typeof value === 'object' ? value !== null : typeof value === 'string' && isAlias(value)

const below = (source: Source, key: string | number): Source =>
  source.entries?.[key] ?? { path: [...source.path, key] }

/** A path as an author reads it, relative to its node: `$plus.values` */
const display = (path: Path, node: Path) => {
  const relative = isUnder(path, node) && path.length > node.length ? path.slice(node.length) : path
  return relative
    .map((segment, i) =>
      typeof segment === 'number' ? `[${segment}]` : i === 0 ? segment : `.${segment}`
    )
    .join('')
}

/**
 * A node's operator as the input spelled it: a shorthand key's name, unless
 * the payload's own `operator` replaced it
 */
const spelling = (draft: Draft) => {
  const operator = draft.get('operator')
  const key = operator?.source.path.at(-1)
  if (typeof key === 'string' && isAlias(key)) return key.slice(1)
  const value = operator?.value
  return typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value))
}

/** Marks where a `children` mapping put a child, so its source can follow */
class Child {
  constructor(readonly index: number) {}
}

/**
 * A node's keys as stage 1 assembles them, each with its source. v2 built a
 * node by laying objects over each other, so a key set twice keeps the later
 * value, and the earlier is what v2 never read.
 */
class Draft {
  readonly entries = new Map<string, Located>()

  constructor(
    /** The node's own source */
    readonly source: Source,
    readonly issues: MigrationIssue[]
  ) {}

  get(key: string) {
    return this.entries.get(key)
  }

  has(key: string) {
    return this.entries.has(key)
  }

  /** Sets `key`, reporting a value it replaces as beaten by `winner` */
  set(key: string, entry: Located, winner = entry.source.path) {
    const replaced = this.entries.get(key)
    if (replaced) this.overridden(replaced.source.path, winner)
    this.entries.set(key, entry)
  }

  /** Removes `key`, reporting it as beaten by `winner` */
  drop(key: string, winner: Path) {
    const dropped = this.entries.get(key)
    if (dropped) this.overridden(dropped.source.path, winner)
    this.entries.delete(key)
  }

  /** Reports the value at `path` as never read, once however many keys lost */
  overridden(path: Path, winner: Path) {
    const reported = this.issues.some(
      ({ code, path: parent }) => code === 'overridden-value' && isUnder(path, parent)
    )
    if (reported) return
    const node = this.source.path
    const fill = { key: display(path, node), winner: display(winner, node) }
    this.issues.push(issue('overridden-value', path, fill))
  }
}

class Normalizer {
  readonly sources = new Map<object, NodeSource>()
  readonly issues: MigrationIssue[] = []
  private readonly fragments: PlainObject
  private readonly functions: Set<string>
  private readonly shorthand: boolean
  private readonly fullObject: boolean

  constructor(options: V2Options) {
    const { functions = {} } = options
    this.fragments = options.fragments ?? {}
    this.functions = new Set(Array.isArray(functions) ? functions : Object.keys(functions))
    this.shorthand = !options.noShorthand
    this.fullObject = options.evaluateFullObject === true
  }

  /** A value where v2 evaluated it */
  value(input: unknown, source: Source): unknown {
    if (Array.isArray(input)) {
      const output = input.map((element, i) => this.value(element, below(source, i)))
      return this.record(output, source)
    }
    if (!isPlainObject(input)) return input

    const mark = this.issues.length
    if (Object.hasOwn(input, 'fragment'))
      return this.fragmentCall(this.draft(input, source), input, mark)
    if (Object.hasOwn(input, 'operator'))
      return this.operatorNode(this.draft(input, source), input, mark)
    const expanded = this.expandShorthand(input, source, this.issues)
    if (expanded === undefined) return this.plain(input, source)
    return expanded.has('fragment')
      ? this.fragmentCall(expanded, input, mark)
      : this.operatorNode(expanded, input, mark)
  }

  private draft(input: PlainObject, source: Source) {
    const draft = new Draft(source, this.issues)
    for (const [key, value] of Object.entries(input))
      draft.set(key, { value, source: below(source, key) })
    return draft
  }

  /** A plain object: data, unless v2 was walking plain objects */
  private plain(input: PlainObject, source: Source): unknown {
    if (this.fullObject) return this.walk(input, source)
    // A container stage 1 built is new, and its entries need their sources
    return source.entries ? this.record(input, source) : input
  }

  /**
   * Whether v2 evaluated anything in a value as it is written: a node, a
   * call or shorthand, in an array, or in a plain object when v2 walked them
   */
  evaluates(value: unknown): boolean {
    if (Array.isArray(value)) return value.some((element) => this.evaluates(element))
    if (!isPlainObject(value)) return false
    if (hasNodeKey(value)) return true
    const shorthand = (key: string) =>
      this.shorthand &&
      isAlias(key) &&
      (v2OperatorFor(key.slice(1)) !== undefined ||
        Object.hasOwn(this.fragments, key.slice(1)) ||
        this.functions.has(key.slice(1)))
    if (Object.keys(value).some(shorthand)) return true
    return this.fullObject && Object.values(value).some((element) => this.evaluates(element))
  }

  /**
   * A plain object with each of its values normalized, apart from those of
   * the keys `skip` names
   */
  private walk(input: PlainObject, source: Source, skip: (key: string) => boolean = () => false) {
    const output = Object.fromEntries(
      Object.entries(input).map(([key, value]) => [
        key,
        skip(key) ? value : this.value(value, below(source, key)),
      ])
    )
    return this.record(output, source)
  }

  private record<T extends object>(object: T, source: Source): T {
    const keys = Object.fromEntries(
      Object.keys(object).map((key) => {
        const at = Array.isArray(object) ? Number(key) : key
        return [key, below(source, at).path]
      })
    )
    this.sources.set(object, { path: source.path, keys })
    return object
  }

  /**
   * Step 1, shorthand: a plain object's `$` keys that name an operator, a
   * fragment or a function, each payload read by what its name resolved to,
   * with the object's other keys laid over the result. `undefined` when no key
   * resolves, so the object is data.
   */
  private expandShorthand(input: PlainObject, source: Source, issues: MigrationIssue[]) {
    if (!this.shorthand) return undefined
    const draft = new Draft(source, issues)
    let resolved = false
    for (const [key, payload] of Object.entries(input))
      if (isAlias(key)) resolved = this.expand(draft, key, payload, below(source, key)) || resolved
    for (const [key, value] of Object.entries(input))
      if (!isAlias(key)) draft.set(key, { value, source: below(source, key) })
    return resolved ? draft : undefined
  }

  /** One shorthand key into the draft: `false` if its name resolves nowhere */
  private expand(draft: Draft, key: string, payload: unknown, at: Source): boolean {
    const name = key.slice(1)
    const single = (value: unknown): Located => ({
      value: [value],
      source: { path: at.path, entries: { 0: at } },
    })
    const spread = (object: PlainObject) => {
      for (const [k, value] of Object.entries(object)) draft.set(k, { value, source: below(at, k) })
    }

    const operator = v2OperatorFor(name)
    if (operator !== undefined) {
      if (Array.isArray(payload)) {
        draft.set('operator', { value: operator, source: at })
        draft.set('children', { value: payload, source: at })
      } else if (isPlainObject(payload) && !Object.keys(payload).some(isAlias)) {
        // A payload's own `fragment` makes the node a fragment call, whose body
        // replaced the operator
        if (Object.hasOwn(payload, 'fragment')) draft.overridden(at.path, [...at.path, 'fragment'])
        else draft.set('operator', { value: operator, source: at })
        spread(payload)
      } else {
        draft.set('operator', { value: operator, source: at })
        draft.set('children', single(payload))
      }
      return true
    }

    if (Object.hasOwn(this.fragments, name)) {
      draft.set('fragment', { value: name, source: at })
      if (!isPlainObject(payload)) draft.issues.push(issue('fragment-shorthand-payload', at.path))
      draft.set('parameters', { value: isPlainObject(payload) ? payload : {}, source: at })
      return true
    }

    if (this.functions.has(name)) {
      draft.set('operator', { value: name, source: at })
      if (Array.isArray(payload)) draft.set('args', { value: payload, source: at })
      else if (!isPlainObject(payload)) draft.set('args', single(payload))
      else if (Object.hasOwn(payload, 'input') || Object.hasOwn(payload, 'args')) spread(payload)
      else draft.set('input', { value: payload, source: at })
      return true
    }

    draft.set(key, { value: payload, source: at })
    return false
  }

  /** Steps 3 to 7, then the node's values */
  private operatorNode(draft: Draft, input: PlainObject, mark: number): unknown {
    const { source } = draft
    const name = draft.get('operator')?.value
    let ignored: PlainObject | undefined

    // Step 3: a call on a listed function, checked before any operator lookup
    let operator: V2Operator | undefined
    if (typeof name === 'string' && this.functions.has(name)) {
      ;({ draft, ignored } = this.explicitCall(draft))
      operator = 'CUSTOM_FUNCTIONS'
    } else if (typeof name === 'string') operator = v2OperatorFor(name)

    // Step 4: a name v2 could not resolve leaves the node unreadable
    if (operator === undefined)
      return this.asWritten(input, source, mark, {
        code: 'unknown-operator',
        at: draft.get('operator')?.source.path ?? source.path,
        name: spelling(draft),
      })

    // Step 5
    const node = this.parameterNames(draft, operator)

    // Step 6
    const children = node.get('children')
    if (children !== undefined) {
      node.entries.delete('children')
      const mapping = V2_CHILDREN[operator]
      if (Array.isArray(children.value)) this.mapChildren(node, operator, children)
      else if (typeof mapping !== 'function' && 'into' in mapping) node.set(mapping.into, children)
      else
        return this.asWritten(input, source, mark, {
          code: 'computed-children',
          at: children.source.path,
          name: spelling(draft),
        })
    }

    // A computed function name has no v3 spelling, since operator names are
    // literal
    const functionName = operator === 'CUSTOM_FUNCTIONS' ? node.get('functionName') : undefined
    if (functionName !== undefined && isComputed(functionName.value))
      return this.asWritten(input, source, mark, {
        code: 'computed-function-name',
        at: functionName.source.path,
      })

    // Step 7
    if (operator === 'MATCH') this.gatherBranches(node)

    return this.writeNode(node, operator, ignored)
  }

  /**
   * A node kept exactly as the input has it: an unknown operator, a computed
   * `children` that cannot be split, or a computed function or fragment name.
   * v2 evaluates it the same trivially. What stage 1 found on the way here is
   * moot, since stage 2 quotes the node whole.
   */
  private asWritten(
    input: PlainObject,
    source: Source,
    mark: number,
    quoted: NodeSource['quoted']
  ) {
    this.issues.length = mark
    const output = this.record({ ...input }, source)
    this.sources.get(output)!.quoted = quoted
    return output
  }

  /**
   * Step 3: the explicit form, as v2's `replaceCustomOperator` wrote it. The
   * node's other keys go into `input`; beside an `input` of its own, v2
   * discarded them, and they are kept aside for stage 2's `//` object.
   */
  private explicitCall(draft: Draft) {
    const operator = draft.get('operator')!
    const call = new Draft(draft.source, draft.issues)
    call.set('operator', { value: 'CUSTOM_FUNCTIONS', source: operator.source })
    call.set('functionName', operator)
    const rest: [string, Located][] = []
    for (const [key, entry] of draft.entries) {
      if (key === 'operator') continue
      if (CALL_KEYS.includes(key)) call.set(key, entry)
      else rest.push([key, entry])
    }
    if (rest.length === 0) return { draft: call }
    if (call.has('input'))
      return { draft: call, ignored: Object.fromEntries(rest.map(([k, { value }]) => [k, value])) }
    call.set('input', {
      value: Object.fromEntries(rest.map(([key, { value }]) => [key, value])),
      source: {
        path: draft.source.path,
        entries: Object.fromEntries(rest.map(([key, entry]) => [key, entry.source])),
      },
    })
    return { draft: call }
  }

  /**
   * Step 5: property aliases become names, a later spelling beating an
   * earlier as it did in v2, and `type` becomes `outputType`
   */
  private parameterNames(draft: Draft, operator: V2Operator) {
    const aliases = ALIASES[operator]
    const node = new Draft(draft.source, draft.issues)
    for (const [key, entry] of draft.entries)
      node.set(Object.hasOwn(aliases, key) ? aliases[key] : key, entry)

    // v2 read `outputType ?? type`, so an `outputType` of `null` never counted
    if (node.get('outputType')?.value == null) node.entries.delete('outputType')
    const type = node.get('type')
    const outputType = node.get('outputType')
    // PLUS's `type` is its own parameter
    if (type === undefined || operator === 'PLUS') return node
    if (operator === 'SQL' && isComputed(type.value)) return node
    node.entries.delete('type')
    if (operator === 'SQL' && SQL_RIDER.includes(type.value as string)) {
      // SQL read the rider whatever `outputType` said
      node.set('flatten', { value: true, source: type.source })
      if (outputType === undefined) node.set('outputType', type)
    } else if (outputType !== undefined) node.overridden(type.source.path, outputType.source.path)
    else node.set('outputType', type)
    return node
  }

  /**
   * Step 6: a literal `children` through the operator's mapping. Each
   * parameter it gives overrides the node's own, even where it gives
   * `undefined` for a missing child.
   */
  private mapChildren(node: Draft, operator: V2Operator, children: Located) {
    const list = children.value as readonly unknown[]
    const materialize = (shape: unknown): Located => {
      if (shape instanceof Child)
        return shape.index < list.length
          ? { value: list[shape.index], source: below(children.source, shape.index) }
          : { value: undefined, source: children.source }
      if (Array.isArray(shape) || isPlainObject(shape)) {
        const entries = Object.entries(shape).map(([key, s]) => [key, materialize(s)] as const)
        const values = entries.map(([key, { value }]) => [key, value])
        return {
          value: Array.isArray(shape)
            ? values.map(([, value]) => value)
            : Object.fromEntries(values),
          source: {
            path: children.source.path,
            entries: Object.fromEntries(entries.map(([key, { source }]) => [key, source])),
          },
        }
      }
      // A default the mapping supplied
      return { value: shape, source: node.source }
    }

    const shape = mapChildren(operator, list, (index) => new Child(index))
    for (const [key, mapped] of Object.entries(shape)) {
      const located = materialize(mapped)
      if (located.value === undefined) node.drop(key, children.source.path)
      else node.set(key, located, children.source.path)
    }
  }

  /**
   * Step 7: MATCH's branches on the node itself go into `branches`. A key
   * already there beats the node's own, and a `fallback` there makes them all
   * unreachable, since MATCH answered with it before reading the node. Beside
   * a computed `branches` they stay where they are.
   */
  private gatherBranches(node: Draft) {
    const known = ['operator', ...NAMES.MATCH, ...MODIFIERS]
    const roots = [...node.entries].filter(([key]) => !known.includes(key) && !isAlias(key))
    if (roots.length === 0) return
    const branches = node.get('branches')
    const value = branches?.value

    if (Array.isArray(value) || (isPlainObject(value) && !Object.hasOwn(value, 'operator'))) {
      const at = branches!.source
      const keys = Array.isArray(value)
        ? value.filter((_, i) => i % 2 === 0).map((key) => String(key))
        : Object.keys(value)
      const unreachable = keys.includes('fallback')
      const merged: [string, Located][] = []
      for (const [key, entry] of roots) {
        node.entries.delete(key)
        if (unreachable) node.issues.push(issue('unreachable-branches', entry.source.path))
        else if (keys.includes(key)) node.overridden(entry.source.path, [...at.path, key])
        else merged.push([key, entry])
      }
      if (merged.length === 0) return
      if (Array.isArray(value)) {
        const entries: Record<string, Source> = {}
        value.forEach((_, i) => (entries[i] = below(at, i)))
        merged.forEach(([, entry], i) => {
          entries[value.length + 2 * i] = entry.source
          entries[value.length + 2 * i + 1] = entry.source
        })
        const pairs = merged.flatMap(([key, { value }]) => [key, value])
        node.entries.set('branches', {
          value: [...value, ...pairs],
          source: { path: at.path, entries },
        })
      } else {
        const entries = Object.fromEntries(Object.keys(value).map((key) => [key, below(at, key)]))
        for (const [key, entry] of merged) entries[key] = entry.source
        node.entries.set('branches', {
          value: { ...value, ...Object.fromEntries(merged.map(([key, e]) => [key, e.value])) },
          source: { path: at.path, entries },
        })
      }
      return
    }

    // `branches ?? {}` in v2: a null or missing `branches` is none
    if (value !== undefined && value !== null) return
    for (const [key] of roots) node.entries.delete(key)
    node.entries.set('branches', {
      value: Object.fromEntries(roots.map(([key, { value }]) => [key, value])),
      source: {
        path: node.source.path,
        entries: Object.fromEntries(roots.map(([key, { source }]) => [key, source])),
      },
    })
  }

  /** The node, its keys in a fixed order and each value normalized */
  private writeNode(node: Draft, operator: V2Operator, ignored?: PlainObject) {
    const parameters = NAMES[operator]
    const order = ['operator', ...parameters, ...MODIFIERS]
    const keys = [
      ...order.filter((key) => node.has(key)),
      ...[...node.entries.keys()].filter((key) => !order.includes(key)),
    ]
    const contents = V2_BEHAVIOUR[operator]?.evaluatesContents ?? []
    const output: PlainObject = {}
    const keySources: Record<string, Path> = {}
    for (const key of keys) {
      const { value, source } = node.get(key)!
      keySources[key] = source.path
      if (key === 'operator') output[key] = operator
      else if (operator === 'MATCH' && key === 'branches')
        output[key] = this.matchBranches(value, source)
      else if (parameters.includes(key) && contents.includes(key))
        output[key] = this.contents(operator, this.value(value, source), source)
      else if (
        parameters.includes(key) ||
        MODIFIERS.includes(key) ||
        isAlias(key) ||
        key === 'type' ||
        // Branches left beside a computed `branches`, which MATCH evaluated
        operator === 'MATCH'
      )
        output[key] = this.value(value, source)
      // A key v2 ignored, which is data
      else output[key] = value
    }
    this.sources.set(output, {
      path: node.source.path,
      keys: keySources,
      ...(ignored && { ignored }),
    })
    return output
  }

  /**
   * The values of an object an operator evaluated itself (`evaluatesContents`):
   * each entry's `key` and `value` for BUILD_OBJECT, and each value otherwise.
   * STRING_SUBSTITUTION's `$` keys are data, since no token could read them.
   * With `evaluateFullObject` on, the object was walked already.
   */
  private contents(operator: V2Operator, value: unknown, source: Source): unknown {
    if (this.fullObject) return value
    if (operator === 'BUILD_OBJECT') {
      // An alternating array is paired only when evaluated, so its elements
      // are values
      if (!Array.isArray(value) || !value.every(isPlainObject)) return value
      const entries = value.map((element, i) => {
        if (hasNodeKey(element)) return element
        const at = below(source, i)
        const output = { ...element }
        for (const key of ['key', 'value'])
          if (Object.hasOwn(element, key)) output[key] = this.value(element[key], below(at, key))
        return this.record(output, at)
      })
      return this.record(entries, source)
    }
    if (!isPlainObject(value) || hasNodeKey(value)) return value
    return operator === 'STRING_SUBSTITUTION'
      ? this.walk(value, source, isAlias)
      : this.walk(value, source)
  }

  /**
   * MATCH evaluated its `branches` only when it was an operator node, and
   * otherwise the branch that matched, so an object is never read as
   * shorthand here
   */
  private matchBranches(value: unknown, source: Source): unknown {
    if (Array.isArray(value)) return this.value(value, source)
    if (!isPlainObject(value)) return value
    return Object.hasOwn(value, 'operator') ? this.value(value, source) : this.walk(value, source)
  }

  /**
   * Step 8: the call node's `$` arguments move into a literal `parameters`,
   * beneath its own keys, unless the body's own top level sets the same one,
   * which beat them in v2. With `evaluateFullObject` on, it beat a
   * `parameters` argument too, since v2 lifted those into the caller's
   * scope. The call's other keys stay as written, apart from the modifiers.
   * A computed name leaves the whole call as written, since v3's names are
   * literal.
   */
  private fragmentCall(draft: Draft, input: PlainObject, mark: number): unknown {
    const { source } = draft
    const fragment = draft.get('fragment')!
    // v2 evaluated the name, and a `$` name no alias defines stayed the name
    const named =
      typeof fragment.value === 'string' && Object.hasOwn(this.fragments, fragment.value)
    if (isComputed(fragment.value) && !named)
      return this.asWritten(input, source, mark, {
        code: 'computed-fragment-name',
        at: fragment.source.path,
      })
    const parameters = draft.get('parameters')
    const literal =
      parameters === undefined || (isPlainObject(parameters.value) && !hasNodeKey(parameters.value))
    const output: PlainObject = { fragment: fragment.value }
    const keySources: Record<string, Path> = { fragment: fragment.source.path }

    if (literal) {
      const at = parameters?.source ?? source
      const args = new Draft(source, draft.issues)
      const shadowing = this.bodyAliases(fragment.value)
      const shadowed = (key: string, path: Path) =>
        draft.issues.push(
          issue('shadowed-argument', path, { fragment: String(fragment.value), key })
        )
      for (const [key, value] of Object.entries((parameters?.value ?? {}) as PlainObject)) {
        const entry = { value, source: below(at, key) }
        if (!this.fullObject || !shadowing.has(key)) {
          args.set(key, entry)
          continue
        }
        shadowed(key, entry.source.path)
        // v2 evaluated it among the caller's aliases, then read the body's
        if (this.evaluates(value))
          draft.issues.push(issue('discarded-expression', entry.source.path))
      }
      for (const [key, entry] of draft.entries) {
        if (!isAlias(key)) continue
        const given = args.get(key)
        if (given !== undefined) args.overridden(entry.source.path, given.source.path)
        else if (shadowing.has(key)) shadowed(key, entry.source.path)
        else args.set(key, entry)
      }
      const values: PlainObject = {}
      const entries: Record<string, Source> = {}
      for (const [key, { value, source: from }] of args.entries) {
        values[key] = this.value(value, from)
        entries[key] = from
      }
      output.parameters = this.record(values, { path: at.path, entries })
      keySources.parameters = at.path
    } else {
      output.parameters = this.value(parameters!.value, parameters!.source)
      keySources.parameters = parameters!.source.path
    }

    for (const [key, { value, source: from }] of draft.entries) {
      if (key === 'fragment' || key === 'parameters' || (literal && isAlias(key))) continue
      // Arguments beside a computed `parameters` stay, and v2 evaluated them
      const evaluated = MODIFIERS.includes(key) || isAlias(key)
      output[key] = evaluated ? this.value(value, from) : value
      keySources[key] = from.path
    }
    this.sources.set(output, { path: source.path, keys: keySources })
    return output
  }

  /**
   * The `$` keys a fragment's body sets at its top level, after v2's shorthand
   * pass, where the body is an operator node. They beat a call-node argument
   * of the same name.
   */
  private bodyAliases(name: unknown): Set<string> {
    if (typeof name !== 'string' || !Object.hasOwn(this.fragments, name)) return new Set()
    const body = this.fragments[name]
    if (!isPlainObject(body)) return new Set()
    const keys = hasNodeKey(body)
      ? Object.keys(body)
      : [...(this.expandShorthand(body, { path: [] }, [])?.entries.keys() ?? [])]
    return new Set(keys.includes('operator') ? keys.filter(isAlias) : [])
  }
}

/**
 * v2 to canonical v2, with a source path for everything written and an issue
 * for everything dropped. The paths start from `at`, the expression's own
 * place: a fragment's body is at its name in the fragments object.
 */
export const normalizeV2 = (
  expression: unknown,
  options: V2Options = {},
  at: Path = []
): Normalized => {
  const normalizer = new Normalizer(options)
  const canonical = normalizer.value(expression, { path: at })
  return { expression: canonical, sources: normalizer.sources, issues: normalizer.issues }
}
