import { Client } from 'pg'
import ExpressionEvaluator from '../evaluator'
import evaluator, { evaluateExpression } from '../evaluator'
import pgConfig from '../test/postgres/pgConfig.json'

/*
For testing/playing round during development. Use `yarn ts-node src/dev/playground.ts` to run
*/

// Uncomment if required
// const pgConnect = new Client(pgConfig)
// pgConnect.connect()

const exp = new ExpressionEvaluator({
  // APIfetch: fetch,
  // pgConnection: pgConnect,
  // graphQLConnection: {
  //   fetch: fetch,
  //   endpoint: 'https://countries.trevorblades.com/',
  // },
  objects: {
    user: { name: 'Iron Man' },
  },
})

const expression = {
  operator: 'getProperty',
  path: 'user.name',
}

exp
  .evaluate(expression, {
    // allowJSONStringInput: true,
    // returnErrorAsString: true,
  })
  .then((res) => console.log(res))
// .then(() => pgConnect.end())
