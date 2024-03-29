import 'dotenv/config'
import { FigTreeEvaluator } from './evaluator'
import { Client } from 'pg'
import pgConfig from './postgres/pgConfig.json'

// Postgres tests require a copy of the Northwind database to be running
// locally, with configuration defined in ./postgres/pgConfig.json. Initialise
// the Northwind DB using the "northwind.sql" script.

const pgConnect = new Client(pgConfig)

pgConnect.connect()

const exp = new FigTreeEvaluator({
  pgConnection: pgConnect,
  graphQLConnection: {
    endpoint: 'https://countries.trevorblades.com/',
  },
})

// Postgres

test('Postgres - lookup single string', () => {
  const expression = {
    operator: 'postgres',
    children: ["SELECT contact_name FROM customers where customer_id = 'FAMIA';"],
    type: 'string',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('Aria Cruz')
  })
})

test('Postgres - get an array of Orders using var substitution', () => {
  const expression = {
    operator: 'pg',
    children: [
      "SELECT order_id, TO_CHAR(order_date :: DATE, 'Mon dd, yyyy') as order_date, ship_city, ship_country FROM public.orders WHERE customer_id = $1 AND order_id < 10500;",
      'FAMIA',
    ],
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toStrictEqual([
      {
        order_id: 10347,
        order_date: 'Nov 06, 1996',
        ship_city: 'Sao Paulo',
        ship_country: 'Brazil',
      },
      {
        order_id: 10386,
        order_date: 'Dec 18, 1996',
        ship_city: 'Sao Paulo',
        ship_country: 'Brazil',
      },
      {
        order_id: 10414,
        order_date: 'Jan 14, 1997',
        ship_city: 'Sao Paulo',
        ship_country: 'Brazil',
      },
    ])
  })
})

test('Postgres - count employees', () => {
  const expression = {
    operator: 'postgres',
    children: ['SELECT COUNT(*) FROM employees'],
    type: 'number',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe(9)
  })
})

test('Postgres - get list of (most) products, using properties', () => {
  const expression = {
    operator: 'pgSQL',
    query: 'SELECT product_name FROM public.products WHERE category_id = $1 AND supplier_id != $2',
    values: [1, 16],
    type: 'array',
  }
  return exp.evaluate(expression).then((result) => {
    // prettier-ignore
    expect(result).toStrictEqual(["Chai","Chang","Guaraná Fantástica","Côte de Blaye","Chartreuse verte","Ipoh Coffee","Outback Lager","Rhönbräu Klosterbier","Lakkalikööri"])
  })
})

// GraphQL

test('GraphQL - get list of countries', () => {
  const expression = {
    operator: 'GraphQL',
    children: [
      `query getCountries {
            countries(filter: {continent: {eq: "OC"}}) {
              name
            }
          }`,
      'https://countries.trevorblades.com/',
      [],
    ],
  }
  return exp.evaluate(expression).then((result) => {
    // prettier-ignore
    expect(result).toStrictEqual({"countries":[{"name":"American Samoa"},{"name":"Australia"},{"name":"Cook Islands"},{"name":"Fiji"},{"name":"Micronesia"},{"name":"Guam"},{"name":"Kiribati"},{"name":"Marshall Islands"},{"name":"Northern Mariana Islands"},{"name":"New Caledonia"},{"name":"Norfolk Island"},{"name":"Nauru"},{"name":"Niue"},{"name":"New Zealand"},{"name":"French Polynesia"},{"name":"Papua New Guinea"},{"name":"Pitcairn Islands"},{"name":"Palau"},{"name":"Solomon Islands"},{"name":"Tokelau"},{"name":"East Timor"},{"name":"Tonga"},{"name":"Tuvalu"},{"name":"U.S. Minor Outlying Islands"},{"name":"Vanuatu"},{"name":"Wallis and Futuna"},{"name":"Samoa"}]})
  })
})

test('GraphQL - get list of countries, using properties, use default endpoint', () => {
  const expression = {
    operator: 'GraphQL',
    query: `query getCountries {
        countries(filter: {continent: {eq: "OC"}}) {
          name
        }
      }`,
  }
  return exp.evaluate(expression).then((result) => {
    // prettier-ignore
    expect(result).toStrictEqual({"countries":[{"name":"American Samoa"},{"name":"Australia"},{"name":"Cook Islands"},{"name":"Fiji"},{"name":"Micronesia"},{"name":"Guam"},{"name":"Kiribati"},{"name":"Marshall Islands"},{"name":"Northern Mariana Islands"},{"name":"New Caledonia"},{"name":"Norfolk Island"},{"name":"Nauru"},{"name":"Niue"},{"name":"New Zealand"},{"name":"French Polynesia"},{"name":"Papua New Guinea"},{"name":"Pitcairn Islands"},{"name":"Palau"},{"name":"Solomon Islands"},{"name":"Tokelau"},{"name":"East Timor"},{"name":"Tonga"},{"name":"Tuvalu"},{"name":"U.S. Minor Outlying Islands"},{"name":"Vanuatu"},{"name":"Wallis and Futuna"},{"name":"Samoa"}]})
  })
})

test('GraphQL - single country lookup, default endpoint, return node', () => {
  const expression = {
    operator: 'GraphQL',
    children: [
      `query getCountry($code: String!) {
        countries(filter: {code: {eq: $code}}) {
          name
          emoji
        }
      }`,
      null,
      ['code'],
      'NZ',
      'countries.emoji',
    ],
    type: 'string',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('🇳🇿')
  })
})

test('GraphQL - single country lookup, default endpoint, return node, using props', () => {
  const expression = {
    operator: 'graphQL',
    query: `query getCountry($code: String!) {
        countries(filter: {code: {eq: $code}}) {
          name
          emoji
        }
      }`,
    variables: { code: 'NZ' },
    returnNode: 'countries[0].emoji',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('🇳🇿')
  })
})

test('GraphQL - single country lookup, default endpoint, return node, using parameters from buildObject', () => {
  const expression = {
    operator: 'graphQL',
    query: `query getCountry($code: String!) {
        countries(filter: {code: {eq: $code}}) {
          name
          emoji
        }
      }`,
    variables: {
      operator: 'buildObject',
      values: [
        {
          key: 'code',
          value: {
            operator: 'GET',
            children: ['https://restcountries.com/v3.1/name/nepal', [], '[0].cca2'],
          },
        },
      ],
    },
    returnNode: 'countries[0].emoji',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('🇳🇵')
  })
})

// Localhost tests, needs specific local setup
// test('GraphQL -- use localhost endpoint', () => {
//   const auth = require('./testSecrets.json')
//   const expression = {
//     operator: 'GraphQL',
//     query: `query App {
//       application(id: 22) {
//         name
//       }
//     }`,
//     endpoint: 'http://localhost:5000/graphql',
//     returnNode: 'application.name',
//     headers: auth,
//   }
//   return exp.evaluate(expression).then((result) => {
//     expect(result).toEqual('Company Registration - S-ECL-0011')
//   })
// })

// test('Test GraphQL -- get single application name', () => {
//   const auth = require('./testSecrets.json')
//   exp.updateOptions({ graphQLConnection: { endpoint: 'http://localhost:5000/graphql' } })
//   return exp
//     .evaluate(
//       {
//         operator: 'graphQL',
//         children: [
//           `query App($appId:Int!) {
//           application(id: $appId) {
//             name
//           }
//         }`,
//           'graphQLEndpoint',
//           ['appId'],
//           22,
//           'application.name',
//         ],
//       },
//       {
//         headers: auth,
//       }
//     )
//     .then((result) => {
//       expect(result).toEqual('Company Registration - S-ECL-0011')
//     })
// })

// Authentication

test('GraphQL - Get repo info using partial url and updated options, requires auth', () => {
  exp.updateOptions({
    graphQLConnection: {
      endpoint: 'https://api.github.com/',
      headers: { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN },
    },
  })
  const expression = {
    operator: 'graphQL',
    url: 'graphql',
    query: `query($repoName:String!){
              viewer {
                login
                repository(name: $repoName) {
                  description
                }
              }
            }`,
    variables: { repoName: 'fig-tree' },
    returnNode: 'viewer.repository.description',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe('A highly configurable custom expression tree evaluator')
  })
})

// Close PG connection so script can exit
afterAll(() => {
  pgConnect.end()
})
