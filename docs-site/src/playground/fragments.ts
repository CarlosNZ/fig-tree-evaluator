import type { FragmentDefinition } from 'fig-tree-evaluator'

/**
 * The fragments the Playground's examples call: a small vocabulary for an
 * online shop's messages. The Playground and the demo each register them on
 * an instance of their own.
 */
export const fragments: Record<string, FragmentDefinition> = {
  greeting: {
    expression: {
      $plus: [
        { $if: { condition: '$params.formal', then: 'Good day, ', else: 'Hi, ' } },
        '$params.name',
        '!',
      ],
    },
    parameters: {
      name: { type: 'string' },
      formal: { type: 'boolean', default: false },
    },
    listing: {
      displayName: 'Greeting',
      description: 'Greets someone by name, formally or not',
      parameterDescriptions: { name: 'Who to greet', formal: 'Whether the greeting is formal' },
      colors: { background: '#e8e0f8', text: '#4b2a8a' },
      samples: { name: 'Ada' },
    },
  },
  plural: {
    expression: {
      $buildString: [
        '%1 %2',
        '$params.count',
        {
          $if: [
            { $equal: ['$params.count', 1] },
            '$params.noun',
            { $firstNonNull: ['$params.plural', { $plus: ['$params.noun', 's'] }] },
          ],
        },
      ],
    },
    parameters: {
      count: { type: 'number' },
      noun: { type: 'string' },
      plural: { type: 'string', required: false },
    },
    listing: {
      displayName: 'Plural',
      description: 'A count and a noun, such as "1 item" or "3 items"',
      parameterDescriptions: {
        count: 'How many',
        noun: 'The noun, for one',
        plural: 'The noun, for more than one, if adding "s" is wrong',
      },
      colors: { background: '#e0f0e8', text: '#1f5c3d' },
      samples: { count: 3, noun: 'item' },
    },
  },
  money: {
    expression: {
      $buildString: ['%1%2', '$params.symbol', { $round: ['$params.amount', 2] }],
    },
    parameters: {
      amount: { type: 'number' },
      symbol: { type: 'string', default: '$' },
    },
    listing: {
      displayName: 'Money',
      description: 'An amount of money, with its currency symbol',
      parameterDescriptions: { amount: 'The amount', symbol: 'The currency symbol' },
      colors: { background: '#f8ecd0', text: '#6b4a0b' },
      samples: { amount: 24.99 },
    },
  },
  orderLine: {
    expression: {
      $buildString: [
        '%1 × %2: %3',
        '$params.quantity',
        '$params.name',
        { $money: { amount: { $multiply: ['$params.quantity', '$params.price'] } } },
      ],
    },
    parameters: {
      name: { type: 'string' },
      quantity: { type: 'number' },
      price: { type: 'number' },
    },
    listing: {
      displayName: 'Order line',
      description: 'One line of an order, with its cost',
      parameterDescriptions: {
        name: "The product's name",
        quantity: 'How many were ordered',
        price: 'The price of one',
      },
      colors: { background: '#f8ecd0', text: '#6b4a0b' },
      samples: { name: 'Merino socks', quantity: 2, price: 24.99 },
    },
  },
  destination: {
    expression: {
      $buildString: ['%1 %2', '$vars.country.name', '$vars.country.emoji'],
      vars: {
        country: {
          $graphQL: {
            query: 'query ($code: ID!) { country(code: $code) { name emoji } }',
            variables: { code: '$params.code' },
            url: 'https://countries.trevorblades.com/graphql',
            returnPath: 'country',
          },
        },
      },
    },
    parameters: { code: { type: 'string' } },
    listing: {
      displayName: 'Destination',
      description: "A country's name and flag, from its two-letter code",
      parameterDescriptions: { code: "The country's two-letter code, such as 'NZ'" },
      colors: { background: '#dcecf8', text: '#1d4f73' },
      samples: { code: 'NZ' },
    },
  },
}

export const initialFragmentName = 'greeting'

/** The fragment the demo's fragment editor starts with: the registered `greeting`. */
export const initialFragmentDefinition: FragmentDefinition = fragments.greeting
