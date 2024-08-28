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
    reverse: {
      function: (input: unknown[] | string) => {
        if (Array.isArray(input)) return [...input].reverse()
        return input.split('').reverse().join('')
      },
      description: 'Reverse a string, or array',
      argsDefault: ['Reverse Me'],
    },
    changeCase: {
      function: ({ string, toCase }: { string: string; toCase: 'lower' | 'upper' }) =>
        toCase === 'upper' ? string.toUpperCase() : string.toLowerCase(),
      description: 'Convert a string to either upper or lower case',
      inputDefault: { string: 'New string', toCase: 'upper' },
    },
    currentDate: () => new Date(),
    getFullName: {
      function: (nameObject: { firstName: string; lastName: string }) => {
        return `${nameObject.firstName} ${nameObject.lastName}`
      },
      description: 'Combine first and last names',
      inputDefault: { firstName: 'First', lastName: 'Last' },
    },
  },
}
