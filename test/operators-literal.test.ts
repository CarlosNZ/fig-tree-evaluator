/**
 * Chunk 7.2 — `literal`, confirmed end to end (batch 7 in
 * docs-dev/v3-specs/v3-operator-parameters-2.md; node kind 5 in
 * docs-dev/v3-specs/v3-api.md).
 *
 * `literal` is grammar rather than a definition — its name is reserved and
 * it never enters `coreOperators` — and the compile boundary itself landed
 * in Phase 3. What is confirmed here is the half only evaluation can show:
 * that a quoted payload reaches the output as the value it is, by
 * identity, and that nothing downstream can re-capture it.
 *
 * v2 had no quote mechanism, so there is nothing to migrate; `passThru`
 * is deliberately NOT its ancestor (it evaluated its child).
 */
import { FigTree } from '../src'

const fig = new FigTree()
const ev = (expression: unknown, data?: Record<string, unknown>) =>
  fig.evaluate(expression, data !== undefined ? { data } : {})
const codes = (expression: unknown) => fig.validate(expression).issues.map((issue) => issue.code)

describe('literal — the boundary is total inward', () => {
  test('an operator-shaped payload comes out as data, unevaluated', async () => {
    const quoted = { operator: 'plus', values: [1, 2, 3] }
    expect(await ev({ $literal: quoted })).toEqual(quoted)
  })

  test('a shorthand key inside is data too', async () => {
    expect(await ev({ $literal: { $match: { status: 'open' } } })).toEqual({
      $match: { status: 'open' },
    })
  })

  test('reference strings stay inert', async () => {
    expect(await ev({ $literal: '$data.user.name' }, { user: { name: 'Ada' } })).toBe(
      '$data.user.name'
    )
    expect(await ev({ $literal: { a: '$data.x' } }, { x: 1 })).toEqual({ a: '$data.x' })
  })

  test('// keys are data, not comments, and vars keys are data, not scopes', async () => {
    expect(await ev({ $literal: { '//': 'kept', vars: { a: 1 }, b: 2 } })).toEqual({
      '//': 'kept',
      vars: { a: 1 },
      b: 2,
    })
  })

  test('a $-shaped key inside draws no unrecognized warning', () => {
    expect(codes({ $literal: { $typo: 1 } })).toEqual([])
    // …where the same key outside the quote does warn
    expect(codes({ $typo: 1 })).toContain('unrecognized-identifier')
  })

  test('the payload is returned by identity — the compiled constant is the input', async () => {
    const payload = { deep: { nested: [1, 2] } }
    expect(await ev({ $literal: payload })).toBe(payload)
  })

  test('an opaque value survives untouched', async () => {
    const stamp = new Date(0)
    expect(await ev({ $literal: { stamp } })).toEqual({ stamp })
  })

  test('the canonical face, and the payload is never type-disambiguated', async () => {
    expect(await ev({ operator: 'literal', value: [1, 2] })).toEqual([1, 2])
    // No positional reading of an array payload…
    expect(await ev({ $literal: [1, 2] })).toEqual([1, 2])
    // …and no named reading of an object payload: this quotes the object
    expect(await ev({ $literal: { value: 1 } })).toEqual({ value: 1 })
  })

  test('null and scalars are content like anything else', async () => {
    expect(await ev({ $literal: null })).toBeNull()
    expect(await ev({ $literal: 0 })).toBe(0)
    expect(await ev({ $literal: '' })).toBe('')
  })
})

describe('literal — ordinary outward', () => {
  test('once quoted, quoted forever: nothing re-captures it downstream', async () => {
    const quoted = { operator: 'plus', values: [1, 2, 3] }
    expect(await ev({ $map: [[1], { $literal: quoted }] })).toEqual([quoted])
    expect(await ev({ $match: { value: 'a', branches: { a: { $literal: quoted } } } })).toEqual(
      quoted
    )
    expect(await ev({ $if: [true, { $literal: quoted }, null] })).toEqual(quoted)
  })

  test('enclosing operators treat it as the value it is', async () => {
    expect(await ev({ $buildString: ['%1', { $literal: { a: 1 } }] })).toBe('<object>')
    expect(await ev({ $length: { $literal: [1, 2, 3] } })).toBe(3)
  })

  test('a typed position type-errors on it, like any other object', () => {
    expect(codes({ $lower: { $literal: { a: 1 } } })).toContain('type-check')
  })

  test('it is the sanctioned escape for output containing reserved words', async () => {
    expect(
      await ev({ config: { $literal: { operator: 'not-an-operator', fallback: 'data' } } })
    ).toEqual({ config: { operator: 'not-an-operator', fallback: 'data' } })
  })
})

describe('literal — every modifier on it is dead, and validate says so', () => {
  test.each(['fallback', 'vars', 'useCache'])('%s draws the dead-modifier warning', (modifier) => {
    const expression = { $literal: 1, [modifier]: modifier === 'vars' ? { a: 1 } : true }
    expect(codes(expression)).toContain('useless-modifier')
  })

  test('the node still evaluates — the modifiers are legal, just dead', async () => {
    expect(await ev({ $literal: 1, fallback: 'never' })).toBe(1)
  })

  test('content must go in `value` on the canonical face', () => {
    expect(codes({ operator: 'literal' })).toContain('malformed-node')
    expect(codes({ operator: 'literal', content: 1 })).toContain('unknown-node-key')
  })
})
