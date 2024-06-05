import 'dotenv/config'
import { FigTreeEvaluator } from './evaluator'
import { Client } from 'pg'
import pgConfig from './database/pgConfig.json'
import { SQLNodePostgres, SQLite } from '../src/databaseConnections'
import sqlite3 from 'sqlite3'
import { open, Database } from 'sqlite'
import { AxiosClient, FetchClient } from '../src'
import axios from 'axios'
import fetch from 'node-fetch'

// SQL tests require a copy of the Northwind database to be running
// locally, with configuration defined in ./database/pgConfig.json. Initialise
// the Northwind DB using the "northwind.sql" script.

const pgConnect = new Client(pgConfig)

pgConnect.connect()

let db: Database
let expSqlite: FigTreeEvaluator

const initialiseSqlLite = async () => {
  db = await open({
    filename: './test/database/northwind.sqlite',
    driver: sqlite3.Database,
  })

  expSqlite = new FigTreeEvaluator({
    sqlConnection: SQLite(db),
  })
}

beforeAll(async () => {
  return initialiseSqlLite()
})

const exp = new FigTreeEvaluator({
  sqlConnection: SQLNodePostgres(pgConnect),
  graphQLConnection: {
    endpoint: 'https://countries.trevorblades.com/',
    httpClient: AxiosClient(axios),
  },
  httpClient: FetchClient(fetch),
})

// SQL -- Postgres

test('Postgres - lookup single string', async () => {
  const expression = {
    operator: 'postgres',
    children: ["SELECT contact_name FROM customers where customer_id = 'FAMIA';"],
    single: true,
    flatten: true,
  }
  const result = await exp.evaluate(expression)
  expect(result).toBe('Aria Cruz')
})

// Deprecated syntax, keeping for backwards compatibility
test('Postgres - lookup single string (deprecated syntax)', () => {
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
    single: true,
    flatten: true,
    type: 'number',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe(9)
  })
})

// Deprecated syntax, keeping for backwards compatibility
test('Postgres - count employees (deprecated syntax)', () => {
  const expression = {
    operator: 'postgres',
    children: ['SELECT COUNT(*) FROM employees'],
    type: 'number',
  }
  return exp.evaluate(expression).then((result) => {
    expect(result).toBe(9)
  })
})

const expectedProductResult = [
  'Chai',
  'Chang',
  'Guaraná Fantástica',
  'Côte de Blaye',
  'Chartreuse verte',
  'Ipoh Coffee',
  'Outback Lager',
  'Rhönbräu Klosterbier',
  'Lakkalikööri',
]

test('Postgres - get list of (most) products', async () => {
  const expression = {
    operator: 'pgSQL',
    query: 'SELECT product_name FROM products WHERE category_id = $1 AND supplier_id != $2',
    values: [1, 16],
    flatten: true,
  }
  const result = await exp.evaluate(expression)
  expect(result).toStrictEqual(expectedProductResult)

  const expressionWithChildren = {
    operator: 'pgSQL',
    children: [
      'SELECT product_name FROM products WHERE category_id = $1 AND supplier_id != $2',
      1,
      16,
    ],
    flatten: true,
  }
  const resultFromChildren = await exp.evaluate(expressionWithChildren)
  expect(resultFromChildren).toStrictEqual(expectedProductResult)
})

// Deprecated syntax, keeping for backwards compatibility
test('Postgres - get list of (most) products, using properties (deprecated syntax)', async () => {
  const expression = {
    operator: 'pgSQL',
    query: 'SELECT product_name FROM public.products WHERE category_id = $1 AND supplier_id != $2',
    values: [1, 16],
    type: 'array',
  }
  const result = await exp.evaluate(expression)
  expect(result).toStrictEqual(expectedProductResult)

  // with [children]
  const expression2 = {
    operator: 'pgSQL',
    children: [
      'SELECT product_name FROM public.products WHERE category_id = $1 AND supplier_id != $2',
      1,
      16,
    ],
    type: 'array',
  }
  const result2 = await exp.evaluate(expression2)
  expect(result2).toStrictEqual(expectedProductResult)
})

test('Postgres - test single and flattening with multiple records', async () => {
  const expression = {
    operator: 'sql',
    children: ['SELECT * FROM shippers;'],
  }
  const result = await exp.evaluate(expression)
  expect(result).toStrictEqual([
    {
      shipper_id: 1,
      company_name: 'Speedy Express',
      phone: '(503) 555-9831',
    },
    {
      shipper_id: 2,
      company_name: 'United Package',
      phone: '(503) 555-3199',
    },
    {
      shipper_id: 3,
      company_name: 'Federal Shipping',
      phone: '(503) 555-9931',
    },
    {
      shipper_id: 4,
      company_name: 'Alliance Shippers',
      phone: '1-800-222-0451',
    },
    {
      shipper_id: 5,
      company_name: 'UPS',
      phone: '1-800-782-7892',
    },
    {
      shipper_id: 6,
      company_name: 'DHL',
      phone: '1-800-225-5345',
    },
  ])

  const expression2 = {
    operator: 'sql',
    query: 'SELECT * FROM shippers;',
    single: true,
  }
  const result2 = await exp.evaluate(expression2)
  expect(result2).toStrictEqual({
    shipper_id: 1,
    company_name: 'Speedy Express',
    phone: '(503) 555-9831',
  })

  const expression3 = {
    operator: 'sql',
    children: ['SELECT * FROM shippers;'],
    flatten: true,
  }
  const result3 = await exp.evaluate(expression3)
  expect(result3).toStrictEqual([
    [1, 'Speedy Express', '(503) 555-9831'],
    [2, 'United Package', '(503) 555-3199'],
    [3, 'Federal Shipping', '(503) 555-9931'],
    [4, 'Alliance Shippers', '1-800-222-0451'],
    [5, 'UPS', '1-800-782-7892'],
    [6, 'DHL', '1-800-225-5345'],
  ])

  const expression4 = {
    operator: 'sql',
    query: 'SELECT * FROM shippers;',
    single: true,
    flatten: true,
  }
  const result4 = await exp.evaluate(expression4)
  expect(result4).toStrictEqual([1, 'Speedy Express', '(503) 555-9831'])
})

test('Postgres - test single and flattening with single result record', async () => {
  const expression = {
    operator: 'sql',
    children: ['SELECT * FROM shippers WHERE shipper_id = $1;', 6],
  }
  const result = await exp.evaluate(expression)
  expect(result).toStrictEqual([
    {
      shipper_id: 6,
      company_name: 'DHL',
      phone: '1-800-225-5345',
    },
  ])

  const expression2 = {
    operator: 'sql',
    query: 'SELECT * FROM shippers WHERE shipper_id = $1;',
    values: [6],
    single: true,
  }
  const result2 = await exp.evaluate(expression2)
  expect(result2).toStrictEqual({
    shipper_id: 6,
    company_name: 'DHL',
    phone: '1-800-225-5345',
  })

  const expression3 = {
    operator: 'sql',
    children: ['SELECT * FROM shippers WHERE shipper_id = $1;', 6],
    flatten: true,
  }
  const result3 = await exp.evaluate(expression3)
  expect(result3).toStrictEqual([[6, 'DHL', '1-800-225-5345']])

  const expression4 = {
    operator: 'sql',
    query: 'SELECT * FROM shippers WHERE shipper_id = $1;',
    values: [6],
    single: true,
    flatten: true,
  }
  const result4 = await exp.evaluate(expression4)
  expect(result4).toStrictEqual([6, 'DHL', '1-800-225-5345'])
})

// SQLite

test('SQLite - lookup single string', async () => {
  const expression = {
    operator: 'postgres',
    children: ["SELECT contact_name FROM customers where customer_id = 'FAMIA';"],
    single: true,
    flatten: true,
  }
  const result = await expSqlite.evaluate(expression)
  expect(result).toBe('Aria Cruz')
})

test('SQLite - get an array of Orders using var substitution', async () => {
  const expression = {
    operator: 'pg',
    children: [
      'SELECT order_id, order_date, ship_city, ship_country FROM orders WHERE customer_id = ? AND order_id < 10500;',
      'FAMIA',
    ],
  }
  const result = await expSqlite.evaluate(expression)
  expect(result).toEqual([
    {
      order_id: 10347,
      order_date: '1996-11-06',
      ship_city: 'Sao Paulo',
      ship_country: 'Brazil',
    },
    {
      order_id: 10386,
      order_date: '1996-12-18',
      ship_city: 'Sao Paulo',
      ship_country: 'Brazil',
    },
    {
      order_id: 10414,
      order_date: '1997-01-14',
      ship_city: 'Sao Paulo',
      ship_country: 'Brazil',
    },
  ])
})

test('SQLite - count employees', () => {
  const expression = {
    operator: 'postgres',
    children: ['SELECT COUNT(*) FROM employees'],
    single: true,
    flatten: true,
    type: 'number',
  }
  return expSqlite.evaluate(expression).then((result) => {
    expect(result).toBe(9)
  })
})

test('SQLite - get list of (most) products', async () => {
  const expression = {
    operator: 'pgSQL',
    query: 'SELECT product_name FROM products WHERE category_id = $1 AND supplier_id != $2',
    values: [1, 16],
    flatten: true,
  }
  const result = await expSqlite.evaluate(expression)
  expect(result).toStrictEqual(expectedProductResult)
  const expressionWithChildren = {
    operator: 'pgSQL',
    children: [
      'SELECT product_name FROM products WHERE category_id = $1 AND supplier_id != $2',
      1,
      16,
    ],
    flatten: true,
  }

  const resultFromChildren = await expSqlite.evaluate(expressionWithChildren)
  expect(resultFromChildren).toStrictEqual(expectedProductResult)
})

test('SQLite - test single and flattening with multiple records', async () => {
  const expression = {
    operator: 'sql',
    children: ['SELECT * FROM shippers;'],
  }
  const result = await expSqlite.evaluate(expression)
  expect(result).toMatchObject([
    {
      shipper_id: 1,
      company_name: 'Speedy Express',
      phone: '(503) 555-9831',
    },
    {
      shipper_id: 2,
      company_name: 'United Package',
      phone: '(503) 555-3199',
    },
    {
      shipper_id: 3,
      company_name: 'Federal Shipping',
      phone: '(503) 555-9931',
    },
    {
      shipper_id: 4,
      company_name: 'Alliance Shippers',
      phone: '1-800-222-0451',
    },
    {
      shipper_id: 5,
      company_name: 'UPS',
      phone: '1-800-782-7892',
    },
    {
      shipper_id: 6,
      company_name: 'DHL',
      phone: '1-800-225-5345',
    },
  ])

  const expression2 = {
    operator: 'sql',
    query: 'SELECT * FROM shippers;',
    single: true,
  }
  const result2 = await expSqlite.evaluate(expression2)
  expect(result2).toMatchObject({
    shipper_id: 1,
    company_name: 'Speedy Express',
    phone: '(503) 555-9831',
  })

  const expression3 = {
    operator: 'sql',
    children: ['SELECT * FROM shippers;'],
    flatten: true,
  }
  const result3 = await expSqlite.evaluate(expression3)
  expect(result3).toMatchObject([
    [1, 'Speedy Express', '(503) 555-9831'],
    [2, 'United Package', '(503) 555-3199'],
    [3, 'Federal Shipping', '(503) 555-9931'],
    [4, 'Alliance Shippers', '1-800-222-0451'],
    [5, 'UPS', '1-800-782-7892'],
    [6, 'DHL', '1-800-225-5345'],
  ])

  const expression4 = {
    operator: 'sql',
    query: 'SELECT * FROM shippers;',
    single: true,
    flatten: true,
  }
  const result4 = await expSqlite.evaluate(expression4)
  expect(result4).toMatchObject([1, 'Speedy Express', '(503) 555-9831'])
})

test('SQLite - test single and flattening with single result record', async () => {
  const expression = {
    operator: 'sql',
    children: ['SELECT * FROM shippers WHERE shipper_id = $1;', 6],
  }
  const result = await expSqlite.evaluate(expression)
  expect(result).toMatchObject([
    {
      shipper_id: 6,
      company_name: 'DHL',
      phone: '1-800-225-5345',
    },
  ])

  const expression2 = {
    operator: 'sql',
    query: 'SELECT * FROM shippers WHERE shipper_id = $1;',
    values: [6],
    single: true,
  }
  const result2 = await expSqlite.evaluate(expression2)
  expect(result2).toMatchObject({
    shipper_id: 6,
    company_name: 'DHL',
    phone: '1-800-225-5345',
  })

  const expression3 = {
    operator: 'sql',
    children: ['SELECT * FROM shippers WHERE shipper_id = $1;', 6],
    flatten: true,
  }
  const result3 = await expSqlite.evaluate(expression3)
  expect(result3).toMatchObject([[6, 'DHL', '1-800-225-5345']])

  const expression4 = {
    operator: 'sql',
    query: 'SELECT * FROM shippers WHERE shipper_id = $1;',
    values: [6],
    single: true,
    flatten: true,
  }
  const result4 = await expSqlite.evaluate(expression4)
  expect(result4).toMatchObject([6, 'DHL', '1-800-225-5345'])
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
  exp.updateOptions({ httpClient: AxiosClient(axios) })
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
    httpClient: AxiosClient(axios),
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
