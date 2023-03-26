import FigTreeEvaluator from '../src'
import { preProcessShorthand } from '../src/shorthandSyntax'

const fig = new FigTreeEvaluator({
  graphQLConnection: {
    endpoint: 'https://countries.trevorblades.com/',
  },
  returnErrorAsString: true,
  objects: {
    myCountry: 'Brazil',
    otherCountry: 'France',
    deep: { p: 12 },
    user: { firstName: 'Bruce', lastName: 'Banner' },
  },
  fragments: {
    getFlag: {
      operator: 'GET',
      children: [
        {
          operator: 'stringSubstitution',
          string: 'https://restcountries.com/v3.1/name/%1',
          replacements: ['$country'],
        },
        [],
        'flag',
      ],
      outputType: 'string',
    },
    simpleFragment: 'The flag of Brazil is: ',
    adder: { operator: '+', values: '$values' },
  },
})

// Test pre-processing only

test('Shorthand - simple string expression evaluation', () => {
  const expression = '$getData(path.to.country.name)'
  expect(preProcessShorthand(expression, fig.getOptions().fragments)).toStrictEqual({
    operator: 'OBJECT_PROPERTIES',
    children: ['path.to.country.name'],
  })
})

test('Shorthand - nested string expression', () => {
  const expression = '$plus( $getData ( myCountry), $getData(otherCountry))'
  expect(preProcessShorthand(expression, fig.getOptions().fragments)).toStrictEqual({
    operator: 'PLUS',
    children: [
      {
        operator: 'OBJECT_PROPERTIES',
        children: ['myCountry'],
      },
      {
        operator: 'OBJECT_PROPERTIES',
        children: ['otherCountry'],
      },
    ],
  })
})

test('Shorthand - simple object expression', () => {
  const expression = { $plus: [1, 2, 3] }
  expect(preProcessShorthand(expression, fig.getOptions().fragments)).toStrictEqual({
    operator: 'PLUS',
    children: [1, 2, 3],
  })
})

test('Shorthand - nested object expression', () => {
  const expression = {
    $plus: [{ $getData: 'user.firstName' }, ' ', { $getData: 'user.lastName' }],
  }
  expect(preProcessShorthand(expression, fig.getOptions().fragments)).toStrictEqual({
    operator: 'PLUS',
    children: [
      {
        operator: 'OBJECT_PROPERTIES',
        children: ['user.firstName'],
      },
      ' ',
      {
        operator: 'OBJECT_PROPERTIES',
        children: ['user.lastName'],
      },
    ],
  })
})

test('Shorthand - fragment 1', () => {
  const expression = { $getFlag: { $country: '$getData(myCountry)' } }
  expect(preProcessShorthand(expression, fig.getOptions().fragments)).toStrictEqual({
    fragment: 'getFlag',
    parameters: { $country: { operator: 'OBJECT_PROPERTIES', children: ['myCountry'] } },
  })
})

// Same as above expressions, but checking the actual evaluation result
test('Shorthand - evaluate simple string expression', () => {
  const expression = '$getData(deep.p)'
  return fig.evaluate(expression).then((result: any) => {
    expect(result).toBe(12)
  })
})

test('Shorthand - evaluate nested string expression', () => {
  const expression = '$plus( $getData ( myCountry), $getData(otherCountry))'
  return fig.evaluate(expression).then((result: any) => {
    expect(result).toBe('BrazilFrance')
  })
})

test('Shorthand - evaluate simple object expression', () => {
  const expression = { $plus: [1, 2, 3] }
  return fig.evaluate(expression).then((result: any) => {
    expect(result).toBe(6)
  })
})

test('Shorthand - evaluate nested object expression', () => {
  const expression = {
    $plus: [{ $getData: 'user.firstName' }, ' ', { $getData: 'user.lastName' }],
  }
  return fig.evaluate(expression).then((result: any) => {
    expect(result).toBe('Bruce Banner')
  })
})

test('Shorthand - evaluate fragment', () => {
  const expression = { $getFlag: { $country: '$getData(myCountry)' } }
  return fig.evaluate(expression).then((result: any) => {
    expect(result).toBe('🇧🇷')
  })
})

// More complex cases
test('Shorthand - nested fragments', () => {
  const expression = {
    $plus: [
      { fragment: 'adder', $values: [7, 8, 9] },
      {
        fragment: 'adder',
        parameters: {
          operator: 'buildObject',
          children: [
            '$values',
            [
              { fragment: 'getFlag', $country: 'New Zealand' },
              {
                fragment: 'getFlag',
                parameters: { $country: { operator: 'getData', property: 'myCountry' } },
              },
            ],
          ],
        },
      },
    ],
    type: 'array',
  }
  return fig.evaluate(expression).then((result: any) => {
    expect(result).toStrictEqual([24, '🇳🇿🇧🇷'])
  })
})
