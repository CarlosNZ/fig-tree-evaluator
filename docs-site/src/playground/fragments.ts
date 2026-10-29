import type { FragmentDefinition } from 'fig-tree-evaluator'

/**
 * The fragments the Playground's examples call. The Playground and the demo
 * each register them on an instance of their own.
 */
export const fragments: Record<string, FragmentDefinition> = {
  getCapital: {
    expression: {
      $http: {
        url: 'https://countriesnow.space/api/v0.1/countries/capital',
        method: 'post',
        body: { country: '$params.country' },
        returnPath: 'data.capital',
      },
    },
    parameters: { country: { type: 'string' } },
    listing: {
      displayName: 'Capital city',
      description: "Gets a country's capital city",
      samples: { country: 'Japan' },
    },
  },
  getFlag: {
    expression: {
      $http: {
        url: 'https://countriesnow.space/api/v0.1/countries/flag/unicode',
        method: 'post',
        body: { country: '$params.country' },
        returnPath: 'data.unicodeFlag',
      },
    },
    parameters: { country: { type: 'string', default: 'New Zealand' } },
    listing: {
      description: "Gets a country's flag",
      colors: { background: 'black', text: 'white' },
      samples: { country: 'France' },
    },
  },
}

export const initialFragmentName = 'greeting'

/**
 * The fragment the fragment editor starts with, before one is saved: a body
 * reading two parameters, one of them optional. Not registered.
 */
export const initialFragmentDefinition: FragmentDefinition = {
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
}
