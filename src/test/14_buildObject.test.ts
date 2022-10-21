import FigTreeEvaluator, { evaluateExpression } from '../FigTreeEvaluator'

const exp = new FigTreeEvaluator({
  objects: { key: 'keyFromObjects', value: 'valueFromObjects' },
})

test('buildObject - basic', () => {
  const expression = {
    operator: 'buildObject',
    properties: [{ key: 'someKey', value: 'someValue' }],
  }
  return evaluateExpression(expression).then((result: any) => {
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
  return exp.evaluate(expression).then((result: any) => {
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

  return exp.evaluate(expression).then((result: any) => {
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
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toStrictEqual({
      someKey: 'someValue',
      keyFromObjects: { concatArray: ['one', 2] },
    })
  })
})
