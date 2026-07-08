/**
 * Phase 2.2 — registry assembly ("Operator registration" and
 * "operatorDefaults" in the Options area of docs-dev/v3-specs/v3-api.md).
 * White-box: the registry is internal machinery behind `new FigTree()`, not
 * barrel surface.
 */
import { buildRegistry, resolveOperator } from '../src/registry'
import { defineOperator, isFigTreeError, ErrorCodes, FigTreeError } from '../src'
import { validDefinition } from './fixtures/operatorDefinitions'
import {
  makeOp,
  equalLike,
  collisionFixtures,
  operatorDefaultsFixtures,
} from './fixtures/registryOptions'

const buildInvalid = (input: Parameters<typeof buildRegistry>[0]): FigTreeError => {
  try {
    buildRegistry(input)
  } catch (error) {
    if (isFigTreeError(error)) return error
    throw error
  }
  throw new Error('expected buildRegistry to throw')
}

const hasIssue = (
  error: FigTreeError,
  expected: { code: string; pathTail?: (string | number)[] }
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

describe('buildRegistry — flattening and order', () => {
  it('flattens one level and preserves registration order', () => {
    const pack = [makeOp('alpha'), makeOp('beta')]
    const single = makeOp('gamma')
    const registry = buildRegistry({ operators: [pack, single] })
    expect([...registry.operators.keys()]).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('rejects an array nested deeper than one level', () => {
    const error = buildInvalid({
      operators: [[[makeOp('alpha')] as never]],
    })
    expect(error.code).toBe(ErrorCodes.invalidOptions)
    expect(hasIssue(error, { code: ErrorCodes.invalidOptions, pathTail: ['operators', 0, 0] })).toBe(
      true
    )
  })

  it('builds the alias map from names and aliases', () => {
    const registry = buildRegistry({ operators: [makeOp('alpha', '@'), makeOp('beta')] })
    expect(registry.aliases.get('@')).toBe('alpha')
    expect(registry.aliases.size).toBe(1)
  })
})

describe('resolveOperator — canonical-first, then alias', () => {
  const registry = buildRegistry({ operators: [makeOp('alpha', '@'), makeOp('beta')] })

  it('resolves canonical names and aliases to the same entry', () => {
    const byName = resolveOperator(registry, 'alpha')
    const byAlias = resolveOperator(registry, '@')
    expect(byName).toBeDefined()
    expect(byAlias).toBe(byName)
  })

  it('is case-sensitive and exact-match — no folding', () => {
    expect(resolveOperator(registry, 'Alpha')).toBeUndefined()
    expect(resolveOperator(registry, 'ALPHA')).toBeUndefined()
    expect(resolveOperator(registry, 'nope')).toBeUndefined()
  })
})

describe('buildRegistry — the brand is the entry ticket', () => {
  it('rejects a plain (unbranded) definition, naming the remedy', () => {
    const error = buildInvalid({
      operators: [makeOp('alpha'), validDefinition() as never],
    })
    expect(hasIssue(error, { code: ErrorCodes.invalidOptions, pathTail: ['operators', 1] })).toBe(
      true
    )
    expect(error.message).toMatch(/defineOperator/)
  })

  it('rejects an uncalled factory with a dedicated message', () => {
    const factory = () => [makeOp('http')]
    const error = buildInvalid({ operators: [factory as never] })
    expect(hasIssue(error, { code: ErrorCodes.invalidOptions, pathTail: ['operators', 0] })).toBe(
      true
    )
    expect(error.message).toMatch(/factories must be called/)
  })

  it('never re-validates a branded definition (the brand is trusted)', () => {
    // A branded definition registers even where re-running validation would
    // be observable — buildRegistry adds no second validation path
    const registry = buildRegistry({ operators: [defineOperator(validDefinition())] })
    expect(registry.operators.has('testOp')).toBe(true)
  })
})

describe('buildRegistry — one namespace, no silent precedence', () => {
  it.each(collisionFixtures)('$id', ({ operators, pathTail }) => {
    const error = buildInvalid({ operators })
    expect(error.code).toBe(ErrorCodes.invalidOptions)
    expect(hasIssue(error, { code: ErrorCodes.duplicateOperator, pathTail })).toBe(true)
  })
})

describe('buildRegistry — operatorDefaults validation', () => {
  it.each(operatorDefaultsFixtures)('$id', ({ operatorDefaults, expected }) => {
    const input = {
      operators: [equalLike()],
      operatorDefaults: operatorDefaults as Record<string, Record<string, unknown>>,
    }
    if (expected === null) {
      expect(() => buildRegistry(input)).not.toThrow()
    } else {
      const error = buildInvalid(input)
      expect(error.code).toBe(ErrorCodes.invalidOptions)
      expect(hasIssue(error, expected)).toBe(true)
    }
  })

  it('stores validated defaults on the entry, frozen', () => {
    const registry = buildRegistry({
      operators: [equalLike()],
      operatorDefaults: { equal: { caseInsensitive: true, fallback: 0 } },
    })
    const entry = resolveOperator(registry, 'equal')
    expect(entry?.instanceDefaults).toEqual({ caseInsensitive: true, fallback: 0 })
    expect(Object.isFrozen(entry?.instanceDefaults)).toBe(true)
  })

  it('leaves entries without defaults bare', () => {
    const registry = buildRegistry({ operators: [equalLike()] })
    expect(resolveOperator(registry, 'equal')?.instanceDefaults).toBeUndefined()
  })
})
