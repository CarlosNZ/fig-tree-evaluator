export const evaluatorConfig = {
  fragments: {
    getCapital: {
      operator: 'GET',
      url: {
        operator: 'stringSubstitution',
        string: 'https://restcountries.com/v3.1/name/%1',
        replacements: ['$country'],
      },
      returnProperty: '[0].capital',
      outputType: 'string',
      metadata: {
        description: "Gets a country's capital city",
        parameters: [{ name: '$country', type: 'string', required: true }],
      },
    },
    getFlag: {
      operator: 'GET',
      children: [
        {
          operator: 'stringSubstitution',
          string: 'https://restcountries.com/v3.1/name/%1',
          replacements: ['$country'],
          default: 'New Zealand',
        },
        [],
        'flag',
      ],
      outputType: 'string',
      metadata: {
        description: "Gets a country's flag",
        parameters: [{ name: '$country', type: 'string', required: true, default: 'New Zealand' }],
      },
    },
    adder: {
      operator: '+',
      values: '$values',
    },
  },
  customFunctions: {
    reverse: (input: unknown[] | string) => {
      if (Array.isArray(input)) return [...input].reverse()
      return input.split('').reverse().join('')
    },
    plus: (...values: any[]) => values.reduce((acc, val) => acc + val),
  },
}
