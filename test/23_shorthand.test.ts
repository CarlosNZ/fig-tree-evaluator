import fetch from 'node-fetch'
import { FigTreeEvaluator } from './evaluator'
import { preProcessShorthand } from '../src/shorthandSyntax'

const fig = new FigTreeEvaluator({
  graphQLConnection: {
    endpoint: 'https://countries.trevorblades.com/',
  },
  httpClient: fetch,
  returnErrorAsString: true,
  objects: {
    myCountry: 'Brazil',
    otherCountry: 'France',
    deep: { p: 12 },
    user: { firstName: 'Bruce', lastName: 'Banner' },
  },
  functions: { getPrincess: (name: string) => `Princess ${name}` },
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
    shorthandFragment: { $stringSubstitution: ['My name is %1', '$name'] },
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
        $getData: 'user.firstName',
      },
      ' ',
      {
        $getData: 'user.lastName',
      },
    ],
  })
})

test('Shorthand - fragment 1', () => {
  const expression = { $getFlag: { $country: '$getData(myCountry)' } }
  expect(preProcessShorthand(expression, fig.getOptions().fragments)).toStrictEqual({
    fragment: 'getFlag',
    parameters: {
      $country: '$getData(myCountry)',
    },
  })
})

// Same as above expressions, but checking the actual evaluation result
test('Shorthand - evaluate simple string expression', () => {
  const expression = '$getData(deep.p)'
  return fig.evaluate(expression).then((result) => {
    expect(result).toBe(12)
  })
})

test('Shorthand - evaluate nested string expression', () => {
  const expression = '$plus( $getData ( myCountry), $getData(otherCountry))'
  return fig.evaluate(expression).then((result) => {
    expect(result).toBe('BrazilFrance')
  })
})

test('Shorthand - evaluate simple object expression', () => {
  const expression = { $plus: [1, 2, 3] }
  return fig.evaluate(expression).then((result) => {
    expect(result).toBe(6)
  })
})

test('Shorthand - evaluate nested object expression', () => {
  const expression = {
    $plus: [{ $getData: 'user.firstName' }, ' ', { $getData: 'user.lastName' }],
  }
  return fig.evaluate(expression).then((result) => {
    expect(result).toBe('Bruce Banner')
  })
})

test('Shorthand - evaluate fragment', () => {
  const expression = { $getFlag: { $country: '$getData(myCountry)' } }
  return fig.evaluate(expression).then((result) => {
    expect(result).toBe('🇧🇷')
  })
})

test('Shorthand - custom function', () => {
  const expression = { $function: ['getPrincess', 'Leia'] }
  return fig.evaluate(expression).then((result) => {
    expect(result).toBe('Princess Leia')
  })
})

test('Shorthand - custom function as string', () => {
  const expression = '$function(getPrincess, Diana)'
  return fig.evaluate(expression).then((result) => {
    expect(result).toBe('Princess Diana')
  })
})

test('Shorthand - with alias fallback', () => {
  const expression = {
    $plus: [
      {
        operator: 'objProps',
        property: 'cant.find.this',
        fallback: '$myFallback',
      },
    ],
    $myFallback: 'EMPIRE',
  }
  return fig.evaluate(expression).then((result) => {
    expect(result).toBe('EMPIRE')
  })
})

test('Shorthand - with node as direct parameter', () => {
  const expression = {
    $objProps: {
      $plus: ['user.', 'lastName'],
    },
  }
  return fig.evaluate(expression).then((result) => {
    expect(result).toBe('Banner')
  })
})

test('Shorthand - with operator and named parameter', () => {
  const expression = { $getData: { property: 'user.firstName' } }
  return fig.evaluate(expression).then((result) => {
    expect(result).toBe('Bruce')
  })
})

// More complex cases
test('Shorthand - nested fragments', () => {
  const expression = {
    $plus: [
      { $adder: { $values: [7, 8, 9] } },
      {
        $adder: {
          $buildObject: [
            '$values',
            [
              { $getFlag: { $country: 'New Zealand' } },
              { $getFlag: { $country: { operator: 'getData', property: 'myCountry' } } },
            ],
          ],
        },
      },
    ],
    type: 'array',
  }
  return fig.evaluate(expression).then((result) => {
    expect(result).toStrictEqual([24, '🇳🇿🇧🇷'])
  })
})

test('Shorthand - mixed fragments & operators with multiple syntaxes', () => {
  const expression = {
    $adder: {
      $values: [
        {
          fragment: 'getCountryData',
          $country: '$getData(variables.country)',
          $field: { $getData: 'variables.field' },
        },
        ', ',
        {
          $getCountryData: {
            $country: '$getData( variables.country )',
            $field: { $getData: { property: 'variables.otherField' } },
          },
        },
      ],
    },
  }
  fig.updateOptions({
    fragments: {
      getCountryData: {
        operator: 'GET',
        url: {
          operator: 'stringSubstitution',
          string: 'https://restcountries.com/v3.1/name/%1',
          replacements: ['$country'],
        },
        returnProperty: { operator: '+', values: ['[0].', '$field'] },
      },
    },
  })
  return fig
    .evaluate(expression, {
      objects: {
        variables: { country: 'New Zealand', field: 'capital[0]', otherField: 'name.common' },
      },
    })
    .then((result) => {
      expect(result).toStrictEqual('Wellington, New Zealand')
    })
})

test('Shorthand - fragment is in shorthand syntax', () => {
  const expression = { fragment: 'shorthandFragment', $name: 'Slim Shady' }
  return fig.evaluate(expression).then((result) => {
    expect(result).toBe('My name is Slim Shady')
  })
})

test('Shorthand - shorthand fragment with shorthand expression', () => {
  const expression = { $shorthandFragment: { $name: 'Slim Shady' } }
  return fig.evaluate(expression).then((result) => {
    expect(result).toBe('My name is Slim Shady')
  })
})
