import fetch from 'node-fetch'
import { Client } from 'pg'
import ExpressionEvaluator from '../evaluator'
import evaluateExpression from '../evaluateExpression'
import pgConfig from '../test/postgres/pgConfig.json'

// const pgConnect = new Client(pgConfig)

// pgConnect.connect()

const exp = new ExpressionEvaluator({
  //   pgConnection: pgConnect,
  graphQLConnection: {
    fetch: fetch,
    endpoint: 'https://countries.trevorblades.com/',
  },
})

const expression = {
  operator: 'OR',
  children: 2,
}

exp
  .evaluate(expression, {
    returnErrorAsString: true,
  })
  .then((res) => console.log(res))
//   .then(() => pgConnect.end())
