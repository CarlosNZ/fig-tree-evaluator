import FigTreeEvaluator from '../src'
import { preProcessShorthand } from '../src/shorthandSyntax'

const fig = new FigTreeEvaluator({
  graphQLConnection: {
    endpoint: 'https://countries.trevorblades.com/',
  },
  returnErrorAsString: true,
  objects: { myCountry: 'Brazil', otherCountry: 'France' },
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

test('Shorthand - simple string expression', () => {
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

// Don't forget to prevent re-evaluation of
