import { Client } from 'pg'
import FigTreeEvaluator from '../'
import evaluator, { evaluateExpression } from '../'
import pgConfig from '../../test/postgres/pgConfig.json'

/*
For testing/playing round during development. Use `yarn dev` to run
Don't edit this file directly -- a copy (playground.ts) will
be created the first time you run `yarn dev`.
*/

// Uncomment if required
// const pgConnect = new Client(pgConfig)
// pgConnect.connect()

const exp = new FigTreeEvaluator({
  // pgConnection: pgConnect,
  // graphQLConnection: {
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
