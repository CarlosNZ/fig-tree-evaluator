/**
 * Operator-definition fixtures for the Phase-2.1 `defineOperator()` suite
 * ("Registration & validation" in docs-dev/v3-specs/v3-operator-contract.md).
 *
 * The valid exemplars model the contract's worked examples plus each
 * capability corner (conditional null policy, `replacesNullAt`,
 * `timeoutParam`, the `EvaluationData` sentinel). `invalidDefinitions` is the
 * fixture-per-registration-error table the implementation plan requires: one
 * row per violation of the contract's validation list, carrying the issue
 * code and path the throw must include.
 */
import { EvaluationData, ErrorCodes, type OperatorDefinition } from '../../src'

/** A fresh minimal valid definition — callers may mutate their copy freely. */
export const validDefinition = (): OperatorDefinition => ({
  name: 'testOp',
  description: 'A minimal valid operator for tests',
  parameters: {
    value: { type: 'number' },
  },
  evaluate: ({ value }) => value,
})

// ── Valid exemplars ─────────────────────────────────────────────────────

/** The contract's `clamp` example: eager parameters, layered defaults. */
export const clampLike = (): OperatorDefinition => ({
  name: 'clamp',
  description: 'Constrain a number to a range',
  parameters: {
    value: { type: ['number', 'null'] },
    min: { type: 'number', default: 0 },
    max: { type: 'number', default: 1 },
  },
  positionalParams: ['value', 'min', 'max'],
  useCache: false,
  evaluate: ({ value, min, max }) => Math.min(max, Math.max(min, value)),
})

/** The contract's `if` example: alias, truthiness, lazy branches. */
export const ifLike = (): OperatorDefinition => ({
  name: 'if',
  alias: '?',
  description: 'Conditional branching',
  parameters: {
    condition: { type: 'any', truthiness: true },
    then: { type: 'any', evaluation: 'lazy' },
    else: { type: 'any', evaluation: 'lazy', default: null },
  },
  positionalParams: ['condition', 'then', 'else'],
  evaluate: ({ condition, then, else: otherwise }) =>
    condition ? then.evaluate() : otherwise.evaluate(),
})

/**
 * The conditional null policy's sole contract holder: `value`'s policy keyed
 * to the `to` mode selector, compiled to a table at registration.
 */
export const convertLike = (): OperatorDefinition => ({
  name: 'convert',
  description: 'Convert a value to a target type',
  parameters: {
    value: {
      type: 'any',
      nullPolicy: (to) => (to === 'boolean' ? 'value' : 'propagate'),
    },
    to: { type: { literal: ['number', 'string', 'boolean', 'array'] } },
  },
  positionalParams: ['value', 'to'],
  evaluate: ({ value }) => value,
})

/** The compiled policy table `convertLike` must produce, verbatim. */
export const convertLikeCompiledPolicy = {
  selector: 'to',
  table: [
    { value: 'number', policy: 'propagate' },
    { value: 'string', policy: 'propagate' },
    { value: 'boolean', policy: 'value' },
    { value: 'array', policy: 'propagate' },
  ],
}

/** A `…Default` null-replacement holder (ledger #18). */
export const nullReplacerLike = (): OperatorDefinition => ({
  name: 'plusish',
  description: 'Sum with an authored null replacement',
  parameters: {
    values: { type: 'array', elementNullPolicy: 'propagate' },
    nullValueDefault: {
      type: 'any',
      evaluation: 'lazy',
      required: false,
      replacesNullAt: ['values'],
    },
  },
  positionalParams: ['...values'],
  evaluate: ({ values }) => values,
})

/** An I/O-shaped definition: `timeoutParam`, `readsOptions`, manual cache. */
export const httpLike = (): OperatorDefinition => ({
  name: 'http',
  description: 'HTTP request',
  parameters: {
    url: { type: 'string' },
    requestTimeout: { type: 'integer', required: false },
  },
  positionalParams: ['url'],
  timeoutParam: 'requestTimeout',
  readsOptions: ['http'],
  useCache: true,
  cache: 'manual',
  returns: 'any',
  evaluate: ({ url }) => url,
})

/**
 * The `EvaluationData` sentinel holder (`get.from`): the declared type does
 * NOT admit the sentinel value itself, proving the default-fits-type check is
 * skipped for it.
 */
export const getFromLike = (): OperatorDefinition => ({
  name: 'getish',
  description: 'Drill a path into data or a supplied object',
  parameters: {
    path: { type: 'string' },
    from: { type: ['object', 'array'], default: EvaluationData },
  },
  positionalParams: ['path', 'from'],
  returns: 'any',
  evaluate: ({ path }) => path,
})

// ── The invalid-definition table ────────────────────────────────────────

export interface InvalidDefinitionFixture {
  /** Stable row id shown in test output. */
  id: string
  /** The malformed definition, as a host might author it. */
  definition: unknown
  /** An issue the thrown error must carry. */
  expected: {
    code: string
    /** When set, some matching issue's path must end with these segments. */
    pathTail?: (string | number)[]
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const base = (): any => validDefinition()

const withField = (field: string, value: unknown): unknown => {
  const definition = base()
  definition[field] = value
  return definition
}

const withoutField = (field: string): unknown => {
  const definition = base()
  delete definition[field]
  return definition
}

const withParams = (parameters: Record<string, unknown>): unknown => {
  const definition = base()
  definition.parameters = parameters
  return definition
}

const withValueParam = (declaration: unknown): unknown =>
  withParams({ value: declaration })
/* eslint-enable @typescript-eslint/no-explicit-any */

export const invalidDefinitions: InvalidDefinitionFixture[] = [
  // Structural gate — missing/mistyped load-bearing fields (fail fast)
  {
    id: 'not-an-object',
    definition: 42,
    expected: { code: ErrorCodes.invalidDefinition },
  },
  {
    id: 'name-missing',
    definition: withoutField('name'),
    expected: { code: ErrorCodes.invalidDefinition, pathTail: ['name'] },
  },
  {
    id: 'name-not-a-string',
    definition: withField('name', 5),
    expected: { code: ErrorCodes.invalidDefinition, pathTail: ['name'] },
  },
  {
    id: 'description-missing',
    definition: withoutField('description'),
    expected: { code: ErrorCodes.invalidDefinition, pathTail: ['description'] },
  },
  {
    id: 'description-empty',
    definition: withField('description', ''),
    expected: { code: ErrorCodes.invalidDefinition, pathTail: ['description'] },
  },
  {
    id: 'parameters-missing',
    definition: withoutField('parameters'),
    expected: { code: ErrorCodes.invalidDefinition, pathTail: ['parameters'] },
  },
  {
    id: 'parameters-not-an-object',
    definition: withField('parameters', ['value']),
    expected: { code: ErrorCodes.invalidDefinition, pathTail: ['parameters'] },
  },
  {
    id: 'evaluate-missing',
    definition: withoutField('evaluate'),
    expected: { code: ErrorCodes.invalidDefinition, pathTail: ['evaluate'] },
  },
  {
    id: 'evaluate-not-a-function',
    definition: withField('evaluate', 'nope'),
    expected: { code: ErrorCodes.invalidDefinition, pathTail: ['evaluate'] },
  },

  // Optional definition-level fields, wrong shapes
  {
    id: 'validate-not-a-function',
    definition: withField('validate', true),
    expected: { code: ErrorCodes.invalidDefinition, pathTail: ['validate'] },
  },
  {
    id: 'alias-not-a-string',
    definition: withField('alias', 7),
    expected: { code: ErrorCodes.invalidDefinition, pathTail: ['alias'] },
  },
  {
    id: 'useCache-not-a-boolean',
    definition: withField('useCache', 'yes'),
    expected: { code: ErrorCodes.invalidDefinition, pathTail: ['useCache'] },
  },
  {
    id: 'cache-outside-vocabulary',
    definition: withField('cache', 'sometimes'),
    expected: { code: ErrorCodes.invalidDefinition, pathTail: ['cache'] },
  },
  {
    id: 'readsOptions-not-a-string-array',
    definition: withField('readsOptions', 'http'),
    expected: { code: ErrorCodes.invalidDefinition, pathTail: ['readsOptions'] },
  },
  {
    id: 'metadata-not-an-object',
    definition: withField('metadata', 'x'),
    expected: { code: ErrorCodes.invalidDefinition, pathTail: ['metadata'] },
  },
  {
    id: 'positionalParams-not-a-string-array',
    definition: withField('positionalParams', 'value'),
    expected: { code: ErrorCodes.invalidDefinition, pathTail: ['positionalParams'] },
  },
  {
    id: 'timeoutParam-not-a-string',
    definition: withField('timeoutParam', 5),
    expected: { code: ErrorCodes.invalidDefinition, pathTail: ['timeoutParam'] },
  },

  // Name legality + reservation (shared rule, Node grammar)
  {
    id: 'name-empty',
    definition: withField('name', ''),
    expected: { code: ErrorCodes.invalidName, pathTail: ['name'] },
  },
  {
    id: 'name-contains-dot',
    definition: withField('name', 'foo.bar'),
    expected: { code: ErrorCodes.invalidName, pathTail: ['name'] },
  },
  {
    id: 'name-contains-bracket',
    definition: withField('name', 'foo[0]'),
    expected: { code: ErrorCodes.invalidName, pathTail: ['name'] },
  },
  {
    id: 'name-leading-dollar',
    definition: withField('name', '$foo'),
    expected: { code: ErrorCodes.invalidName, pathTail: ['name'] },
  },
  {
    id: 'name-reserved-namespace',
    definition: withField('name', 'data'),
    expected: { code: ErrorCodes.reservedName, pathTail: ['name'] },
  },
  {
    id: 'name-reserved-namespace-short-form',
    definition: withField('name', 'e'),
    expected: { code: ErrorCodes.reservedName, pathTail: ['name'] },
  },
  {
    id: 'name-reserved-literal',
    definition: withField('name', 'literal'),
    expected: { code: ErrorCodes.reservedName, pathTail: ['name'] },
  },
  {
    id: 'name-reserved-node-key',
    definition: withField('name', 'fallback'),
    expected: { code: ErrorCodes.reservedName, pathTail: ['name'] },
  },
  {
    id: 'alias-illegal',
    definition: withField('alias', '$?'),
    expected: { code: ErrorCodes.invalidName, pathTail: ['alias'] },
  },
  {
    id: 'alias-reserved',
    definition: withField('alias', 'vars'),
    expected: { code: ErrorCodes.reservedName, pathTail: ['alias'] },
  },
  {
    id: 'parameter-name-illegal',
    definition: withParams({ 'a.b': {} }),
    expected: { code: ErrorCodes.invalidName, pathTail: ['parameters', 'a.b'] },
  },
  {
    id: 'parameter-name-reserved-node-key',
    definition: withParams({ fallback: {} }),
    expected: { code: ErrorCodes.reservedName, pathTail: ['parameters', 'fallback'] },
  },

  // Per-parameter declarations
  {
    id: 'parameter-type-outside-vocabulary',
    definition: withValueParam({ type: 'text' }),
    expected: {
      code: ErrorCodes.invalidDefinition,
      pathTail: ['parameters', 'value', 'type'],
    },
  },
  {
    id: 'parameter-constraints-malformed',
    definition: withValueParam({ type: 'array', constraints: { length: 'two' } }),
    expected: {
      code: ErrorCodes.invalidDefinition,
      pathTail: ['parameters', 'value', 'constraints'],
    },
  },
  {
    id: 'parameter-default-fails-type',
    definition: withValueParam({ type: 'number', default: 'x' }),
    expected: {
      code: ErrorCodes.typeCheck,
      pathTail: ['parameters', 'value', 'default'],
    },
  },
  {
    id: 'parameter-required-with-default',
    definition: withValueParam({ type: 'number', required: true, default: 1 }),
    expected: {
      code: ErrorCodes.invalidDefinition,
      pathTail: ['parameters', 'value', 'default'],
    },
  },
  {
    id: 'parameter-evaluation-outside-vocabulary',
    definition: withValueParam({ evaluation: 'lazyish' }),
    expected: {
      code: ErrorCodes.invalidDefinition,
      pathTail: ['parameters', 'value', 'evaluation'],
    },
  },
  {
    id: 'null-policy-on-null-free-type',
    definition: withValueParam({ type: 'number', nullPolicy: 'value' }),
    expected: {
      code: ErrorCodes.invalidNullPolicy,
      pathTail: ['parameters', 'value', 'nullPolicy'],
    },
  },
  {
    id: 'element-null-policy-on-non-container',
    definition: withValueParam({ type: 'number', elementNullPolicy: 'value' }),
    expected: {
      code: ErrorCodes.invalidNullPolicy,
      pathTail: ['parameters', 'value', 'elementNullPolicy'],
    },
  },
  {
    id: 'element-null-policy-conditional-form',
    definition: withValueParam({ type: 'array', elementNullPolicy: () => 'value' }),
    expected: {
      code: ErrorCodes.invalidNullPolicy,
      pathTail: ['parameters', 'value', 'elementNullPolicy'],
    },
  },
  {
    id: 'truthiness-conflicts-with-propagate',
    definition: withValueParam({ type: 'any', truthiness: true, nullPolicy: 'propagate' }),
    expected: {
      code: ErrorCodes.invalidNullPolicy,
      pathTail: ['parameters', 'value', 'nullPolicy'],
    },
  },
  {
    id: 'sentinel-outside-default-position',
    definition: withField('returns', EvaluationData),
    expected: { code: ErrorCodes.invalidDefinition, pathTail: ['returns'] },
  },

  // Cross-parameter rules
  {
    id: 'positional-names-unknown-parameter',
    definition: withField('positionalParams', ['value', 'nope']),
    expected: { code: ErrorCodes.invalidDefinition, pathTail: ['positionalParams', 1] },
  },
  {
    id: 'positional-rest-entry-not-last',
    definition: (() => {
      const definition = base()
      definition.parameters = { a: {}, b: {} }
      definition.positionalParams = ['...a', 'b']
      return definition
    })(),
    expected: { code: ErrorCodes.invalidDefinition, pathTail: ['positionalParams', 0] },
  },
  {
    id: 'positional-duplicate-entry',
    definition: withField('positionalParams', ['value', 'value']),
    expected: { code: ErrorCodes.invalidDefinition, pathTail: ['positionalParams', 1] },
  },
  {
    id: 'over-without-per-element',
    definition: withParams({
      items: { type: 'array' },
      fn: { over: 'items' },
    }),
    expected: {
      code: ErrorCodes.invalidDefinition,
      pathTail: ['parameters', 'fn', 'over'],
    },
  },
  {
    id: 'per-element-without-over',
    definition: withValueParam({ evaluation: 'perElement' }),
    expected: {
      code: ErrorCodes.invalidDefinition,
      pathTail: ['parameters', 'value', 'evaluation'],
    },
  },
  {
    id: 'over-names-unknown-sibling',
    definition: withValueParam({ evaluation: 'perElement', over: 'nope' }),
    expected: {
      code: ErrorCodes.invalidDefinition,
      pathTail: ['parameters', 'value', 'over'],
    },
  },
  {
    id: 'over-target-type-excludes-array',
    definition: withParams({
      items: { type: 'string' },
      each: { evaluation: 'perElement', over: 'items' },
    }),
    expected: {
      code: ErrorCodes.invalidDefinition,
      pathTail: ['parameters', 'each', 'over'],
    },
  },
  {
    id: 'replaces-null-at-holder-not-lazy',
    definition: withParams({
      value: { type: ['number', 'null'] },
      holder: { required: false, replacesNullAt: ['value'] },
    }),
    expected: {
      code: ErrorCodes.invalidDefinition,
      pathTail: ['parameters', 'holder', 'replacesNullAt'],
    },
  },
  {
    id: 'replaces-null-at-holder-required',
    definition: withParams({
      value: { type: ['number', 'null'] },
      holder: { evaluation: 'lazy', replacesNullAt: ['value'] },
    }),
    expected: {
      code: ErrorCodes.invalidDefinition,
      pathTail: ['parameters', 'holder', 'replacesNullAt'],
    },
  },
  {
    id: 'replaces-null-at-holder-with-default',
    definition: withParams({
      value: { type: ['number', 'null'] },
      holder: { evaluation: 'lazy', default: 0, replacesNullAt: ['value'] },
    }),
    expected: {
      code: ErrorCodes.invalidDefinition,
      pathTail: ['parameters', 'holder', 'replacesNullAt'],
    },
  },
  {
    id: 'replaces-null-at-unknown-target',
    definition: withParams({
      value: { type: ['number', 'null'] },
      holder: { evaluation: 'lazy', required: false, replacesNullAt: ['nope'] },
    }),
    expected: {
      code: ErrorCodes.invalidDefinition,
      pathTail: ['parameters', 'holder', 'replacesNullAt', 0],
    },
  },
  {
    id: 'replaces-null-at-self-target',
    definition: withParams({
      value: { type: ['number', 'null'] },
      holder: { evaluation: 'lazy', required: false, replacesNullAt: ['holder'] },
    }),
    expected: {
      code: ErrorCodes.invalidDefinition,
      pathTail: ['parameters', 'holder', 'replacesNullAt', 0],
    },
  },
  {
    id: 'conditional-null-policy-without-selector',
    definition: withParams({
      value: { type: 'any', nullPolicy: () => 'value' },
      to: { type: 'string' },
    }),
    expected: {
      code: ErrorCodes.invalidNullPolicy,
      pathTail: ['parameters', 'value', 'nullPolicy'],
    },
  },
  {
    id: 'conditional-null-policy-two-selectors',
    definition: withParams({
      value: { type: 'any', nullPolicy: () => 'value' },
      to: { type: { literal: ['number', 'string'] } },
      mode: { type: { literal: ['strict', 'loose'] } },
    }),
    expected: {
      code: ErrorCodes.invalidNullPolicy,
      pathTail: ['parameters', 'value', 'nullPolicy'],
    },
  },
  {
    id: 'conditional-null-policy-non-policy-return',
    definition: withParams({
      value: {
        type: 'any',
        nullPolicy: (to: unknown) => (to === 'boolean' ? 'value' : 'reject'),
      },
      to: { type: { literal: ['number', 'boolean'] } },
    }),
    expected: {
      code: ErrorCodes.invalidNullPolicy,
      pathTail: ['parameters', 'value', 'nullPolicy'],
    },
  },
  {
    id: 'conditional-null-policy-throws-during-compile',
    definition: withParams({
      value: {
        type: 'any',
        nullPolicy: () => {
          throw new Error('boom')
        },
      },
      to: { type: { literal: ['number', 'boolean'] } },
    }),
    expected: {
      code: ErrorCodes.invalidNullPolicy,
      pathTail: ['parameters', 'value', 'nullPolicy'],
    },
  },
  {
    id: 'timeout-param-names-unknown-parameter',
    definition: withField('timeoutParam', 'nope'),
    expected: { code: ErrorCodes.invalidDefinition, pathTail: ['timeoutParam'] },
  },
  {
    id: 'timeout-param-target-not-integer',
    definition: (() => {
      const definition = base()
      definition.parameters = { url: { type: 'string' } }
      definition.timeoutParam = 'url'
      return definition
    })(),
    expected: { code: ErrorCodes.invalidDefinition, pathTail: ['timeoutParam'] },
  },
  {
    id: 'returns-outside-vocabulary',
    definition: withField('returns', 'text'),
    expected: { code: ErrorCodes.invalidDefinition, pathTail: ['returns'] },
  },
]
