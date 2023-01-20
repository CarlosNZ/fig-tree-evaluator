import FigTreeEvaluator from '../src'

const exp = new FigTreeEvaluator({
  graphQLConnection: {
    endpoint: 'https://countries.trevorblades.com/',
  },
  returnErrorAsString: true,
  objects: { myCountry: 'Brazil' },
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

// Fragments

test('Fragments, single parameter at root', () => {
  const expression = {
    fragment: 'getFlag',
    $country: 'New Zealand',
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe('🇳🇿')
  })
})

test('Join two fragments together, one simple, one using a single "parameter")', () => {
  const expression = {
    operator: '+',
    values: [
      { fragment: 'simpleFragment' },
      {
        fragment: 'getFlag',
        parameters: { $country: { operator: 'getData', property: 'myCountry' } },
      },
    ],
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe('The flag of Brazil is: 🇧🇷')
  })
})

test('Fragment used multiple times in an expression (with different parameters (nested))', () => {
  const expression = {
    operator: '+',
    values: [
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
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toStrictEqual([24, '🇳🇿🇧🇷'])
  })
})

const countryDataExpression = {
  fragment: 'adder',
  $values: [
    {
      fragment: 'getCountryData',
      $country: { operator: 'getData', property: 'variables.country' },
      $field: { operator: 'getData', property: 'variables.field' },
    },
    ', ',
    {
      fragment: 'getCountryData',
      $country: { operator: 'getData', property: 'variables.country' },
      $field: { operator: 'getData', property: 'variables.otherField' },
    },
  ],
}

test('Use old and new fragments', () => {
  // Add a new fragment to options
  exp.updateOptions({
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
  return exp
    .evaluate(countryDataExpression, {
      objects: {
        variables: { country: 'New Zealand', field: 'capital[0]', otherField: 'name.common' },
      },
    })
    .then((result: any) => {
      expect(result).toBe('Wellington, New Zealand')
    })
})

test('Same thing but with different data object', () => {
  return exp
    .evaluate(countryDataExpression, {
      objects: {
        variables: { country: 'Australia', field: 'tld[0]', otherField: 'region' },
      },
    })
    .then((result: any) => {
      expect(result).toBe('.au, Oceania')
    })
})

test('Add a new fragment to current evaluation options', () => {
  const expression = {
    fragment: 'adder',
    parameters: { $values: [{ fragment: 'basic' }, { fragment: 'basic' }] },
  }
  return exp.evaluate(expression, { fragments: { basic: 'SimpleText' } }).then((result: any) => {
    expect(result).toBe('SimpleTextSimpleText')
  })
})

test('Missing fragment', () => {
  const expression = {
    fragment: 'newFragment',
    parameters: { $temp: "Doesn't matter" },
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe('Fragment not defined: newFragment')
  })
})

test('Missing fragment with fallback', () => {
  const expression = {
    fragment: 'newFragment',
    fallback: { fragment: 'adder', $values: ['This appears', ' ', 'instead'] },
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe('This appears instead')
  })
})

// Add decision tree to fragments
exp.updateOptions({
  fragments: {
    weatherMatcher: {
      operator: 'match',
      children: [
        { operator: 'objectProperties', property: 'weather' },
        'sunny',
        {
          operator: 'match',
          match: {
            operator: 'objProps',
            property: 'humidity',
          },
          high: 'NO',
          normal: 'YES',
        },
        'cloudy',
        'YES',
        'rainy',
        {
          operator: 'match',
          match: {
            operator: 'objProps',
            property: 'wind',
          },
          branches: ['strong', 'NO', 'weak', 'YES'],
        },
      ],
    },
  },
})

test('Using a decision tree as a fragment', () => {
  const expression = { fragment: 'weatherMatcher' }
  return exp
    .evaluate(expression, {
      data: { weather: 'rainy', humidity: 'high', wind: 'strong' },
    })
    .then((result: any) => {
      expect(result).toBe('NO')
    })
})

test('Using a fragment as an alias node', () => {
  const expression = {
    operator: '?',
    $getNZ: { fragment: 'getCountryData', $country: 'zealand', $field: 'name.common' },
    condition: {
      operator: '!=',
      values: ['$getNZ', null],
    },
    valueIfTrue: '$getNZ',
    valueIfFalse: 'Not New Zealand',
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe('New Zealand')
  })
})

exp.updateOptions({
  fragments: {
    addAndDouble: { operator: 'x', values: [{ fragment: 'adder', $values: '$numbers' }, 2] },
  },
})
test('Fragment references another fragment 🙄', () => {
  const expression = { fragment: 'addAndDouble', $numbers: [3, 4, 5] }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe(24)
  })
})

// Edge cases (not useful IRL) -- fragment values are falsy

exp.updateOptions({
  fragments: { falsy: false, falsy2: null, falsy3: '', falsy4: 0, truthy: true },
})
test('Fragment values are falsy', () => {
  const expression = [
    { fragment: 'falsy' },
    { fragment: 'falsy2' },
    { fragment: 'falsy3' },
    { fragment: 'falsy4' },
    { fragment: 'truthy' },
  ]
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toStrictEqual([false, null, '', 0, true])
  })
})
