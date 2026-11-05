import type { FigTreeOptions, FragmentDefinition } from 'fig-tree-evaluator'
import { fragments } from './fragments'

/**
 * The Playground's examples, which its example picker offers. The demo app in
 * fig-tree-editor-react (`demo/`) reads this folder too, through a Vite alias
 * to this checkout, so an example is written once for both.
 *
 * Each example's blurb is a Markdown file, `blurbs/<id>.md`, with its images
 * in `blurbs/img/`, referenced by relative path. The fragments and custom
 * operators the examples use are in ./fragments.ts and ./operators.ts.
 */
/**
 * The options an example can set, all plain data. As with `updateOptions()`,
 * null puts back FigTree's default.
 */
export type ExampleOptions = {
  [
    Key in
      | 'http'
      | 'graphQL'
      | 'operatorDefaults'
      | 'strictDataPaths'
      | 'timeout'
      | 'maxDepth'
      | 'maxNodes'
  ]?: FigTreeOptions[Key] | null
}

export interface PlaygroundExample {
  /**
   * A slug, for the Playground's URL and for remembering the reader's last
   * pick, so renaming the menu entry breaks neither. Also names the blurb.
   */
  id: string
  /** The menu entry. */
  name: string
  /** The evaluation data. The demo keeps the data it has if not given. */
  data?: Record<string, unknown>
  expression: unknown
  /** How many levels of the tree start open. */
  collapse?: number
  /** How many levels of the data start open, if not the Playground's 2. */
  dataCollapse?: number
  /**
   * Options the example needs, merged into the reader's own each time it's
   * opened, and kept after it. It runs with whatever else the reader, or the
   * last example, left set, so it sets or resets every option it's sensitive
   * to.
   */
  options?: ExampleOptions
  /**
   * Fragments the example calls, added to the reader's own each time it's
   * opened, and replacing any of the same name.
   */
  fragments?: Record<string, FragmentDefinition>
  /**
   * Whether the example is meant to be seen through its trace: opening it
   * turns the Playground's Trace on, for this example only, unless the reader
   * has turned it on for every one.
   */
  trace?: boolean
  /** Whether the example shows the coverage badge, in the same way as `trace`. */
  coverage?: boolean
}

export const examples: PlaygroundExample[] = [
  {
    id: 'hello',
    name: '👋 Hello, FigTree',
    data: {
      user: {
        firstName: 'Margaret',
        lastName: 'Hughes',
        nickname: 'Peggy',
        age: 34,
        country: 'New Zealand',
      },
    },
    expression: {
      '//': 'Any JSON value is an expression: the nodes in it are evaluated, and the rest is kept as written',
      title: 'Your profile',
      name: { $buildString: '{{$data.user.firstName}} {{$data.user.lastName}}' },
      callMe: {
        '//': 'The nickname if there is one, otherwise the first name',
        $firstNonNull: ['$data.user.nickname', '$data.user.firstName'],
      },
      country: '$data.user.country',
      isAdult: { $greaterThanOrEqual: ['$data.user.age', 18] },
    },
    collapse: 3,
  },
  {
    id: 'form',
    name: '📝 A form, configured',
    data: {
      country: 'Tonga',
      age: 17,
    },
    expression: {
      '//': 'A sign-up form, as a form library would take it: any of its settings can be a rule',
      title: 'Sign up',
      fields: [
        {
          name: 'country',
          label: 'Country',
          type: 'select',
          options: ['Australia', 'Fiji', 'New Zealand', 'Tonga', 'United Kingdom'],
          required: true,
        },
        {
          name: 'city',
          label: 'City',
          type: 'select',
          options: {
            '//': "With no country yet, or one the lookup doesn't know, there are no cities to offer",
            $http: {
              url: 'https://countriesnow.space/api/v0.1/countries/cities/q',
              query: { country: '$data.country' },
              returnPath: 'data',
            },
            fallback: [],
          },
          required: true,
        },
        {
          name: 'postcode',
          label: 'Postcode',
          type: 'text',
          required: {
            '//': "These countries don't use postcodes",
            $match: {
              value: '$data.country',
              branches: { Fiji: false, Tonga: false },
              default: true,
            },
          },
        },
        { name: 'age', label: 'Age', type: 'number', required: true },
        {
          name: 'licenceNumber',
          label: "Driver's licence number",
          type: 'text',
          visible: { $greaterThanOrEqual: ['$data.age', 16] },
        },
      ],
    },
    collapse: 4,
  },
  {
    id: 'movie-tickets',
    name: '🎬 Movie tickets',
    data: {
      film: { title: 'Deadpool & Wolverine', minAgeRating: 17 },
      patron: { age: 12, isParentAttending: true },
    },
    expression: {
      $if: {
        condition: {
          '//': 'Old enough for the film, OR 13 or over with a parent',
          $or: [
            { $greaterThanOrEqual: ['$data.patron.age', '$data.film.minAgeRating'] },
            {
              $and: [
                { $greaterThanOrEqual: ['$data.patron.age', 13] },
                '$data.patron.isParentAttending',
              ],
            },
          ],
        },
        then: {
          $buildString: {
            template: 'Enjoy "{{movie}}"! 🍿🎬',
            substitutions: { movie: '$data.film.title' },
          },
        },
        else: "Sorry, try again when you're older 😔",
      },
    },
    collapse: 4,
    trace: true,
  },
  {
    id: 'ferry',
    name: '⛴️ Group ferry booking',
    data: {
      passengers: [
        { name: 'Aroha', age: 41 },
        { name: 'Wiremu', age: 44 },
        { name: 'Mere', age: 9 },
        { name: 'Nan', age: 72 },
        { name: 'Tama', age: 1 },
      ],
    },
    expression: {
      '//': 'A ferry booking for a group, priced passenger by passenger',
      passengers: '$vars.lines',
      familyDiscount: '$vars.isFamily',
      total: {
        $multiply: [{ $plus: '$vars.lines[*].fare' }, { $if: ['$vars.isFamily', 0.9, 1] }],
      },
      vars: {
        fares: { infant: 0, child: 35, adult: 70, senior: 50 },
        lines: {
          $map: {
            input: '$data.passengers',
            as: 'passenger',
            each: {
              number: { $plus: ['$passengerIndex', 1] },
              name: '$passenger.name',
              fareType: '$vars.fareType',
              fare: { $get: { path: '$vars.fareType', from: '$vars.fares' } },
              vars: {
                fareType: {
                  '//': "An age that isn't a number pays the adult fare",
                  $if: [
                    { $lessThan: ['$passenger.age', 2] },
                    'infant',
                    {
                      $if: [
                        { $lessThan: ['$passenger.age', 16] },
                        'child',
                        { $if: [{ $lessThan: ['$passenger.age', 65] }, 'adult', 'senior'] },
                      ],
                    },
                  ],
                  fallback: 'adult',
                },
              },
            },
          },
        },
        isFamily: {
          '//': 'At least two adults, and a child',
          $and: [
            {
              $greaterThanOrEqual: [
                {
                  $length: { $filter: ['$vars.lines', { $equal: ['$element.fareType', 'adult'] }] },
                },
                2,
              ],
            },
            { $some: ['$vars.lines', { $equal: ['$element.fareType', 'child'] }] },
          ],
        },
      },
    },
    collapse: 3,
    dataCollapse: 3,
  },
  {
    id: 'card-games',
    name: '🃏 Card game recommender',
    data: {
      players: 4,
      youngestAge: 10,
      difficulty: 'challenging',
      games: [
        { name: 'Snap', minPlayers: 2, maxPlayers: 6, minAge: 4, difficulty: 'easy' },
        { name: 'Go Fish', minPlayers: 2, maxPlayers: 6, minAge: 5, difficulty: 'easy' },
        { name: 'Crazy Eights', minPlayers: 2, maxPlayers: 7, minAge: 6, difficulty: 'easy' },
        { name: 'Solitaire', minPlayers: 1, maxPlayers: 1, minAge: 7, difficulty: 'easy' },
        { name: 'Rummy', minPlayers: 2, maxPlayers: 6, minAge: 8, difficulty: 'challenging' },
        { name: 'Hearts', minPlayers: 3, maxPlayers: 6, minAge: 10, difficulty: 'challenging' },
        { name: '500', minPlayers: 3, maxPlayers: 6, minAge: 12, difficulty: 'hard' },
        { name: 'Bridge', minPlayers: 4, maxPlayers: 4, minAge: 14, difficulty: 'hard' },
      ],
    },
    expression: {
      '//': 'The games are in the data, so a new game is a new line there, not a new branch here',
      recommendation: { $firstNonNull: ['$vars.best.name', 'No game fits, sorry'] },
      suitable: '$vars.suitable[*].name',
      vars: {
        suitable: {
          $filter: {
            input: '$data.games',
            as: 'game',
            each: {
              $and: [
                { $greaterThanOrEqual: ['$data.players', '$game.minPlayers'] },
                { $lessThanOrEqual: ['$data.players', '$game.maxPlayers'] },
                { $greaterThanOrEqual: ['$data.youngestAge', '$game.minAge'] },
              ],
            },
          },
        },
        best: {
          '//': 'The first suitable game at the preferred difficulty, or else the first suitable game',
          $firstNonNull: [
            {
              $find: {
                input: '$vars.suitable',
                as: 'game',
                each: { $equal: ['$game.difficulty', '$data.difficulty'] },
              },
            },
            '$vars.suitable[0]',
          ],
        },
      },
    },
    collapse: 4,
  },
  {
    id: 'weather',
    name: '🌦️ What to wear today',
    data: { city: 'Wellington' },
    expression: {
      $if: {
        condition: '$data.city',
        then: {
          $if: {
            condition: '$vars.place',
            then: {
              place: { $buildString: '{{$vars.place.name}}, {{$vars.place.country}}' },
              today: {
                $buildString:
                  'Between {{$vars.forecast.temperature_2m_min[0]}}° and {{$vars.forecast.temperature_2m_max[0]}}°, with a {{$vars.forecast.precipitation_probability_max[0]}}% chance of rain',
              },
              takeAnUmbrella: {
                $greaterThanOrEqual: ['$vars.forecast.precipitation_probability_max[0]', 40],
              },
              wearAJacket: { $lessThan: ['$vars.forecast.temperature_2m_max[0]', 16] },
            },
            else: "Couldn't find a city by that name",
          },
        },
        else: 'Enter a city to see what to wear',
      },
      fallback: 'The forecast is unavailable right now',
      vars: {
        place: {
          '//': "The city's name, country and position",
          $http: {
            url: 'https://geocoding-api.open-meteo.com/v1/search',
            query: { name: '$data.city', count: 1 },
            returnPath: 'results[0]',
          },
        },
        forecast: {
          '//': "Today's forecast for that position",
          $http: {
            url: 'https://api.open-meteo.com/v1/forecast',
            query: {
              latitude: '$vars.place.latitude',
              longitude: '$vars.place.longitude',
              daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
              timezone: 'auto',
              forecast_days: 1,
            },
            returnPath: 'daily',
          },
        },
      },
    },
    collapse: 4,
  },
  {
    id: 'dashboard',
    name: '📊 Resilient dashboard',
    data: { userId: 1 },
    expression: {
      '//': 'Three panels, each with a fallback of its own, so one failing never blanks the others',
      profile: {
        $http: {
          url: { $buildString: 'https://jsonplaceholder.typicode.com/users/{{$data.userId}}' },
          returnPath: 'name',
        },
        fallback: {
          $if: [
            { $equal: ['$error.errorData.status', 404] },
            'No such user',
            'Profile unavailable',
          ],
        },
      },
      posts: {
        $length: {
          $http: {
            url: 'https://jsonplaceholder.typicode.com/posts',
            query: { userId: '$data.userId' },
          },
        },
        fallback: 'Posts unavailable',
      },
      tasksDone: {
        $buildString: [
          '%1%',
          {
            $round: {
              $multiply: [
                {
                  $divide: [
                    { $length: { $filter: ['$vars.tasks', '$element.completed'] } },
                    { $length: '$vars.tasks' },
                  ],
                },
                100,
              ],
            },
          },
        ],
        fallback: {
          $match: ['$error.code', { 'non-finite-result': 'No tasks yet' }, 'Tasks unavailable'],
        },
        vars: {
          tasks: {
            $http: {
              url: 'https://jsonplaceholder.typicode.com/todos',
              query: { userId: '$data.userId' },
            },
          },
        },
      },
    },
    collapse: 3,
    coverage: true,
  },
  {
    id: 'product-search',
    name: '🔎 Product search',
    data: { search: 'on', maxPrice: 15 },
    expression: {
      heading: {
        $buildString: [
          '%1 of the %2 products matching "%3" cost $%4 or less',
          { $length: '$vars.products' },
          '$vars.matching',
          '$data.search',
          '$data.maxPrice',
        ],
      },
      products: {
        $map: {
          input: '$vars.products',
          as: 'product',
          each: {
            $buildString: {
              template:
                '{{$product.product_name}}: ${{$product.price}}, {{stock}} ({{$product.company_name}}, {{$product.country}})',
              substitutions: {
                stock: {
                  $if: [
                    { $equal: ['$product.units_in_stock', 0] },
                    '❌ out of stock',
                    {
                      $if: [
                        { $lessThan: ['$product.units_in_stock', 10] },
                        { $buildString: ['⚠️ only %1 left', '$product.units_in_stock'] },
                        { $buildString: ['%1 in stock', '$product.units_in_stock'] },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      },
      vars: {
        products: {
          '//': 'The search term and price are bound as values, never written into the SQL',
          $sql: {
            query:
              "SELECT p.product_name, printf('%.2f', p.unit_price) AS price, p.units_in_stock, s.company_name, s.country FROM products p JOIN suppliers s ON s.supplier_id = p.supplier_id WHERE p.product_name LIKE '%' || $1 || '%' AND p.unit_price <= $2 ORDER BY p.unit_price",
            values: ['$data.search', '$data.maxPrice'],
          },
        },
        matching: {
          $sql: {
            query: "SELECT COUNT(*) FROM products WHERE product_name LIKE '%' || $1 || '%'",
            values: ['$data.search'],
            shape: 'firstValue',
          },
        },
      },
    },
    collapse: 3,
  },
  {
    id: 'fragments',
    name: "🧩 Your app's vocabulary",
    data: {
      customer: { firstName: 'Ana' },
      order: {
        shipTo: 'NZ',
        items: [
          { name: 'Merino socks', quantity: 2, price: 24.99 },
          { name: 'Wool beanie', quantity: 1, price: 39.95 },
        ],
      },
    },
    expression: {
      $buildString: {
        template:
          '{{greeting}} Your order of {{count}} is on its way to {{where}}.\n\n{{lines}}\nTotal: {{total}}',
        substitutions: {
          greeting: { $greeting: { name: '$data.customer.firstName' } },
          count: {
            $plural: { count: { $plus: '$data.order.items[*].quantity' }, noun: 'item' },
          },
          where: { $destination: { code: '$data.order.shipTo' } },
          lines: {
            $join: {
              values: {
                $map: [
                  '$data.order.items',
                  {
                    $orderLine: {
                      name: '$element.name',
                      quantity: '$element.quantity',
                      price: '$element.price',
                    },
                  },
                ],
              },
              delimiter: '\n',
            },
          },
          total: {
            $money: {
              amount: {
                $plus: {
                  $map: [
                    '$data.order.items',
                    { $multiply: ['$element.quantity', '$element.price'] },
                  ],
                },
              },
            },
          },
        },
      },
    },
    collapse: 4,
    fragments,
  },
  {
    id: 'dates',
    name: '📅 Dates, your way',
    data: {
      plan: 'Pro',
      renews: '2026-11-14',
      today: '2026-11-04',
    },
    expression: {
      $if: [
        { $greaterThanOrEqual: ['$vars.days', 0] },
        {
          $buildString: 'Your {{$data.plan}} plan renews on {{$vars.date}}, in {{$vars.days}} days',
        },
        {
          $buildString: [
            'Your %1 plan expired on %2, %3 days ago',
            '$data.plan',
            '$vars.date',
            { $abs: '$vars.days' },
          ],
        },
      ],
      fallback: "We couldn't read your renewal date",
      vars: {
        days: {
          '//': "Counting from the data's today, so the example never goes stale. Remove from to count from the real today",
          $daysUntil: { date: '$data.renews', from: '$data.today' },
        },
        date: { $formatDate: { date: '$data.renews', style: 'weekday' } },
      },
    },
    collapse: 4,
  },
  {
    id: 'string-substitution',
    name: '🧵 Complex string substitution',
    data: {
      user: {
        name: { first: 'Natasha', last: 'Romanoff' },
        country: 'Russia',
        friends: ['Steve', 'Bruce', 'Tony'],
        pronouns: 'she',
      },
    },
    expression: {
      $buildString: {
        template:
          "This applicant's name is {{$data.user.name.first}} {{$data.user.name.last}}. {{$vars.pronoun.lives}} in {{$data.user.country}}, where the capital city is {{capital}}. {{$vars.pronoun.has}} {{friendCount}}.",
        substitutions: {
          capital: {
            $http: {
              url: 'https://countriesnow.space/api/v0.1/countries/capital/q',
              query: { country: '$data.user.country' },
              returnPath: 'data.capital',
            },
            fallback: 'unknown',
          },
          friendCount: {
            $match: {
              value: '$vars.count',
              branches: { '0': 'no friends 😢', '1': 'only one friend' },
              default: {
                $if: {
                  condition: { $greaterThan: ['$vars.count', 4] },
                  then: 'loads of friends',
                  else: { $buildString: ['%1 friends', '$vars.count'] },
                },
              },
            },
            vars: { count: { $length: '$data.user.friends' } },
          },
        },
      },
      vars: {
        pronoun: {
          '//': 'The wording for each set of pronouns, read in the template as $vars.pronoun.lives and $vars.pronoun.has',
          $match: {
            value: '$data.user.pronouns',
            branches: {
              she: { lives: 'She lives', has: 'She has' },
              he: { lives: 'He lives', has: 'He has' },
            },
            default: { lives: 'They live', has: 'They have' },
          },
        },
      },
    },
    collapse: 4,
  },
  {
    id: 'random-user',
    name: '🎲 Random user',
    expression: {
      $buildString:
        'Hello, {{$vars.user.name.first}} {{$vars.user.name.last}} from {{$vars.user.location.city}}, {{$vars.user.location.country}}!',
      vars: {
        user: { $http: { url: 'https://randomuser.me/api/', returnPath: 'results[0]' } },
      },
    },
    // The example is about the cache, which a link's noCache can leave off
    options: { operatorDefaults: null },
  },
]
