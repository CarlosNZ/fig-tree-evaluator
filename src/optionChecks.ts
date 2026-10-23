/**
 * The checks on the options' own values ("The shape" in the Options area of
 * docs-dev/v3-specs/v3-api.md): one table of rules and one walk over it,
 * run wherever options arrive — on the merged options at construction,
 * `updateOptions()` and `with()`, and on a call's own options.
 *
 * The walk sees options after the merge, so a `null` has already removed
 * its key and never reaches a rule. What it does see is what the engine
 * will run with: a block is checked whole, the keys an update supplied
 * together with the ones it left in place.
 *
 * The registry options pass through here unchecked: what they hold is
 * checked against the registry being built (src/registry.ts), which takes
 * the issues found here so that one throw reports them all.
 */
import { ErrorCodes } from './errorCodes'
import type { Issue } from './issues'
import type { CallOptions, FigTreeOptions } from './options'
import { isPlainDataObject } from './plainData'
import type { CacheStore } from './types'
import { didYouMean, nearestName } from './utils'

/**
 * A test, and what it expects, as the message completes it: `'maxDepth'
 * must be <expects>`.
 */
type Check = [test: (value: unknown) => boolean, expects: string]
interface Rules {
  [key: string]: Check | Rules
}

/** The rules of one block: every key of it, and no other. */
type BlockRules<Key extends keyof FigTreeOptions> = Record<
  keyof NonNullable<FigTreeOptions[Key]>,
  Check
>

/** Checked elsewhere, or anything at all. */
const ANY: Check = [() => true, '']

const boolean: Check = [(value) => typeof value === 'boolean', 'true or false']

const count: Check = [
  (value) => Number.isInteger(value) && (value as number) >= 0,
  'a whole number, 0 or more',
]

/**
 * What the header chain sends (`mergeHeaders`, src/operators/ioHelpers.ts):
 * a string, a number or a boolean as text, and a `null` removes the header.
 * The merge stops above a header map, so a `null` in one is stored.
 */
const headers: Check = [
  (value) =>
    isPlainDataObject(value) &&
    Object.values(value).every(
      (header) =>
        header === null ||
        typeof header === 'string' ||
        typeof header === 'number' ||
        typeof header === 'boolean'
    ),
  'an object of strings, numbers, booleans or nulls',
]

/**
 * By shape rather than `instanceof`, like the `cache.store` check: a signal
 * from another realm (an iframe, a `vm` context, a polyfill) works exactly
 * as well, since the engine only ever reads `aborted` and `reason` and
 * subscribes to `abort`.
 */
const isAbortSignal = (value: unknown): value is AbortSignal =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as AbortSignal).aborted === 'boolean' &&
  typeof (value as AbortSignal).addEventListener === 'function' &&
  typeof (value as AbortSignal).removeEventListener === 'function'

const isCacheStore = (value: unknown): value is CacheStore =>
  typeof value === 'object' &&
  value !== null &&
  (['get', 'set', 'delete', 'clear'] as const).every(
    (method) => typeof (value as Record<string, unknown>)[method] === 'function'
  )

/**
 * Every option, so a key missing from here is refused as unknown and the
 * `satisfies` fails the build until it is added.
 *
 * `undefined` is the one spelling of "no limit": `timeout`, `maxDepth` and
 * `maxNodes` refuse `Infinity`, and `timeout` refuses zero. `cache.maxTime`
 * takes `Infinity` for entries that never expire, and refuses zero, which
 * would mean "cache nothing", what `noCache` already says per operator or
 * per subtree.
 */
const OPTION_RULES = {
  data: ANY,
  fragments: ANY,
  operators: ANY,
  operatorDefaults: ANY,
  http: {
    // `''` is unset, as a relative `url` already reads it
    baseEndpoint: [
      (value) => typeof value === 'string' && (value === '' || /^https?:\/\//i.test(value)),
      "an http(s) URL, or ''",
    ],
    headers,
  } satisfies BlockRules<'http'>,
  graphQL: {
    endpoint: [(value) => typeof value === 'string', 'a string'],
    headers,
  } satisfies BlockRules<'graphQL'>,
  strictDataPaths: boolean,
  maxDepth: count,
  maxNodes: count,
  timeout: [
    (value) => typeof value === 'number' && Number.isFinite(value) && value > 0,
    'a positive number of milliseconds',
  ],
  signal: [isAbortSignal, 'an AbortSignal'],
  cache: {
    store: [isCacheStore, 'an object with get, set, delete and clear methods'],
    maxSize: [(value) => Number.isInteger(value) && (value as number) >= 1, 'a positive integer'],
    maxTime: [
      (value) => typeof value === 'number' && value > 0,
      'a positive number of seconds, or Infinity',
    ],
  } satisfies BlockRules<'cache'>,
  trace: boolean,
} satisfies Record<keyof FigTreeOptions, Check | Rules>

/**
 * Every problem with the options' values, each an `invalid-options` issue
 * at its path: a value its rule refuses, a block that is not an object, or
 * a key no rule names. An `undefined` value is "not supplied".
 */
export const optionIssues = (options: object): Issue[] => {
  const issues: Issue[] = []
  checkBlock(options, OPTION_RULES, [], issues)
  return issues
}

/**
 * The path is built only for an issue or a block to descend into: the
 * call's own options are checked on every evaluation, and a clean key
 * should cost no more than its rule.
 */
const checkBlock = (block: object, rules: Rules, path: string[], issues: Issue[]): void => {
  for (const [key, value] of Object.entries(block)) {
    if (value === undefined) continue
    const rule = Object.hasOwn(rules, key) ? rules[key] : undefined
    if (rule === undefined) issues.push(unknownKeyIssue(key, Object.keys(rules), [...path, key]))
    else if (Array.isArray(rule)) {
      if (!rule[0](value)) issues.push(error(`must be ${rule[1]}`, [...path, key]))
    } else if (!isPlainDataObject(value)) issues.push(error('must be an object', [...path, key]))
    else checkBlock(value, rule, [...path, key], issues)
  }
}

/**
 * The request-scoped options — the whole of what a call may supply
 * ("Per-call options" in the Options area of docs-dev/v3-specs/v3-api.md).
 * The keys of `CallOptions`, spelled out because a type has no runtime
 * form. The `satisfies` holds the two in step in both directions: a
 * `Record` over the type's keys must name every one of them, and an excess
 * key is refused, so a key added to `CallOptions` and not here (or the
 * reverse) fails the build.
 */
const CALL_OPTION_KEYS = { data: 0, signal: 0, timeout: 0, trace: 0 } satisfies Record<
  keyof CallOptions,
  unknown
>

/**
 * The problem with one of a call's own options, or nothing. Each is a
 * single value with a rule of its own, so the call's loop over its keys
 * checks them as it goes, with no second walk and nothing allocated for a
 * clean call.
 *
 * A key that is an option but not a per-call one is refused by naming the
 * request-scoped set, since the caller's next question is what IS
 * allowed. `cache` is the one that might have been expected to work — the
 * store is instance-lived, so a per-call block could only ever be
 * ignored, and refusing is the reversible direction: honouring it later
 * is additive, where quietly ignoring it and then honouring it would
 * change the meaning of expressions already in the field. A key that is
 * no option at all is refused as one, its did-you-mean drawn from the
 * per-call keys alone, since suggesting an instance option would only
 * lead to the refusal above.
 */
export const callOptionIssue = (key: string, value: unknown): Issue | undefined => {
  if (Object.hasOwn(CALL_OPTION_KEYS, key)) {
    const [test, expects] = OPTION_RULES[key as keyof CallOptions]
    return test(value) ? undefined : error(`must be ${expects}`, [key])
  }
  if (Object.hasOwn(OPTION_RULES, key))
    return error(
      'is not a per-call option — a call may supply data, signal, timeout and trace; configure the rest at construction or via updateOptions()',
      [key]
    )
  return unknownKeyIssue(key, Object.keys(CALL_OPTION_KEYS), [key])
}

const unknownKeyIssue = (key: string, known: string[], path: string[]): Issue => {
  const suggestion = nearestName(key, known)
  return {
    ...error(`is not an option${didYouMean(suggestion)}`, path),
    ...(suggestion !== undefined ? { suggestion } : {}),
  }
}

/** An issue about the option at `path`, its message led by the option. */
const error = (problem: string, path: string[]): Issue => ({
  severity: 'error',
  code: ErrorCodes.invalidOptions,
  message: `'${path.join('.')}' ${problem}`,
  path,
})
