/**
 * Phase 2.1 — `defineOperator()` ("The definition shape" through
 * "Registration & validation" in docs-dev/v3-specs/v3-operator-contract.md).
 *
 * Happy paths assert the validated artifact: brand, idempotence, input
 * untouched, deep freeze, normalization (every documented default filled),
 * the compiled conditional-null-policy table, derived `restParam` /
 * `timeoutParam`, and sentinel identity. Error paths run the
 * fixture-per-registration-error table from test/fixtures.
 */
import {
  defineOperator,
  isValidatedOperator,
  isFigTreeError,
  EvaluationData,
  ErrorCodes,
  FigTreeError,
  type ValidatedOperatorDefinition,
} from '../src'
import {
  validDefinition,
  clampLike,
  ifLike,
  convertLike,
  convertLikeCompiledPolicy,
  nullReplacerLike,
  httpLike,
  getFromLike,
  invalidDefinitions,
  type InvalidDefinitionFixture,
} from './fixtures/operatorDefinitions'

const defineInvalid = (definition: unknown): FigTreeError => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    defineOperator(definition as any)
  } catch (error) {
    if (isFigTreeError(error)) return error
    throw error
  }
  throw new Error('expected defineOperator to throw')
}

/** True when some issue matches the fixture's expected code and path tail. */
const hasIssue = (
  error: FigTreeError,
  expected: InvalidDefinitionFixture['expected']
): boolean =>
  (error.issues ?? []).some((issue) => {
    if (issue.code !== expected.code) return false
    if (!expected.pathTail) return true
    const tail = issue.path.slice(-expected.pathTail.length)
    return (
      tail.length === expected.pathTail.length &&
      tail.every((seg, i) => seg === expected.pathTail?.[i])
    )
  })

describe('defineOperator — the validated artifact', () => {
  it('brands the result and the guard recognizes it', () => {
    const validated = defineOperator(validDefinition())
    expect(isValidatedOperator(validated)).toBe(true)
    expect(isValidatedOperator(validDefinition())).toBe(false)
    expect(isValidatedOperator(null)).toBe(false)
    expect(isValidatedOperator('plus')).toBe(false)
  })

  it('is idempotent — re-passing a validated definition returns it unchanged', () => {
    const validated = defineOperator(validDefinition())
    expect(defineOperator(validated)).toBe(validated)
  })

  it('never mutates or brands the input literal', () => {
    const input = validDefinition()
    const snapshot = JSON.parse(JSON.stringify(input))
    defineOperator(input)
    expect(JSON.parse(JSON.stringify(input))).toEqual(snapshot)
    expect(isValidatedOperator(input)).toBe(false)
    expect(Object.isFrozen(input)).toBe(false)
  })

  it('freezes the validated definition, its declarations and its arrays', () => {
    const validated = defineOperator(clampLike())
    expect(Object.isFrozen(validated)).toBe(true)
    expect(Object.isFrozen(validated.parameters)).toBe(true)
    expect(Object.isFrozen(validated.parameters.value)).toBe(true)
    expect(Object.isFrozen(validated.positionalParams)).toBe(true)
    expect(Object.isFrozen(validated.readsOptions)).toBe(true)
  })

  it('fills every documented default (normalization, not verbatim storage)', () => {
    const validated = defineOperator({
      name: 'bare',
      description: 'An operator with one empty declaration',
      parameters: { value: {} },
      evaluate: ({ value }) => value,
    })
    expect(validated.useCache).toBe(false)
    expect(validated.cache).toBe('auto')
    expect(validated.readsOptions).toEqual([])
    expect(validated.returns).toBe('any')
    expect(validated.timeoutParam).toBeNull()
    expect(validated.restParam).toBeNull()

    const value = validated.parameters.value
    expect(value.type).toBe('any')
    expect(value.required).toBe(true)
    expect(value.evaluation).toBe('eager')
    expect(value.truthiness).toBe(false)
    expect(value.nullPolicy).toBe('propagate')
  })

  it('computes required from default presence and explicit required', () => {
    const validated = defineOperator(clampLike())
    expect(validated.parameters.value.required).toBe(true)
    expect(validated.parameters.min.required).toBe(false) // has default
    expect(validated.parameters.max.required).toBe(false)
    expect(validated.parameters.min.default).toBe(0)
  })

  it('preserves alias, truthiness and lazy modes (the if example)', () => {
    const validated = defineOperator(ifLike())
    expect(validated.alias).toBe('?')
    expect(validated.parameters.condition.truthiness).toBe(true)
    expect(validated.parameters.then.evaluation).toBe('lazy')
    expect(validated.parameters.else.evaluation).toBe('lazy')
    expect(validated.parameters.else.required).toBe(false)
    expect(validated.parameters.else.default).toBeNull()
  })

  it('derives restParam and keeps positionalParams verbatim', () => {
    const validated = defineOperator(nullReplacerLike())
    expect(validated.positionalParams).toEqual(['...values'])
    expect(validated.restParam).toBe('values')
  })

  it('carries the I/O-shaped fields through (timeoutParam, readsOptions, cache)', () => {
    const validated = defineOperator(httpLike())
    expect(validated.timeoutParam).toBe('requestTimeout')
    expect(validated.readsOptions).toEqual(['http'])
    expect(validated.useCache).toBe(true)
    expect(validated.cache).toBe('manual')
  })

  it('accepts reference-namespace words as parameter names (the deliberate boundary)', () => {
    const definition = validDefinition()
    definition.parameters = { data: { type: 'object' }, element: {} }
    expect(() => defineOperator(definition)).not.toThrow()
  })
})

describe('defineOperator — conditional null-policy compilation', () => {
  it('compiles the function to the policy table, in union-member order', () => {
    const validated = defineOperator(convertLike())
    expect(validated.parameters.value.nullPolicy).toEqual(convertLikeCompiledPolicy)
  })

  it('the validated object carries no policy function anywhere', () => {
    const validated = defineOperator(convertLike())
    const findFunction = (value: unknown): boolean => {
      if (typeof value === 'function') return true
      if (value === null || typeof value !== 'object') return false
      return Object.entries(value as Record<string, unknown>).some(
        // The two hooks are the only legal functions on a definition
        ([key, child]) => key !== 'evaluate' && key !== 'validate' && findFunction(child)
      )
    }
    expect(findFunction(validated)).toBe(false)
  })
})

describe('defineOperator — the EvaluationData sentinel', () => {
  it('is preserved by identity in default position and skips the type-fit check', () => {
    // getFromLike declares from: ['object', 'array'] — the sentinel satisfies
    // neither, so acceptance proves the skip
    const validated = defineOperator(getFromLike())
    expect(validated.parameters.from.default).toBe(EvaluationData)
    expect(validated.parameters.from.required).toBe(false)
  })
})

describe('defineOperator — registration errors', () => {
  it.each(invalidDefinitions)('$id', ({ definition, expected }) => {
    const error = defineInvalid(definition)
    expect(error.code).toBe(ErrorCodes.invalidDefinition)
    expect(error.issues?.length).toBeGreaterThan(0)
    expect(hasIssue(error, expected)).toBe(true)
  })

  it('collects every violation into one throw', () => {
    const definition = validDefinition()
    definition.alias = '$?' // illegal alias
    definition.positionalParams = ['value', 'nope'] // unknown positional
    const error = defineInvalid(definition)
    expect(error.issues?.length).toBeGreaterThanOrEqual(2)
    expect(hasIssue(error, { code: ErrorCodes.invalidName, pathTail: ['alias'] })).toBe(true)
    expect(
      hasIssue(error, { code: ErrorCodes.invalidDefinition, pathTail: ['positionalParams', 1] })
    ).toBe(true)
    expect(error.message).toMatch(/\+ 1 more issue/)
  })

  it('names the operator and the first issue in the throw', () => {
    const definition = validDefinition()
    definition.timeoutParam = 'nope'
    const error = defineInvalid(definition)
    expect(error.operator).toBe('testOp')
    expect(error.path).toEqual(error.issues?.[0]?.path)
    expect(error.issues?.every((issue) => issue.severity === 'error')).toBe(true)
  })

  it('a validated definition cannot be forged structurally', () => {
    const forged = {
      ...JSON.parse(JSON.stringify(defineOperator(validDefinition()))),
      evaluate: () => null,
    } as unknown as ValidatedOperatorDefinition
    expect(isValidatedOperator(forged)).toBe(false)
  })
})
