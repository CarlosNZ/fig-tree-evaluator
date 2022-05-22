import evaluateExpression from '../evaluateExpression'

test('Testing basic buildObject', () => {
  const testIn = {
    operator: 'buildObject',
    properties: [
      {
        key: 'someKey',
        value: 'someValue',
      },
    ],
  }
  const testOut = {
    someKey: 'someValue',
  }
  return evaluateExpression(testIn).then((result: any) => {
    expect(result).toEqual(testOut)
  })
})

test('Testing buildObject for handling erroneous input', () => {
  const testIn = {
    operator: 'buildObject',
    properties: [
      {
        value: 'missing key',
      },
      {
        key: 'someKey',
        value: 'someValue',
      },
      {},
      {
        key: 'missing value',
      },
    ],
  }
  const testOut = {
    someKey: 'someValue',
  }
  return evaluateExpression(testIn).then((result: any) => {
    expect(result).toEqual(testOut)
  })
})

test('Testing buildObject with evaluated key and value', () => {
  const testIn = {
    operator: 'buildObject',
    properties: [
      {
        key: 'someKey',
        value: 'someValue',
      },
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

  const testOut = {
    someKey: 'someValue',
    keyFromObjects: 'valueFromObjects',
  }

  const params = {
    objects: { key: 'keyFromObjects', value: 'valueFromObjects' },
  }

  return evaluateExpression(testIn, params).then((result: any) => {
    expect(result).toEqual(testOut)
  })
})

test('Testing buildObject with evaluations and nesting', () => {
  const testIn = {
    operator: 'buildObject',
    properties: [
      {
        key: 'someKey',
        value: 'someValue',
      },
      {
        key: {
          operator: 'objectProperties',
          children: ['key'],
        },
        value: {
          operator: 'buildObject',
          properties: [
            {
              key: 'concatArray',
              value: {
                operator: '+',
                children: [['one'], [2]],
              },
            },
          ],
        },
      },
    ],
  }

  const testOut = {
    someKey: 'someValue',
    keyFromObjects: { concatArray: ['one', 2] },
  }

  const params = {
    objects: { key: 'keyFromObjects', value: 'valueFromObjects' },
  }

  return evaluateExpression(testIn, params).then((result: any) => {
    // console.log(result)
    expect(result).toEqual(testOut)
  })
})
