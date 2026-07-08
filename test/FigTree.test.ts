/**
 * Phase 2.2 — the `FigTree` shell: constructs, registers, throws on bad
 * input ("new FigTree(options?) … registration-time validation throws here"
 * in docs-dev/v3-specs/v3-evaluator-methods.md). No evaluation until
 * Phase 4.
 */
import { FigTree, isFigTreeError, ErrorCodes, FigTreeError } from '../src'
import { validDefinition } from './fixtures/operatorDefinitions'
import { makeOp, equalLike } from './fixtures/registryOptions'

const constructInvalid = (options: ConstructorParameters<typeof FigTree>[0]): FigTreeError => {
  try {
    new FigTree(options)
  } catch (error) {
    if (isFigTreeError(error)) return error
    throw error
  }
  throw new Error('expected construction to throw')
}

describe('new FigTree — the Phase-2 shell', () => {
  it('constructs with no options (default registry: empty until coreOperators, Phase 4)', () => {
    expect(() => new FigTree()).not.toThrow()
  })

  it('constructs with a stated registry and non-registry options', () => {
    expect(
      () =>
        new FigTree({
          operators: [[makeOp('alpha'), makeOp('beta')], equalLike()],
          operatorDefaults: { equal: { caseInsensitive: true } },
          timeout: 1000,
          mode: 'report',
        })
    ).not.toThrow()
  })

  it('throws on an unbranded definition in operators', () => {
    const error = constructInvalid({ operators: [validDefinition() as never] })
    expect(error.code).toBe(ErrorCodes.invalidOptions)
    expect(error.issues?.length).toBeGreaterThan(0)
    expect(error.message).toMatch(/defineOperator/)
  })

  it('throws on a namespace collision', () => {
    const error = constructInvalid({ operators: [makeOp('alpha'), makeOp('alpha')] })
    expect(error.issues?.some((issue) => issue.code === ErrorCodes.duplicateOperator)).toBe(true)
  })

  it('throws on bad operatorDefaults', () => {
    const error = constructInvalid({
      operators: [equalLike()],
      operatorDefaults: { equal: { values: [1] } }, // required target — the Q12 ban
    })
    expect(error.issues?.some((issue) => issue.code === ErrorCodes.invalidOptions)).toBe(true)
  })

  it('registration errors prettyPrint legibly', () => {
    const error = constructInvalid({ operators: [makeOp('alpha'), makeOp('alpha')] })
    const printed = error.prettyPrint()
    expect(printed).toContain(ErrorCodes.invalidOptions)
    expect(printed).toContain('alpha')
  })
})
