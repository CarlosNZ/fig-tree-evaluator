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
import type { FigTreeOptions } from './options'
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
  'an object of strings, numbers or booleans',
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

const checkBlock = (block: object, rules: Rules, path: string[], issues: Issue[]): void => {
  for (const [key, value] of Object.entries(block)) {
    if (value === undefined) continue
    const at = [...path, key]
    const name = `'${at.join('.')}'`
    const rule = Object.hasOwn(rules, key) ? rules[key] : undefined
    if (rule === undefined) {
      const suggestion = nearestName(key, Object.keys(rules))
      issues.push({
        ...error(`${name} is not an option${didYouMean(suggestion)}`, at),
        ...(suggestion !== undefined ? { suggestion } : {}),
      })
    } else if (Array.isArray(rule)) {
      if (!rule[0](value)) issues.push(error(`${name} must be ${rule[1]}`, at))
    } else if (!isPlainDataObject(value)) issues.push(error(`${name} must be an object`, at))
    else checkBlock(value, rule, at, issues)
  }
}

const error = (message: string, path: string[]): Issue => ({
  severity: 'error',
  code: ErrorCodes.invalidOptions,
  message,
  path,
})
