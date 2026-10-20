import JSON5 from 'json5'
import type { FragmentDefinition } from 'fig-tree-evaluator'

/**
 * The fragments the Fragments page's examples call, as JSON5 source. The
 * page shows each definition from its source here (FragmentSetup.astro), and
 * the instance its examples evaluate with registers the same source parsed
 * (./figTree.ts), so a definition on the page is always the one that ran.
 *
 * Only examples that ask for them see these (`fragments` on <Expression> and
 * <Playground>): everywhere else, the site's editors offer no fragments.
 */
export const fragmentSources: Record<string, string> = {
  priceWithTax: `{
  expression: {
    $round: [
      { $multiply: ['$params.amount', { $plus: [1, { $divide: ['$params.rate', 100] }] }] },
      2,
    ],
  },
  parameters: {
    amount: { type: 'number' },
    rate: { type: 'number', default: 15 },
  },
  description: 'A price with a percentage sales tax added, rounded to the cent',
}`,
  averageOrder: `{
  expression: {
    $round: [
      { $divide: [{ $plus: '$params.orders[*].amount' }, { $length: '$params.orders' }] },
      2,
    ],
  },
  parameters: {
    orders: {
      type: 'array',
      // Each order needs a numeric amount
      constraints: { elementShape: { amount: { type: 'number' } } },
    },
  },
  description: "The average of a list of orders' amounts, rounded to the cent",
}`,
  countryCurrency: `{
  expression: {
    $get: {
      from: {
        $http: {
          url: 'https://countriesnow.space/api/v0.1/countries/currency/q',
          query: { country: '$params.country' },
        },
      },
      path: 'data.currency',
    },
    // An unknown country is a 404, so every call gets null for it
    fallback: null,
  },
  parameters: {
    country: { type: 'string' },
  },
  description: "A country's currency code, such as 'NZD', or null if the country isn't found",
}`,
}

export const fragments: Record<string, FragmentDefinition> = Object.fromEntries(
  Object.entries(fragmentSources).map(([name, source]) => [name, JSON5.parse(source)])
)
