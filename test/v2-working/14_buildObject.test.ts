/**
 * MIGRATION STATUS (Phase 7.1, 2026-09-19): hand-migrated to
 * test/operators-data.test.ts. Divergences: the aliases build / object
 * die, and `properties` / `values` / `keyValPairs` / `keyValuePairs`
 * collapse to `entries`; **the alternating flat form dies** (`['a', 1,
 * 'b', 2]`), with it v2's runtime shape-sniffing and its odd-length
 * throw; **malformed entries are a type error** where v2 silently
 * filtered them out, so the "handling erroneous input" case inverts; the
 * two exact-message type-error assertions have no successor (v3 asserts
 * codes, never wording). Unchanged: string / number / boolean keys, a
 * null key rejecting, and null-valued entries keeping their key. New in
 * v3: the duplicate-key warning and the runtime overwrite note — v2 had
 * last-wins too, but no test covered it.
 */
import { FigTreeEvaluator, evaluateExpression } from './evaluator'

const exp = new FigTreeEvaluator({
  objects: { key: 'keyFromObjects', value: 'valueFromObjects' },
})

test('buildObject - basic', () => {
  const expression = {
    operator: 'buildObject',
    properties: [{ key: 'someKey', value: 'someValue' }],
  }
  return evaluateExpression(expression).then((result) => {
    expect(result).toStrictEqual({ someKey: 'someValue' })
  })
})

test('buildObject - basic, with children', () => {
  const expression = {
    operator: 'buildObject',
    children: ['someKey', 'someValue'],
  }
  return evaluateExpression(expression).then((result) => {
    expect(result).toStrictEqual({ someKey: 'someValue' })
  })
})

test('buildObject - basic, shorthand', () => {
  const expression = { $buildObject: ['someKey', 'someValue'] }
  return evaluateExpression(expression).then((result) => {
    expect(result).toStrictEqual({ someKey: 'someValue' })
  })
})

test('buildObject - handling erroneous input', () => {
  const expression = {
    operator: 'buildObject',
    values: [
      { value: 'missing key' },
      { key: 'someKey', value: 'someValue' },
      {},
      { key: 'missing value' },
    ],
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toStrictEqual({ someKey: 'someValue' })
  })
})

test('buildObject - with evaluated key and value', () => {
  const expression = {
    operator: 'buildObject',
    keyValPairs: [
      { key: 'someKey', value: 'someValue' },
      {
        key: {
          operator: 'objectProperties',
          children: ['key'],
        },
        value: {
          operator: 'objectProperties',
          children: ['value'],
        },
      },
    ],
  }

  return exp.evaluate(expression).then((result) => {
    expect(result).toStrictEqual({ someKey: 'someValue', keyFromObjects: 'valueFromObjects' })
  })
})

test('buildObject - with evaluations and nesting', () => {
  const expression = {
    operator: 'buildObject',
    keyValuePairs: [
      { key: 'someKey', value: 'someValue' },
      {
        key: { operator: 'objectProperties', children: ['key'] },
        value: {
          operator: 'buildObject',
          properties: [
            {
              key: 'concatArray',
              value: { operator: '+', values: [['one'], [2]] },
            },
          ],
        },
      },
    ],
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toStrictEqual({
      someKey: 'someValue',
      keyFromObjects: { concatArray: ['one', 2] },
    })
  })
})

test('buildObject - missing properties', () => {
  const expression = { operator: 'buildObject' }
  return exp.evaluate(expression, { returnErrorAsString: true }).then((result) => {
    expect(result).toBe(
      'Operator: BUILD_OBJECT - Type Error\n- Missing required property "properties" (type: array)'
    )
  })
})

test('buildObject - invalid key type', () => {
  const expression = {
    operator: 'buildObject',
    properties: [{ key: [1, 2], value: 3 }, { missingKey: 2 }],
  }
  return exp.evaluate(expression, { returnErrorAsString: true }).then((result) => {
    expect(result).toBe(
      'Operator: BUILD_OBJECT - Type Error\n- Property "key" (value: [1,2]) is not of type: string|number|boolean'
    )
  })
})
