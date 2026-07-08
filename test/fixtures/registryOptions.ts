/**
 * Registry-assembly fixtures for the Phase-2.2 suite ("Operator registration"
 * and "operatorDefaults" in the Options area of docs-dev/v3-specs/v3-api.md;
 * naming rules 1-5 in its Operators area).
 *
 * The collision matrix exercises the one-namespace rule across names and
 * aliases, including identity duplicates ("no silent precedence" — ruled to
 * error, July 2026). The `operatorDefaults` matrix covers the construction
 * -time validation set: unknown operator, alias key, unknown parameter, type
 * mismatch, the required-parameter ban (Q12), and the legal targets.
 */
import { defineOperator, ErrorCodes, type ValidatedOperatorDefinition } from '../../src'

/** A minimal branded operator, fresh per call. */
export const makeOp = (name: string, alias?: string): ValidatedOperatorDefinition =>
  defineOperator({
    name,
    ...(alias !== undefined ? { alias } : {}),
    description: `Test operator ${name}`,
    parameters: {},
    evaluate: () => null,
  })

/**
 * An `equal`-like operator giving the `operatorDefaults` matrix each target
 * class: a required parameter, an optional-with-default and an
 * optional-without-default.
 */
export const equalLike = (): ValidatedOperatorDefinition =>
  defineOperator({
    name: 'equal',
    alias: '=',
    description: 'Equality comparison',
    parameters: {
      values: { type: 'array' },
      caseInsensitive: { type: 'boolean', default: false },
      nullEqualsUndefined: { type: 'boolean', required: false },
    },
    positionalParams: ['...values'],
    evaluate: ({ values }) => values,
  })

// ── Collision matrix ────────────────────────────────────────────────────

export interface CollisionFixture {
  id: string
  operators: (ValidatedOperatorDefinition | ValidatedOperatorDefinition[])[]
  /** Where the second (offending) claim sits in the authored array. */
  pathTail: (string | number)[]
}

const alphaTwice = makeOp('alpha')
const packTwice = [makeOp('alpha'), makeOp('beta')]

export const collisionFixtures: CollisionFixture[] = [
  {
    id: 'same-name-across-arrays',
    operators: [[makeOp('alpha')], [makeOp('alpha')]],
    pathTail: ['operators', 1, 0],
  },
  {
    id: 'name-collides-with-earlier-alias',
    operators: [makeOp('alpha', 'gamma'), makeOp('gamma')],
    pathTail: ['operators', 1],
  },
  {
    id: 'alias-collides-with-earlier-name',
    operators: [makeOp('gamma'), makeOp('alpha', 'gamma')],
    pathTail: ['operators', 1],
  },
  {
    id: 'alias-collides-with-alias',
    operators: [makeOp('alpha', '@'), makeOp('beta', '@')],
    pathTail: ['operators', 1],
  },
  {
    id: 'identical-definition-twice',
    operators: [alphaTwice, alphaTwice],
    pathTail: ['operators', 1],
  },
  {
    id: 'identical-pack-twice',
    operators: [packTwice, packTwice],
    pathTail: ['operators', 1, 0],
  },
]

// ── operatorDefaults matrix ─────────────────────────────────────────────

export interface OperatorDefaultsFixture {
  id: string
  operatorDefaults: Record<string, unknown>
  /** Null for the legal rows — construction must succeed. */
  expected: { code: string; pathTail: (string | number)[] } | null
}

export const operatorDefaultsFixtures: OperatorDefaultsFixture[] = [
  {
    id: 'unknown-operator-key',
    operatorDefaults: { flibble: { x: 1 } },
    expected: {
      code: ErrorCodes.unknownOperator,
      pathTail: ['operatorDefaults', 'flibble'],
    },
  },
  {
    id: 'alias-as-key',
    operatorDefaults: { '=': { caseInsensitive: true } },
    expected: { code: ErrorCodes.invalidOptions, pathTail: ['operatorDefaults', '='] },
  },
  {
    id: 'defaults-block-not-an-object',
    operatorDefaults: { equal: 'nope' },
    expected: { code: ErrorCodes.invalidOptions, pathTail: ['operatorDefaults', 'equal'] },
  },
  {
    id: 'unknown-parameter',
    operatorDefaults: { equal: { colour: 'red' } },
    expected: {
      code: ErrorCodes.invalidOptions,
      pathTail: ['operatorDefaults', 'equal', 'colour'],
    },
  },
  {
    id: 'value-fails-declared-type',
    operatorDefaults: { equal: { caseInsensitive: 'yes' } },
    expected: {
      code: ErrorCodes.typeCheck,
      pathTail: ['operatorDefaults', 'equal', 'caseInsensitive'],
    },
  },
  {
    id: 'targets-required-parameter',
    operatorDefaults: { equal: { values: [1, 2] } },
    expected: {
      code: ErrorCodes.invalidOptions,
      pathTail: ['operatorDefaults', 'equal', 'values'],
    },
  },
  {
    id: 'useCache-modifier-not-boolean',
    operatorDefaults: { equal: { useCache: 'yes' } },
    expected: {
      code: ErrorCodes.invalidOptions,
      pathTail: ['operatorDefaults', 'equal', 'useCache'],
    },
  },
  {
    id: 'overrides-a-declared-default',
    operatorDefaults: { equal: { caseInsensitive: true } },
    expected: null,
  },
  {
    // The load-bearing legal case: the host-wide nullValueDefault opt-out
    // depends on optional-without-default targets staying legal
    id: 'targets-optional-without-default',
    operatorDefaults: { equal: { nullEqualsUndefined: true } },
    expected: null,
  },
  {
    id: 'fallback-modifier-any-constant',
    operatorDefaults: { equal: { fallback: 0 } },
    expected: null,
  },
  {
    id: 'useCache-modifier-boolean',
    operatorDefaults: { equal: { useCache: true } },
    expected: null,
  },
]
