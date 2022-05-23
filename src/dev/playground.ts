import fetch from 'node-fetch'
import { Client } from 'pg'
import ExpressionEvaluator from '../evaluator'
import evaluateExpression from '../evaluateExpression'
import pgConfig from '../test/postgres/pgConfig.json'

/*
For testing/playing round during development. Use `yarn ts-node src/dev/playground.ts` to run
*/

// Uncomment if required
// const pgConnect = new Client(pgConfig)
// pgConnect.connect()

const exp = new ExpressionEvaluator({
  APIfetch: fetch,
  // pgConnection: pgConnect,
  graphQLConnection: {
    fetch: fetch,
    endpoint: 'https://countries.trevorblades.com/',
  },
  objects: {
    user: { name: 'Iron Man' },
  },
})

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
          children: ['https://restcountries.com/v3.1/name/india', [], '[1].cca2'],
        },
      },
    ],
  },
  returnNode: 'countries[0].emoji',
}

exp
  .evaluate(expression, {
    // allowJSONStringInput: true,
    // returnErrorAsString: true,
  })
  .then((res) => console.log(res))
// .then(() => pgConnect.end())
