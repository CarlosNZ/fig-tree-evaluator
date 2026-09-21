/**
 * Chunk 6.1 — `$element` / `$index` and `as` at runtime ("`$element` /
 * `$index` and `as`" in docs-dev/v3-specs/v3-api.md; "The iterators — one
 * contract, five operators" in
 * docs-dev/v3-specs/v3-operator-parameters-2.md).
 *
 * The static half of this is already covered black-box in
 * test/validate-checks.test.ts. What is asserted here is that the runtime
 * resolves the same way the static checker said it would — in particular
 * the innermost-wins rule and the rule that a renamed frame does NOT
 * answer to the default names.
 */
import { coreOperators, defineOperator, FigTree } from '../src'
import type { PerElement, ValidatedOperatorDefinition } from '../src'

/** A minimal real iterator: demands every index, in order. */
const mapish = defineOperator({
  name: 'mapish',
  category: 'other',
  description: 'Transform each element',
  parameters: {
    input: { type: 'array' },
    each: { type: 'any', evaluation: 'perElement', over: 'input' },
    as: { type: 'string', required: false, evaluation: 'structural' },
  },
  positionalParams: ['input', 'each'],
  returns: 'array',
  evaluate: ({ input, each }) =>
    Promise.all((input as unknown[]).map((_, i) => (each as PerElement).evaluate(i))),
})

const operators: ValidatedOperatorDefinition[] = [coreOperators, mapish].flat()
const fig = new FigTree({ operators })
const ev = (expression: unknown, data?: Record<string, unknown>) =>
  fig.evaluate(expression, data !== undefined ? { data } : {})

// ── the default pair ────────────────────────────────────────────────

test('$element is the current element and $index its position', async () => {
  expect(await ev({ $mapish: [['a', 'b'], '$element'] })).toEqual(['a', 'b'])
  expect(await ev({ $mapish: [['a', 'b'], '$index'] })).toEqual([0, 1])
})

test('$element drills like any other reference', async () => {
  const data = { users: [{ name: 'Ada' }, { name: 'Alan' }] }
  expect(await ev({ $mapish: ['$data.users', '$element.name'] }, data)).toEqual(['Ada', 'Alan'])
})

test('a drill miss is null — absence is not failure', async () => {
  const data = { users: [{ name: 'Ada' }, {}] }
  expect(await ev({ $mapish: ['$data.users', '$element.name'] }, data)).toEqual(['Ada', null])
})

test('strictDataPaths governs the $element drill too', async () => {
  const data = { users: [{}] }
  await expect(
    fig.evaluate({ $mapish: ['$data.users', '$element.name'] }, { data, strictDataPaths: true })
  ).rejects.toMatchObject({ code: 'missing-data-path' })
})

test('the short aliases resolve identically', async () => {
  expect(await ev({ $mapish: [['a', 'b'], '$e'] })).toEqual(['a', 'b'])
  expect(await ev({ $mapish: [['a', 'b'], '$i'] })).toEqual([0, 1])
})

test('a bare $element is the whole element, object or not', async () => {
  const data = { rows: [{ a: 1 }, 2] }
  expect(await ev({ $mapish: ['$data.rows', '$element'] }, data)).toEqual([{ a: 1 }, 2])
})

// ── nesting and `as` ────────────────────────────────────────────────

test('the innermost iterator wins', async () => {
  expect(
    await ev({ $mapish: [[['a', 'b'], ['c']], { $mapish: ['$element', '$element'] }] })
  ).toEqual([['a', 'b'], ['c']])
})

test('as renames the pair, and the outer binding is reachable by name', async () => {
  const data = {
    orders: [
      { id: 'A', items: ['x', 'y'] },
      { id: 'B', items: ['z'] },
    ],
  }
  const result = await ev(
    {
      operator: 'mapish',
      input: '$data.orders',
      as: 'order',
      each: {
        operator: 'mapish',
        input: '$order.items',
        each: { $mapish: [['-'], { $equal: ['$element', '$element'] }] },
      },
    },
    data
  )
  expect(result).toEqual([[[true], [true]], [[true]]])
})

test('the renamed index binding resolves under its derived name', async () => {
  const result = await ev({
    operator: 'mapish',
    input: ['a', 'b'],
    as: 'row',
    each: { $mapish: [['-'], '$rowIndex'] },
  })
  expect(result).toEqual([[0], [1]])
})

test('an inner iterator reads the outer element by name while binding its own', async () => {
  const data = { orders: [{ id: 'A', items: ['x', 'y'] }] }
  const result = await ev(
    {
      operator: 'mapish',
      input: '$data.orders',
      as: 'order',
      each: {
        operator: 'mapish',
        input: '$order.items',
        each: { $plus: ['$order.id', ':', '$element'] },
      },
    },
    data
  )
  expect(result).toEqual([['A:x', 'A:y']])
})

test("a nested iterator's own input sees the outer bindings", async () => {
  const data = { rows: [{ xs: [1, 2] }, { xs: [3] }] }
  const result = await ev(
    { $mapish: ['$data.rows', { $mapish: ['$element.xs', '$element'] }] },
    data
  )
  expect(result).toEqual([[1, 2], [3]])
})
