const operators = [
  {
    name: 'GET',
    description: 'HTTP Get Request',
    aliases: ['get', 'api'],
    parameters: [
      {
        name: 'url',
        description: 'Endpoint URL',
        aliases: ['endpoint'],
        required: true,
        type: 'string',
      },
      {
        name: 'returnProperty',
        description: 'Property from request result',
        aliases: ['outputProperty'],
        required: false,
        type: 'string',
      },
      {
        name: 'headers',
        description: 'HTTP Headers',
        aliases: [],
        required: false,
        type: 'object',
      },
      {
        name: 'parameters',
        description: 'Query parameters (key-value)',
        aliases: [],
        required: false,
        type: 'object',
      },
      {
        name: 'useCache',
        description: 'Whether or not the FigTree cache is used',
        aliases: [],
        required: false,
        type: 'boolean',
      },
    ],
  },
]
