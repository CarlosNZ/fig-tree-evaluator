/**
 * The core operators' analyses ("The core operators" in
 * docs-dev/v3-specs/v3-operator-coverage.md): one `declareAnalysis` per
 * core operator, keyed by the built definition, so a host operator reusing
 * a core name never inherits one, and the root never carries them. They
 * are written as a host's are, with the same helpers, and the walk reads
 * them through the same call. Where the bag has nothing for a step, the
 * arithmetic over ranges and `firstNonNull`'s walk over its candidates, the
 * hook calls ./known.ts directly: an operator's step is that operator's
 * code. An operator listed with no hooks never fails of itself and returns
 * its `returns`.
 */
import { coreOperators } from '../operators'
import type { FailureEntry, OperatorAnalysis } from '../authoringTypes'
import type { ValidatedOperatorDefinition } from '../operatorDefinition'
import type { ExpectedType } from '../typeCheck'
import { declareAnalysis } from './declare'
import type { Helpers } from './helpers'
import {
  absOf,
  admitsNull,
  differenceOf,
  elementsOf,
  exactly,
  extremeOf,
  productOf,
  sumOf,
  union,
  unionOf,
  withoutNull,
} from './known'
import type { Known, Member } from './known'

type Params = Record<string, Known>

/** The two hooks, over the walk's own lists. */
interface Hooks {
  gamut?: (params: Params, helpers: Helpers) => Known
  failures?: FailureEntry[] | ((params: Params, helpers: Helpers) => FailureEntry[])
}

const NON_FINITE = 'non-finite-result'
const EMPTY = 'empty-aggregate'
const TYPE_CHECK = 'type-check'
const OPERATOR = 'operator-failure'

const OVERFLOW: FailureEntry = { code: NON_FINITE, overflow: true }

/** The analysis of an operator that never fails of itself. */
const NONE: Hooks = { failures: [] }

/** The types a literal parameter names where it is known; else anything. */
const typeNamed = (gamut: Known, helpers: Helpers): Known => {
  const names = helpers.exactValues(gamut)
  if (names === undefined) return helpers.type('any')
  return helpers.union(
    ...names
      .filter((name): name is string => typeof name === 'string')
      .map((name) => helpers.type(name as ExpectedType))
  )
}

/** Each candidate's non-null value, up to the first one never null. */
const firstNonNull = (known: Known): Known =>
  unionOf(
    known.map((member: Member): Known => {
      const items =
        'exact' in member
          ? Array.isArray(member.exact)
            ? Array.from(member.exact, (value) => exactly(value))
            : undefined
          : member.type === 'array'
            ? member.items
            : undefined
      if (items === undefined) return union(withoutNull(elementsOf([member])), exactly(null))
      const found: Known[] = []
      for (const item of items) {
        found.push(withoutNull(item))
        if (!admitsNull(item)) return unionOf(found)
      }
      return unionOf([...found, exactly(null)])
    })
  )

/** The kinds `plus` can be asked for, and that an operand can fail to be. */
const KINDS = ['number', 'string', 'array', 'object'] as const

/**
 * The hooks of each core operator that has any, by name. One with a `gamut`
 * alone still says `failures: []`, as a host's would: without it the
 * operator would be external.
 */
export const CORE_HOOKS: Record<string, Hooks> = {
  // ── Logic and control ───────────────────────────────────────────────
  if: {
    gamut: ({ then, else: otherwise }, h) => h.union(then, otherwise),
    failures: [],
  },
  match: {
    gamut: ({ branches, default: otherwise }, h) => h.union(h.valueOf(branches), otherwise),
    failures: (_, h) => [
      {
        code: OPERATOR,
        may: true,
        occurs: h.not(h.isSupplied('default')),
        message: "'default' is not supplied",
      },
    ],
  },
  firstNonNull: {
    gamut: ({ values }) => firstNonNull(values),
    failures: [],
  },

  // ── Arithmetic and math ─────────────────────────────────────────────
  plus: {
    // The sum, and whatever type `expect` names where it is given. The sum
    // stays: an infinite operand carries through, which the named type, the
    // finite numbers, does not admit
    gamut: ({ values, expect }, h) =>
      h.exactValues(expect) === undefined
        ? sumOf(values)
        : h.union(sumOf(values), typeNamed(expect, h)),
    failures: ({ values, expect }, h) => [
      {
        code: EMPTY,
        parameter: 'values',
        occurs: h.all(h.isEmpty(values), h.not(h.isSupplied('expect'))),
        message: "'values' is empty and 'expect' is not supplied",
      },
      // An empty `values` has no operand to be the wrong kind
      ...KINDS.map((kind) => ({
        code: TYPE_CHECK,
        parameter: 'values',
        occurs: h.all(
          h.is(expect, kind),
          h.not(h.isType(h.elementOf(values), kind)),
          h.not(h.isEmpty(values))
        ),
        message: `'expect' is ${kind} and an operand is not a ${kind}`,
      })),
      OVERFLOW,
    ],
  },
  subtract: {
    gamut: ({ value, minus }) => differenceOf(value, minus),
    failures: [OVERFLOW],
  },
  multiply: {
    gamut: ({ values }) => productOf(values),
    failures: [OVERFLOW],
  },
  divide: {
    failures: ({ by }, h) => [
      { code: NON_FINITE, parameter: 'by', occurs: h.is(by, 0), message: "'by' is 0" },
      OVERFLOW,
    ],
  },
  modulo: {
    failures: ({ mod }, h) => [
      { code: NON_FINITE, parameter: 'mod', occurs: h.is(mod, 0), message: "'mod' is 0" },
      OVERFLOW,
    ],
  },
  power: {
    failures: ({ base, exponent }, h) => [
      {
        code: NON_FINITE,
        parameter: 'base',
        occurs: h.all(h.is(base, 0), h.isBelow(exponent, 0)),
        message: "'base' is 0 and 'exponent' is below 0",
      },
      // Not certain: an infinite base or exponent can make it 0 instead
      {
        code: NON_FINITE,
        parameter: 'base',
        may: true,
        occurs: h.all(h.isBelow(base, 0), h.not(h.isType(exponent, 'integer'))),
        message: "'base' is below 0 and 'exponent' is not an integer",
      },
      {
        code: NON_FINITE,
        parameter: 'exponent',
        may: true,
        occurs: h.not(h.isBelow(exponent, 100)),
        message: "'exponent' is 100 or more",
      },
      OVERFLOW,
    ],
  },
  round: {
    // 10^decimals is infinite from about 309, so the shift overflows on an
    // ordinary value well before; below 300 it takes an extreme one
    failures: ({ decimals }, h) => [
      {
        code: NON_FINITE,
        parameter: 'decimals',
        may: true,
        occurs: h.not(h.isBelow(decimals, 300)),
        message: "'decimals' is 300 or more",
      },
      OVERFLOW,
    ],
  },
  abs: {
    gamut: ({ value }) => absOf(value),
    failures: [],
  },
  min: {
    gamut: ({ values }) => extremeOf(values, 'min'),
    failures: ({ values }, h) => [
      { code: EMPTY, parameter: 'values', occurs: h.isEmpty(values), message: "'values' is empty" },
    ],
  },
  max: {
    gamut: ({ values }) => extremeOf(values, 'max'),
    failures: ({ values }, h) => [
      { code: EMPTY, parameter: 'values', occurs: h.isEmpty(values), message: "'values' is empty" },
    ],
  },

  // ── String ──────────────────────────────────────────────────────────
  split: {
    // An empty delimiter splits into code points, so '' gives no piece at
    // all; any other delimiter gives at least one
    gamut: ({ delimiter }, h) => {
      const strings = h.type('string')
      const pieces = h.arrayOf(strings, { minLength: 1 })
      const empty = h.is(delimiter, '')
      return empty === 'yes'
        ? h.arrayOf(strings)
        : empty === 'no'
          ? pieces
          : h.union(h.arrayOf(strings), pieces)
    },
    failures: [],
  },
  regex: {
    // By `mode`'s exact value, or every mode where it is not known
    gamut: ({ mode, noMatchDefault }, h) => {
      const by: Record<string, () => Known> = {
        test: () => h.type('boolean'),
        extract: () => h.union(h.type('string'), noMatchDefault),
        match: () => h.arrayOf(h.type('string')),
        replace: () => h.type('string'),
      }
      const modes =
        h
          .exactValues(mode)
          ?.filter((value): value is string => typeof value === 'string' && value in by) ??
        Object.keys(by)
      return h.union(...modes.map((value) => by[value]()))
    },
    failures: (_, h) => [
      {
        code: OPERATOR,
        parameter: 'flags',
        occurs: h.refused('flags'),
        message: "'flags' is refused by its validation",
      },
      {
        code: OPERATOR,
        parameter: 'pattern',
        occurs: h.refused('pattern'),
        message: "'pattern' is refused by its validation",
      },
    ],
  },

  // ── Arrays and iteration ────────────────────────────────────────────
  length: {
    gamut: ({ value }, h) => h.lengthOf(value),
    failures: [],
  },
  map: {
    gamut: ({ each }, h) => h.arrayOf(each),
    failures: [],
  },
  filter: {
    gamut: ({ input }, h) => h.arrayOf(h.elementOf(input)),
    failures: [],
  },
  find: {
    gamut: ({ input, noMatchDefault }, h) => h.union(h.elementOf(input), noMatchDefault),
    failures: [],
  },

  // ── Data ────────────────────────────────────────────────────────────
  get: {
    failures: (_, h) => [
      {
        code: OPERATOR,
        parameter: 'path',
        occurs: h.refused('path'),
        message: "'path' is refused by its validation",
      },
      {
        code: 'missing-data-path',
        may: true,
        options: { strictDataPaths: true },
        occurs: h.not(h.isSupplied('default')),
        message: "'default' is not supplied",
      },
    ],
  },

  // ── Special ─────────────────────────────────────────────────────────
  convert: {
    gamut: ({ to }, h) => typeNamed(to, h),
    failures: ({ value, to }, h) => {
      const composite = h.isType(value, ['array', 'object'])
      const text = h.isType(value, 'string')
      return [
        {
          code: OPERATOR,
          occurs: h.all(h.is(to, 'number'), composite),
          message: "'to' is number and 'value' is an array or object",
        },
        {
          code: OPERATOR,
          may: true,
          occurs: h.all(h.is(to, 'number'), text),
          message: "'to' is number and 'value' is a string",
        },
        {
          code: NON_FINITE,
          may: true,
          occurs: h.all(h.is(to, 'number'), text),
          message: "'to' is number and 'value' is a string",
        },
        {
          code: OPERATOR,
          occurs: h.all(h.is(to, 'string'), composite),
          message: "'to' is string and 'value' is an array or object",
        },
      ]
    },
  },
}

let core: Map<ValidatedOperatorDefinition, OperatorAnalysis> | undefined

/** Every core operator's analysis, by its definition. */
export const coreAnalyses = (): ReadonlyMap<ValidatedOperatorDefinition, OperatorAnalysis> =>
  (core ??= new Map(
    coreOperators.map((built) => [
      built,
      declareAnalysis(built, (CORE_HOOKS[built.name] ?? NONE) as never),
    ])
  ))

/**
 * Whether an operator is one of the core's: its body is run where enough
 * is known (rule 4), since it depends on nothing but its parameters, and
 * never waits on anything outside the evaluation.
 */
export const isCore = (definition: ValidatedOperatorDefinition): boolean =>
  coreAnalyses().has(definition)

/**
 * An operator's analysis: the host's declaration for it, else the core's,
 * else none, which makes it external.
 */
export const analysisOf = (
  definition: ValidatedOperatorDefinition,
  analyses: ReadonlyMap<ValidatedOperatorDefinition, OperatorAnalysis>
): OperatorAnalysis | 'external' =>
  analyses.get(definition) ?? coreAnalyses().get(definition) ?? 'external'
