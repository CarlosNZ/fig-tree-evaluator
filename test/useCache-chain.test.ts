/**
 * Chunk 8.1 — the effective `useCache` chain ("Caching" in
 * docs-dev/v3-specs/v3-operator-contract.md; the `useCache` precedence
 * line in the Options area of docs-dev/v3-specs/v3-api.md).
 *
 * Node key → operatorDefaults modifier → blanket option → metadata
 * default. The result cache that consumes this lands in Phase 9.1, so the
 * chain is exercised directly against parsed nodes: there is nothing yet
 * whose behaviour would differ.
 */
import { defineOperator, ErrorCodes } from '../src'
import { effectiveUseCache } from '../src/evaluate'
import { buildRegistry } from '../src/registry'
import { parseExpression, type OperatorNode } from '../src/parse'

const cachingOp = defineOperator({
  name: 'fetchish',
  category: 'other',
  description: 'An I/O-shaped operator whose metadata default is on',
  parameters: {},
  useCache: true,
  cache: 'manual',
  evaluate: () => 'ok',
})

const pureOp = defineOperator({
  name: 'pureish',
  category: 'other',
  description: 'A pure operator, metadata default off',
  parameters: {},
  evaluate: () => 'ok',
})

/** Parse one expression and hand back its single operator node. */
const nodeOf = (
  expression: unknown,
  operatorDefaults?: Record<string, Record<string, unknown>>
): OperatorNode => {
  const registry = buildRegistry({
    operators: [cachingOp, pureOp],
    ...(operatorDefaults !== undefined ? { operatorDefaults } : {}),
  })
  const artifact = parseExpression(expression, registry)
  return artifact.root as OperatorNode
}

describe('each step of the chain', () => {
  it('falls all the way through to the metadata default', () => {
    expect(effectiveUseCache(nodeOf({ $fetchish: {} }), {})).toBe(true)
    expect(effectiveUseCache(nodeOf({ $pureish: {} }), {})).toBe(false)
  })

  it('the blanket option beats the metadata default', () => {
    expect(effectiveUseCache(nodeOf({ $pureish: {} }), { useCache: true })).toBe(true)
    expect(effectiveUseCache(nodeOf({ $fetchish: {} }), { useCache: false })).toBe(false)
  })

  it('operatorDefaults beats the blanket option', () => {
    const node = nodeOf({ $pureish: {} }, { pureish: { useCache: true } })
    expect(effectiveUseCache(node, { useCache: false })).toBe(true)
  })

  it('the node key beats everything', () => {
    const node = nodeOf({ operator: 'pureish', useCache: true }, { pureish: { useCache: false } })
    expect(effectiveUseCache(node, { useCache: false })).toBe(true)

    const off = nodeOf({ operator: 'fetchish', useCache: false })
    expect(effectiveUseCache(off, { useCache: true })).toBe(false)
  })

  it('distinguishes an authored false from an absent key', () => {
    const absent = nodeOf({ $fetchish: {} })
    const authored = nodeOf({ operator: 'fetchish', useCache: false })
    expect(effectiveUseCache(absent, {})).toBe(true)
    expect(effectiveUseCache(authored, {})).toBe(false)
  })
})

describe('what the chain can rely on', () => {
  it('the parser admits only a literal boolean, so the chain never sees anything else', () => {
    const registry = buildRegistry({ operators: [pureOp] })
    const artifact = parseExpression({ operator: 'pureish', useCache: { $pureish: {} } }, registry)
    expect(artifact.issues.map((sequenced) => sequenced.issue.code)).toContain(
      ErrorCodes.malformedNode
    )
  })

  it('registration refuses a non-boolean modifier default', () => {
    expect(() =>
      buildRegistry({ operators: [pureOp], operatorDefaults: { pureish: { useCache: 'yes' } } })
    ).toThrow()
  })
})
