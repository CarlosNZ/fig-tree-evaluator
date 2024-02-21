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
          parameters: [
            { name: '$country', type: 'string', required: true, default: 'New Zealand' },
          ],
        },
      },
      simpleFragment: 'The flag of Brazil is: ',
      adder: {
        operator: '+',
        values: '$values',
      },
    },
  },
  customFunctions: {},
}
