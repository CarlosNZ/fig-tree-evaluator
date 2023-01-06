import FigTreeEvaluator from '..'

const exp = new FigTreeEvaluator({
  graphQLConnection: {
    endpoint: 'https://countries.trevorblades.com/',
  },
  returnErrorAsString: true,
  fragments: {
    getCountry: {
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
  },
})

// Fragments

test('Fragments, single parameter at root', () => {
  const expression = {
    fragment: 'getCountry',
    $country: 'New Zealand',
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe('🇳🇿')
  })
})

// Parameters in "parameters" object (evaluated)

// Update fragments (don't forget to update "mergeOptions" method)

// Fragment can be a simple type (e.g. string)
